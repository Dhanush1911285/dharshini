from flask import Flask, render_template, request, redirect, session, flash
import cloudinary
import cloudinary.uploader
import psycopg2
import bcrypt
import os
import re
from datetime import timedelta
from flask_mail import Mail, Message
from itsdangerous import URLSafeTimedSerializer
from dotenv import load_dotenv

# ---------------- LOAD ENV ----------------
load_dotenv()

# ---------------- APP ----------------
app = Flask(__name__)

app.secret_key = os.getenv("SECRET_KEY", "fallback-secret")
app.permanent_session_lifetime = timedelta(days=7)

app.config['SESSION_COOKIE_HTTPONLY'] = True
app.config['SESSION_COOKIE_SECURE'] = False  # change True in production
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'

# ---------------- BASE URL ----------------
BASE_URL = os.getenv("BASE_URL")

# ---------------- DB ----------------
DATABASE_URL = os.getenv("DATABASE_URL")
conn = psycopg2.connect(DATABASE_URL)
cur = conn.cursor()

cur.execute("""
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username TEXT,
    email TEXT UNIQUE,
    password TEXT,
    verified BOOLEAN DEFAULT FALSE
)
""")
conn.commit()

# ---------------- MAIL CONFIG ----------------
app.config['MAIL_SERVER'] = 'smtp.gmail.com'
app.config['MAIL_PORT'] = 587
app.config['MAIL_USE_TLS'] = True
app.config['MAIL_USERNAME'] = os.getenv("EMAIL_USER")
app.config['MAIL_PASSWORD'] = os.getenv("EMAIL_PASS")

mail = Mail(app)

serializer = URLSafeTimedSerializer(app.secret_key)

# ---------------- EMAIL FUNCTION ----------------
def send_email(to, subject, body):
    msg = Message(
        subject,
        sender=app.config['MAIL_USERNAME'],
        recipients=[to]
    )
    msg.body = body
    mail.send(msg)

# ---------------- CLOUDINARY ----------------
cloudinary.config(
    cloud_name=os.getenv("CLOUD_NAME"),
    api_key=os.getenv("CLOUD_KEY"),
    api_secret=os.getenv("CLOUD_SECRET")
)

# ---------------- ROUTES ----------------

@app.route('/')
def index():
    if "user_id" in session:
        return redirect('/camera')
    return redirect('/login')

# ---------------- LOGIN ----------------
@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'GET':
        return render_template("login.html")

    email = request.form.get("email")
    password = request.form.get("password")

    cur.execute("SELECT * FROM users WHERE email=%s", (email,))
    user = cur.fetchone()

    if user:
        if not user[4]:
            flash("Please verify your email first 📧")
            return redirect('/login')

        if bcrypt.checkpw(password.encode('utf-8'), user[3].encode('utf-8')):
            session.permanent = True
            session['user_id'] = user[0]
            session['username'] = user[1]
            return redirect('/camera')
        else:
            flash("Wrong password 😬")
            return redirect('/login')
    else:
        flash("User not found 😢")
        return redirect('/login')

# ---------------- SIGNUP ----------------
@app.route('/signup', methods=['GET', 'POST'])
def signup():
    if request.method == 'GET':
        return render_template("signup.html")

    username = request.form.get("username")
    email = request.form.get("email")
    password = request.form.get("password")

    # Password validation
    if len(password) < 8:
        return render_template("signup.html", error="Min 8 characters")
    if not re.search(r"[A-Z]", password):
        return render_template("signup.html", error="Need uppercase")
    if not re.search(r"[0-9]", password):
        return render_template("signup.html", error="Need number")
    if not re.search(r"[!@#$%^&*]", password):
        return render_template("signup.html", error="Need special char")

    # Check existing user
    cur.execute("SELECT * FROM users WHERE email=%s", (email,))
    if cur.fetchone():
        return render_template("signup.html", error="Email already exists")

    # Hash password
    hashed = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt())

    cur.execute(
        "INSERT INTO users (username, email, password) VALUES (%s, %s, %s)",
        (username, email, hashed.decode('utf-8'))
    )
    conn.commit()

    # Send verification email
    token = serializer.dumps(email, salt='email-confirm')
    link = f"{BASE_URL}/verify/{token}"

    send_email(email, "Verify Email", f"Click to verify: {link}")

    flash("Check your email to verify 📧")
    return redirect('/login')

# ---------------- VERIFY ----------------
@app.route('/verify/<token>')
def verify(token):
    try:
        email = serializer.loads(token, salt='email-confirm', max_age=3600)
        cur.execute("UPDATE users SET verified=TRUE WHERE email=%s", (email,))
        conn.commit()
        return "Email verified 🎉"
    except:
        return "Invalid/Expired link"

# ---------------- FORGOT PASSWORD ----------------
@app.route('/forgot', methods=['GET', 'POST'])
def forgot():
    if request.method == 'GET':
        return render_template("forgot.html")

    email = request.form.get("email")

    token = serializer.dumps(email, salt='reset-password')
    link = f"{BASE_URL}/reset/{token}"

    send_email(email, "Reset Password", f"Reset here: {link}")

    flash("Reset link sent 📧")
    return redirect('/login')

# ---------------- RESET PASSWORD ----------------
@app.route('/reset/<token>', methods=['GET', 'POST'])
def reset(token):
    try:
        email = serializer.loads(token, salt='reset-password', max_age=3600)

        if request.method == 'POST':
            new_password = request.form.get("password")

            if len(new_password) < 8:
                return "Min 8 characters"
            if not re.search(r"[A-Z]", new_password):
                return "Need uppercase"
            if not re.search(r"[0-9]", new_password):
                return "Need number"
            if not re.search(r"[!@#$%^&*]", new_password):
                return "Need special char"

            hashed = bcrypt.hashpw(new_password.encode('utf-8'), bcrypt.gensalt())

            cur.execute(
                "UPDATE users SET password=%s WHERE email=%s",
                (hashed.decode('utf-8'), email)
            )
            conn.commit()

            flash("Password updated ✅")
            return redirect('/login')

        return '''
        <form method="POST">
            <input name="password" placeholder="New password">
            <button>Reset</button>
        </form>
        '''
    except:
        return "Invalid/Expired link"

# ---------------- CAMERA ----------------
@app.route('/camera')
def camera():
    if 'user_id' not in session:
        return redirect('/login')
    return render_template("camera.html", username=session['username'])

# ---------------- UPLOAD ----------------
@app.route('/upload', methods=['POST'])
def upload():
    file = request.files['photo']
    result = cloudinary.uploader.upload(file)
    return result['secure_url']

# ---------------- LOGOUT ----------------
@app.route('/logout')
def logout():
    session.clear()
    return redirect('/login')

# ---------------- RUN ----------------
if __name__ == "__main__":
    port = int(os.environ.get("PORT", 10000))
    app.run(host="0.0.0.0", port=port)
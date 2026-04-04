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
app.config['SESSION_COOKIE_SECURE'] = False
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'

# ---------------- BASE URL ----------------
BASE_URL = os.getenv("BASE_URL") or "http://localhost:10000"

# ---------------- DB ----------------
DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    raise Exception("DATABASE_URL is missing!")

try:
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

except Exception as e:
    print("DB ERROR:", e)

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
    try:
        msg = Message(subject,
                      sender=app.config['MAIL_USERNAME'],
                      recipients=[to])
        msg.body = body
        mail.send(msg)
    except Exception as e:
        print("MAIL ERROR:", e)

# ---------------- CLOUDINARY ----------------
cloudinary.config(
    cloud_name=os.getenv("CLOUD_NAME"),
    api_key=os.getenv("CLOUD_KEY"),
    api_secret=os.getenv("CLOUD_SECRET")
)

# ---------------- ROUTES ----------------

@app.route('/')
def index():
    return redirect('/login')

# ---------------- LOGIN ----------------
@app.route('/login', methods=['GET', 'POST'])
def login():
    try:
        if request.method == 'GET':
            return render_template("login.html")

        email = request.form.get("email")
        password = request.form.get("password")

        cur.execute("SELECT * FROM users WHERE email=%s", (email,))
        user = cur.fetchone()

        if user:
            if not user[4]:
                flash("Verify your email first 📧")
                return redirect('/login')

            if bcrypt.checkpw(password.encode(), user[3].encode()):
                session.permanent = True
                session['user_id'] = user[0]
                session['username'] = user[1]
                return redirect('/camera')

        flash("Invalid login ❌")
        return redirect('/login')

    except Exception as e:
        return f"LOGIN ERROR: {str(e)}"

# ---------------- SIGNUP ----------------
@app.route('/signup', methods=['GET', 'POST'])
def signup():
    try:
        if request.method == 'GET':
            return render_template("signup.html")

        username = request.form.get("username")
        email = request.form.get("email")
        password = request.form.get("password")

        if len(password) < 8:
            return "Min 8 characters"

        if not re.search(r"[A-Z]", password):
            return "Need uppercase"

        if not re.search(r"[0-9]", password):
            return "Need number"

        if not re.search(r"[!@#$%^&*]", password):
            return "Need special char"

        cur.execute("SELECT * FROM users WHERE email=%s", (email,))
        if cur.fetchone():
            return "Email exists"

        hashed = bcrypt.hashpw(password.encode(), bcrypt.gensalt())

        cur.execute(
            "INSERT INTO users (username, email, password) VALUES (%s, %s, %s)",
            (username, email, hashed.decode())
        )
        conn.commit()

        token = serializer.dumps(email, salt='email-confirm')
        link = f"{BASE_URL}/verify/{token}"

        send_email(email, "Verify Email", f"Click: {link}")

        return "Signup success! Check email."

    except Exception as e:
        return f"SIGNUP ERROR: {str(e)}"

# ---------------- VERIFY ----------------
@app.route('/verify/<token>')
def verify(token):
    try:
        email = serializer.loads(token, salt='email-confirm', max_age=3600)
        cur.execute("UPDATE users SET verified=TRUE WHERE email=%s", (email,))
        conn.commit()
        return "Email verified 🎉"
    except Exception as e:
        return f"VERIFY ERROR: {str(e)}"

# ---------------- CAMERA ----------------
@app.route('/camera')
def camera():
    if 'user_id' not in session:
        return redirect('/login')
    return render_template("camera.html")

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
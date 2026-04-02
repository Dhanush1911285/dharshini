from flask import Flask, render_template, request, redirect, session
import cloudinary
import cloudinary.uploader

import psycopg2

DATABASE_URL = "postgresql://dhanush:UfWi0vMzCdi7QnUeybfQB8DTW7EJw5QA@dpg-d77bq9mdqaus73bmcam0-a.singapore-postgres.render.com/delulu"
conn = psycopg2.connect(DATABASE_URL)
cur = conn.cursor()

print("Database connected 😏🔥")

cur.execute("""
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username TEXT,
    email TEXT UNIQUE,
    password TEXT
)
""")

conn.commit()
app = Flask(__name__)
app.secret_key = "secret123"

# Cloudinary config (you will fill later)
cloudinary.config(
    cloud_name="YOUR_NAME",
    api_key="YOUR_KEY",
    api_secret="YOUR_SECRET"
)

from flask import Flask, render_template, request, redirect, session
@app.route('/')
def home():
    if "user" in session:
        return redirect('/camera')
    return render_template("login.html")

@app.route('/login', methods=['POST'])
def login():
    email = request.form.get("email")
    password = request.form.get("password")

    cur.execute(
        "SELECT * FROM users WHERE email=%s AND password=%s",
        (email, password)
    )
    user = cur.fetchone()

    if user:
        session["user"] = user[1]  # username
        return redirect('/camera')
    else:
        return "Invalid login ❌"

@app.route('/signup', methods=['POST'])
def signup():
    username = request.form.get("username")
    email = request.form.get("email")
    password = request.form.get("password")

    cur.execute(
        "INSERT INTO users (username, email, password) VALUES (%s, %s, %s)",
        (username, email, password)
    )
    conn.commit()

    return "Signup successful 😏"

@app.route('/camera')
def camera():
    if "user" not in session:
        return redirect('/')
    return render_template("camera.html", user=session["user"])


@app.route('/upload', methods=['POST'])
def upload():
    file = request.files['photo']
    result = cloudinary.uploader.upload(file)
    return result['secure_url']


@app.route('/logout')
def logout():
    session.clear()
    return redirect('/')
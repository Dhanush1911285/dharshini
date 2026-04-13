
from flask import Flask, render_template, request, redirect, session, flash, jsonify
import cloudinary
import cloudinary.uploader
import psycopg2
import bcrypt
import os
import re
import base64
import binascii
import io
import logging
from datetime import timedelta
from dotenv import load_dotenv
from werkzeug.middleware.proxy_fix import ProxyFix

# ---------------- LOAD ENV ----------------
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(BASE_DIR, ".env"))

# ---------------- APP ----------------
app = Flask(__name__)

SECRET_KEY = os.getenv("SECRET_KEY")
if not SECRET_KEY:
    raise RuntimeError("SECRET_KEY is missing!")

is_production = (
    os.getenv("RENDER") == "true"
    or os.getenv("FLASK_ENV") == "production"
    or os.getenv("ENV") == "production"
)

app.secret_key = SECRET_KEY
app.permanent_session_lifetime = timedelta(days=7)
app.wsgi_app = ProxyFix(app.wsgi_app, x_proto=1, x_host=1)

app.config.update(
    SESSION_PERMANENT=True,
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SECURE=is_production,
    SESSION_COOKIE_SAMESITE='Lax'
)
app.logger.setLevel(logging.INFO)

# ---------------- DB ----------------
DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    raise Exception("DATABASE_URL is missing!")

conn = psycopg2.connect(DATABASE_URL, sslmode='require')
cur = conn.cursor()

cur.execute("""
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username TEXT,
    email TEXT UNIQUE,
    password TEXT
)
""")
conn.commit()

# ---------------- CLOUDINARY ----------------
def configure_cloudinary():
    cloud_name = os.getenv("CLOUDINARY_CLOUD_NAME")
    api_key = os.getenv("CLOUDINARY_API_KEY")
    api_secret = os.getenv("CLOUDINARY_API_SECRET")

    print("Cloud Name:", os.getenv("CLOUDINARY_CLOUD_NAME"))

    missing = []
    if not cloud_name:
        missing.append("CLOUDINARY_CLOUD_NAME")
    if not api_key:
        missing.append("CLOUDINARY_API_KEY")
    if not api_secret:
        missing.append("CLOUDINARY_API_SECRET")

    if missing:
        raise RuntimeError(
            "Missing Cloudinary environment variables: " + ", ".join(missing)
        )

    cloudinary.config(
        cloud_name=os.getenv("CLOUDINARY_CLOUD_NAME"),
        api_key=os.getenv("CLOUDINARY_API_KEY"),
        api_secret=os.getenv("CLOUDINARY_API_SECRET")
    )

    return {"cloud_name": cloud_name, "api_key": api_key, "api_secret": api_secret}


def decode_base64_image(image_data_url):
    if not image_data_url or "," not in image_data_url:
        raise ValueError("Invalid image payload")

    header, encoded_image = image_data_url.split(",", 1)

    if ";base64" not in header:
        raise ValueError("Image payload is not base64 encoded")

    try:
        return base64.b64decode(encoded_image, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise ValueError("Invalid base64 image data") from exc

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

        cur.execute("SELECT id, username, password FROM users WHERE email=%s", (email,))
        user = cur.fetchone()

        if not user:
            flash("User not found ❌")
            return redirect('/login')

        user_id, username, hashed_pw = user

        if not bcrypt.checkpw(password.encode(), hashed_pw.encode()):
            flash("Wrong password ❌")
            return redirect('/login')

        session.permanent = True
        session['user_id'] = user_id
        session['username'] = username

        return redirect('/camera')

    except Exception as e:
        conn.rollback()
        print("LOGIN ERROR:", e)
        return "Login failed"

# ---------------- SIGNUP ----------------
@app.route('/signup', methods=['GET', 'POST'])
def signup():
    try:
        if request.method == 'GET':
            return render_template("signup.html")

        username = request.form.get("username")
        email = request.form.get("email")
        password = request.form.get("password")

        # password validation
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
            flash("Email already registered")
            return redirect('/login')

        hashed = bcrypt.hashpw(password.encode(), bcrypt.gensalt())

        cur.execute(
            "INSERT INTO users (username, email, password) VALUES (%s, %s, %s)",
            (username, email, hashed.decode())
        )
        conn.commit()

        flash("Signup successful")
        return redirect('/login')

    except Exception as e:
        conn.rollback()
        print("SIGNUP ERROR:", e)
        return "Signup failed"

# ---------------- CAMERA ----------------
@app.route('/camera')
def camera():
    if 'user_id' not in session:
        return redirect('/login')
    return render_template("camera.html")

# ---------------- UPLOAD ----------------
@app.route("/upload", methods=["POST"])
def upload():
    try:
        config = configure_cloudinary()
        payload = request.get_json(silent=True) or {}
        image_data_url = payload.get("image")

        if not image_data_url:
            app.logger.error("UPLOAD ERROR: missing image field in JSON payload")
            return jsonify({"error": "No image received"}), 400

        image_bytes = decode_base64_image(image_data_url)
        file = io.BytesIO(image_bytes)
        app.logger.info(
            "Upload request received: payload_chars=%s decoded_bytes=%s cloud_name=%s api_key_present=%s api_secret_present=%s",
            len(image_data_url),
            len(image_bytes),
            config["cloud_name"],
            bool(config["api_key"]),
            bool(config["api_secret"])
        )

        try:
            result = cloudinary.uploader.upload(file)
        except Exception as e:
            app.logger.exception("UPLOAD ERROR: Cloudinary upload failed")
            return jsonify({"error": f"Cloudinary upload failed: {str(e)}"}), 500

        secure_url = result.get("secure_url")
        if not secure_url:
            app.logger.error("UPLOAD ERROR: Cloudinary response missing secure_url: %s", result)
            return jsonify({"error": "Upload succeeded but no URL was returned"}), 502

        app.logger.info("Upload successful: secure_url=%s public_id=%s", secure_url, result.get("public_id"))
        return jsonify({"secure_url": secure_url}), 200

    except ValueError as e:
        app.logger.exception("UPLOAD ERROR: invalid image payload")
        return jsonify({"error": str(e)}), 400
    except RuntimeError as e:
        app.logger.exception("UPLOAD ERROR: Cloudinary configuration issue")
        return jsonify({"error": str(e)}), 500
    except Exception as e:
        app.logger.exception("UPLOAD ERROR: unexpected failure during Cloudinary upload")
        return jsonify({"error": f"Upload failed: {str(e)}"}), 500

# ---------------- LOGOUT ----------------
@app.route('/logout')
def logout():
    session.clear()
    return redirect('/login')

# ---------------- RUN ----------------
if __name__ == "__main__":
    port = int(os.environ.get("PORT", 10000))
    app.run(host="0.0.0.0", port=port, debug=True)

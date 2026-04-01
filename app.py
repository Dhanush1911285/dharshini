from flask import Flask, render_template, request, redirect, session
import cloudinary
import cloudinary.uploader

app = Flask(__name__)
app.secret_key = "secret123"

# Cloudinary config (you will fill later)
cloudinary.config(
    cloud_name="YOUR_NAME",
    api_key="YOUR_KEY",
    api_secret="YOUR_SECRET"
)

@app.route('/')
def home():
    if 'user' in session:
        return redirect('/camera')
    return render_template("login.html")

@app.route('/login', methods=['POST'])
def login():
    username = request.form['username']
    session['user'] = username
    return redirect('/camera')

@app.route('/camera')
def camera():
    if 'user' not in session:
        return redirect('/')
    return render_template("camera.html")

@app.route('/upload', methods=['POST'])
def upload():
    file = request.files['photo']
    result = cloudinary.uploader.upload(file)
    return result['secure_url']

@app.route('/logout')
def logout():
    session.clear()
    return redirect('/')

if __name__ == '__main__':
    app.run()
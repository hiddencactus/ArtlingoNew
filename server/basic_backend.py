from flask import Flask, request, jsonify
from flask_cors import CORS
from PIL import Image
import io
import os

# Probably could be made much better but it's just to test that the images are being properly recieved from the frontend 
# so we can start working on the model
app = Flask(__name__)
CORS(app)  # allow requests from dev server

@app.route("/", methods=["GET"])
def root():
  return jsonify({"status": "ArtLingo debug backend running"})

@app.route("/api/analyze", methods=["POST"])
def analyze():
  if "file" not in request.files:
    return jsonify({"error": "No file provided"}), 400

  file = request.files["file"]

  try:
    img_bytes = file.read()
    img = Image.open(io.BytesIO(img_bytes)).convert("RGBA")

    # Save whatever the backend actually received from the canvas
    os.makedirs("debug_uploads", exist_ok=True)
    debug_path = os.path.join("debug_uploads", "latest.png")
    img.save(debug_path)
    print("Saved debug image to:", debug_path)
    print("Canvas image received!")

    return jsonify({
      "success": True,
      "message": "Image received and saved for debug",
      "debug_path": debug_path
    })

  except Exception as e:
    print("Analysis error:", e)
    return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
  app.run(host="0.0.0.0", port=5000, debug=True)

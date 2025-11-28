from flask import Flask, request, jsonify
from flask_cors import CORS
from PIL import Image
import io
import base64
import os

app = Flask(__name__)
CORS(app)

def pil_to_base64(img):
    # Convert PIL image to base64 PNG 
    buffer = io.BytesIO()
    img.save(buffer, format="PNG")
    return base64.b64encode(buffer.getvalue()).decode("utf-8")

@app.route("/", methods=["GET"])
def root():
    return jsonify({"status": "ArtLingo backend running"})

@app.route("/api/analyze", methods=["POST"])
def analyze():
    if "file" not in request.files:
        return jsonify({"error": "No file provided"}), 400

    file = request.files["file"]

    try:
        # Read uploaded canvas image
        img_bytes = file.read()
        img = Image.open(io.BytesIO(img_bytes)).convert("RGBA")

        # Save a debug copy of whatever the backend actually received
        os.makedirs("debug_uploads", exist_ok=True)
        debug_path = os.path.join("debug_uploads", "latest.png")
        img.save(debug_path)
        print("Saved debug image to:", debug_path)

        # Temporary placeholder model output
        result = {
            "success": True,
            "suggested_color": "#E4572E",
            "overlay_strength": 0.65,
            "preview": pil_to_base64(img)
        }

        return jsonify(result)

    except Exception as e:
        # Any error during image processing or analysis
        print("Analysis error:", e)
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    # Dev server
    app.run(host="0.0.0.0", port=5000, debug=True)

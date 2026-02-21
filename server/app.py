
from flask import Flask, request, jsonify
from flask_cors import CORS

from ml.inference import run_inference

app = Flask(__name__)
CORS(app)

@app.post("/api/analyze")
def analyze():
    if "file" not in request.files:
        return jsonify({"success": False, "error": True, "message": "No file field 'file'"}), 400

    f = request.files["file"]
    img_bytes = f.read()
    result = run_inference(img_bytes)

    status = 200 if result.get("success") else 500
    return jsonify(result), status

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
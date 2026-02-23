
import json
import os
from typing import Any, Dict, List, Optional, Tuple

from flask import Flask, request, jsonify
from flask_cors import CORS

from ml.inference import run_inference

app = Flask(__name__)
CORS(app)

STATIC_DIR = os.path.join(os.path.dirname(__file__), "static")
IMAGE_SEARCH_DIRS = [
    "processed_images",
    "training_images",
    "uploads",
    "processed custom dataset 2",
    "custom dataset 2",
]


def _extract_meta_from_result(result: Dict[str, Any]) -> Optional[Dict[str, int]]:
    preprocess = result.get("debug", {}).get("preprocess", {})
    required = ("target_size", "resized_width", "resized_height", "pad_left", "pad_top")
    if not all(k in preprocess for k in required):
        return None
    return {k: int(preprocess[k]) for k in required}


def _load_sidecar_meta(image_path: str) -> Optional[Dict[str, int]]:
    meta_path = f"{image_path}.json"
    if not os.path.isfile(meta_path):
        return None
    try:
        with open(meta_path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except Exception:
        return None

    required = ("target_size", "resized_width", "resized_height", "pad_left", "pad_top")
    if not all(k in data for k in required):
        return None
    return {k: int(data[k]) for k in required}


def _as_heatmap16x16(result: Dict[str, Any]) -> Optional[List[List[float]]]:
    heatmap = result.get("heatmaps", {}).get("issue")
    if not isinstance(heatmap, list) or len(heatmap) != 16:
        return None

    normalized: List[List[float]] = []
    for row in heatmap:
        if not isinstance(row, list) or len(row) != 16:
            return None
        normalized.append([float(max(0.0, min(1.0, float(v)))) for v in row])
    return normalized


def _top_k_tiles(heatmap16x16: List[List[float]], k: int = 8) -> List[Dict[str, float]]:
    flat = []
    for r, row in enumerate(heatmap16x16):
        for c, score in enumerate(row):
            flat.append({"row": r, "col": c, "score": float(score)})
    flat.sort(key=lambda x: x["score"], reverse=True)
    return flat[:k]


def _resolve_image_path(image_id: str) -> Tuple[Optional[str], Optional[str]]:
    safe_id = os.path.normpath(image_id).replace("\\", "/").lstrip("/")
    if safe_id.startswith("..") or safe_id == ".":
        return None, None

    if "/" in safe_id:
        candidate = os.path.normpath(os.path.join(STATIC_DIR, safe_id))
        static_root = os.path.normpath(STATIC_DIR)
        if os.path.commonpath([static_root, candidate]) == static_root and os.path.isfile(candidate):
            rel_path = os.path.relpath(candidate, STATIC_DIR).replace("\\", "/")
            return candidate, rel_path
        return None, None

    for folder in IMAGE_SEARCH_DIRS:
        candidate = os.path.join(STATIC_DIR, folder, safe_id)
        if os.path.isfile(candidate):
            rel_path = os.path.relpath(candidate, STATIC_DIR).replace("\\", "/")
            return candidate, rel_path
    return None, None


def _enrich_response(
    result: Dict[str, Any],
    image_url: Optional[str] = None,
    image_id: Optional[str] = None,
    image_path: Optional[str] = None,
) -> Dict[str, Any]:
    payload = dict(result)
    heatmap16x16 = _as_heatmap16x16(result)
    meta = _load_sidecar_meta(image_path) if image_path else None
    if meta is None:
        meta = _extract_meta_from_result(result)

    if image_url:
        payload["imageUrl"] = image_url
    if image_id:
        payload["imageId"] = image_id
    if heatmap16x16 is not None:
        payload["heatmap16x16"] = heatmap16x16
        payload["topTiles"] = _top_k_tiles(heatmap16x16)
    if meta is not None:
        payload["meta"] = meta

    return payload

@app.post("/api/analyze")
def analyze():
    if "file" not in request.files:
        return jsonify({"success": False, "error": True, "message": "No file field 'file'"}), 400

    f = request.files["file"]
    img_bytes = f.read()
    result = run_inference(img_bytes)
    result = _enrich_response(result)

    status = 200 if result.get("success") else 500
    return jsonify(result), status


@app.get("/api/suggestion/<path:image_id>")
def suggestion(image_id: str):
    image_path, rel_path = _resolve_image_path(image_id)
    if not image_path or not rel_path:
        return jsonify({
            "success": False,
            "error": True,
            "message": f"Image not found for imageId '{image_id}'",
        }), 404

    with open(image_path, "rb") as f:
        img_bytes = f.read()

    result = run_inference(img_bytes)
    image_url = f"/static/{rel_path}"
    payload = _enrich_response(
        result=result,
        image_url=image_url,
        image_id=image_id,
        image_path=image_path,
    )
    status = 200 if payload.get("success") else 500
    return jsonify(payload), status

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)

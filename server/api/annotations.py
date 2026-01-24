"""
==============================================================================
ANNOTATION API ENDPOINTS
==============================================================================
Handles saving and retrieving artist annotations.
==============================================================================
"""

import numpy as np
from flask import request, jsonify
from scipy.ndimage import gaussian_filter
from datetime import datetime

from db.storage import load_annotations, save_annotation, get_annotations_file
from api.images import image_exists, get_image_path
from ml.analyzer import HarmonyAnalyzer


def init_routes(app):
    """Register annotation routes with Flask app."""
    
    @app.route("/api/label", methods=["POST"])
    def save_annotation_endpoint():
        """
        PHASE 1: Save one artist's annotation for an image.
        
        WORKFLOW:
          1. Artist clicks 3 cells in 16x16 grid
          2. Backend votes: grid[row][col] += 1
          3. Apply Gaussian blur (sigma=0.5) to spread votes
          4. Normalize: blurred_grid / max(blurred_grid)
          5. Extract 256 patch metrics (line, value, harmony)
          6. Save to JSON: server/data/annotations/annotations_{image_id}.json
          7. When 4 artists complete = ready for consensus
        
        Request:
          {
            "image_id": "1.jpeg",
            "artist_id": "stephen",
            "clicks": [[x1, y1], [x2, y2], [x3, y3]]
          }
        
        Response:
          {
            "status": "saved",
            "artist_id": "stephen",
            "image_id": "1.jpeg",
            "annotations_count": 2,
            "progress": "2 of 4 artists labeled",
            "blurred_grid": [[0.9, ...], ...],
            "patches": [{metrics}, ...]
          }
        """
        data = request.json
        image_name = data.get("image_id")
        artist_id = data.get("artist_id", "anonymous")
        clicks = data.get("clicks", [])
        
        # Validate image exists
        if not image_exists(image_name):
            return jsonify({"error": f"Image not found: {image_name}"}), 404
        
        # Load image and create analyzer
        with open(get_image_path(image_name), 'rb') as f:
            analyzer = HarmonyAnalyzer(f.read())
        
        # === BUILD BLURRED GRID ===
        # Start with empty 16x16 grid
        grid = np.zeros((16, 16))
        
        # For each click, increment the cell (vote)
        for x, y in clicks:
            col, row = int(x // 32), int(y // 32)
            if 0 <= col < 16 and 0 <= row < 16:
                grid[row][col] += 1.0
        
        # Apply Gaussian blur to spread votes
        blurred = gaussian_filter(grid, sigma=0.5)
        
        # Normalize to 0-1 range
        if np.max(blurred) > 0:
            blurred = blurred / np.max(blurred)
        
        # === EXTRACT PATCH METRICS ===
        # For each of 256 patches, analyze and create label
        patches = []
        for row in range(16):
            for col in range(16):
                patch_metrics = analyzer.analyze_patch(row, col)
                patches.append({
                    "patch_id": row * 16 + col,
                    "grid_pos": [row, col],
                    "patch_metrics": patch_metrics,
                    "target_label": round(float(blurred[row][col]), 4)
                })
        
        # === CREATE ANNOTATION DOCUMENT ===
        annotation_doc = {
            "image_id": image_name,
            "artist_id": artist_id,
            "timestamp": datetime.now().isoformat(),
            "clicks": clicks,
            "blurred_grid": blurred.tolist(),
            "patches": patches
        }
        
        # === SAVE TO JSON ===
        total_annotations = save_annotation(image_name, annotation_doc)
        
        # Check if this artist already labeled this image (for info message only)
        all_annotations = load_annotations(image_name)
        existing_artist_ids = [a.get("artist_id") for a in all_annotations[:-1]]
        is_resubmission = artist_id in existing_artist_ids
        
        # === RETURN RESPONSE ===
        remaining = 4 - total_annotations
        consensus_ready = "✅" if remaining == 0 else "⏳"
        
        response_msg = f"{consensus_ready} Annotation saved. {remaining} more artist(s) needed for consensus."
        if is_resubmission:
            response_msg = f"⚠️ (Overwritten) {response_msg}"
        
        return jsonify({
            "status": "saved",
            "artist_id": artist_id,
            "image_id": image_name,
            "file_path": get_annotations_file(image_name),
            "annotations_count": total_annotations,
            "annotations_needed": remaining,
            "progress": f"{total_annotations} of 4 artists have labeled this image",
            "message": response_msg,
            "blurred_grid": blurred.tolist(),
            "patches": patches
        })

    @app.route("/api/labels/<image_id>", methods=["GET"])
    def get_annotations(image_id):
        """
        PHASE 2: Retrieve all annotations for an image from all artists.
        
        GET /api/labels/{image_id}
        
        Useful for: Reviewing consensus, debugging, generating training data
        """
        annotations = load_annotations(image_id)
        
        if not annotations:
            return jsonify({"error": "No annotations found", "image_id": image_id}), 404
        
        return jsonify({
            "image_id": image_id,
            "annotation_count": len(annotations),
            "artists": [a["artist_id"] for a in annotations],
            "annotations": annotations
        })

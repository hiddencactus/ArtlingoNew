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

from db.storage import delete_annotation, load_annotations, save_annotation, get_annotations_file
from api.images import image_exists, get_image_path
from ml.analyzer import HarmonyAnalyzer

GRID_SIZE = 16
CELL_SIZE = 64


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
        data = request.get_json(silent=True) or {}
        image_name = data.get("image_id")
        artist_id = data.get("artist_id", "anonymous")
        clicks = data.get("clicks", [])
        no_issues = bool(data.get("no_issues", False))
        issue_scope = data.get("issue_scope") or []

        if not isinstance(issue_scope, list):
            issue_scope = []

        if no_issues:
            clicks = []
        elif len(clicks) != 3:
            return jsonify({"error": "Exactly 3 clicks required unless no_issues is true"}), 400
        
        # Validate image exists
        if not image_exists(image_name):
            return jsonify({"error": f"Image not found: {image_name}"}), 404
        
        # Load image and create analyzer
        with open(get_image_path(image_name), 'rb') as f:
            analyzer = HarmonyAnalyzer(f.read())
        
        # === BUILD BLURRED GRID ===
        # Start with empty 16x16 grid
        grid = np.zeros((GRID_SIZE, GRID_SIZE))
        
        # For each click, increment the cell (vote)
        for x, y in clicks:
            col, row = int(x // CELL_SIZE), int(y // CELL_SIZE)
            if 0 <= col < GRID_SIZE and 0 <= row < GRID_SIZE:
                grid[row][col] += 1.0
        
        # Apply Gaussian blur to spread votes
        blurred = gaussian_filter(grid, sigma=0.5)
        
        # Normalize to 0-1 range
        if np.max(blurred) > 0:
            blurred = blurred / np.max(blurred)
        
        # === EXTRACT PATCH METRICS ===
        # For each of 256 patches, analyze and create label
        patches = []
        for row in range(GRID_SIZE):
            for col in range(GRID_SIZE):
                patch_metrics = analyzer.analyze_patch(row, col, patch_size=CELL_SIZE)
                patches.append({
                    "patch_id": row * GRID_SIZE + col,
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
            "patches": patches,
            "no_issues": no_issues,
            "issue_scope": issue_scope
        }
        
        # Check if this artist already labeled this image (for info message only)
        existing_annotations = load_annotations(image_name)
        existing_artist_ids = {a.get("artist_id") for a in existing_annotations}
        is_resubmission = artist_id in existing_artist_ids

        # === SAVE TO STORAGE ===
        try:
            total_annotations = save_annotation(image_name, annotation_doc)
        except Exception as exc:
            return jsonify({"error": "Failed to save annotation", "details": str(exc)}), 500
        
        # === RETURN RESPONSE ===
        remaining = max(0, 4 - total_annotations)
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
            "patches": patches,
            "no_issues": no_issues,
            "issue_scope": issue_scope
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

    @app.route("/api/label", methods=["DELETE"])
    def delete_annotation_endpoint():
        """
        Delete one artist's annotation for an image.

        Request:
          {
            "image_id": "1.jpeg",
            "artist_id": "stephen"
          }
        """
        data = request.get_json(silent=True) or {}
        image_name = data.get("image_id")
        artist_id = data.get("artist_id")

        if not image_name or not artist_id:
            return jsonify({"error": "image_id and artist_id are required"}), 400

        try:
            deleted = delete_annotation(image_name, artist_id)
        except Exception as exc:
            return jsonify({"error": "Failed to delete annotation", "details": str(exc)}), 500

        if deleted == 0:
            return jsonify({
                "status": "not_found",
                "image_id": image_name,
                "artist_id": artist_id,
                "deleted": 0,
                "annotations_count": len(load_annotations(image_name)),
            })

        remaining_annotations = load_annotations(image_name)
        return jsonify({
            "status": "deleted",
            "image_id": image_name,
            "artist_id": artist_id,
            "deleted": deleted,
            "annotations_count": len(remaining_annotations),
        })

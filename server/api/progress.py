"""
==============================================================================
PROGRESS & REPORTING API ENDPOINTS
==============================================================================
Handles consensus generation, progress tracking, and data reporting.
==============================================================================
"""

import numpy as np
import os
from flask import request, jsonify

from db.storage import (
    get_annotations_file,
    has_training_data,
    load_all_annotations,
    load_annotations,
    save_training_data,
)
from api.images import IMAGE_DIR


def init_routes(app):
    """Register progress/reporting routes with Flask app."""
    
    @app.route("/api/generate-training-data/<image_id>", methods=["POST"])
    def generate_training_data(image_id):
        """
        PHASE 2: Generate consensus from 4 artists' annotations.
        
        POST /api/generate-training-data/{image_id}
        
        PROCESS:
          1. Load all 4 annotations for image
          2. Average their blurred_grids
          3. Create training samples from labeled patches
          4. Save to training_{image_id}.json
        
        Response:
          {
            "status": "training_data_generated",
            "labeled_patches": 50,
            "training_data": {
              "consensus_grid": [[0.8, ...], ...],
              "training_samples": [{"patch_id": 0, "consensus_label": 0.8}]
            }
          }
        """
        annotations = load_annotations(image_id)
        
        if not annotations:
            return jsonify({"error": "No annotations found"}), 404
        
        if len(annotations) < 1:
            return jsonify({"error": "Insufficient annotations", "found": len(annotations)}), 400
        
        # Average the blurred grids from all artists
        blurred_grids = [np.array(a["blurred_grid"]) for a in annotations]
        consensus_grid = np.mean(blurred_grids, axis=0)  # Element-wise average
        
        # Get one set of patch metrics (they're the same for all artists)
        first_annotation = annotations[0]
        patches = first_annotation["patches"]
        
        # Create final training dataset
        training_data = {
            "image_id": image_id,
            "annotation_count": len(annotations),
            "artist_ids": [a["artist_id"] for a in annotations],
            "consensus_grid": consensus_grid.tolist(),
            "training_samples": []
        }
        
        # Only include patches with non-zero consensus labels
        for patch in patches:
            patch_id = patch["patch_id"]
            row, col = patch["grid_pos"]
            consensus_label = float(consensus_grid[row, col])
            
            if consensus_label > 0:  # Only labeled samples
                training_data["training_samples"].append({
                    "patch_id": patch_id,
                    "grid_pos": [row, col],
                    "patch_metrics": patch["patch_metrics"],
                    "consensus_label": round(consensus_label, 4),
                    "num_artists": len(annotations)
                })
        
        # Save to training data file
        training_file = save_training_data(image_id, training_data)
        
        return jsonify({
            "status": "training_data_generated",
            "image_id": image_id,
            "labeled_patches": len(training_data["training_samples"]),
            "total_patches": 256,
            "file_path": training_file,
            "training_data": training_data
        })

    @app.route("/api/progress-board", methods=["GET"])
    def progress_board():
        """
        DASHBOARD: Show overall progress of labeling.
        
        GET /api/progress-board
        
        Response:
          {
            "total_images": 100,
            "complete_images": 3,
            "pending_images": 97,
            "per_artist": {"stephen": 5, "yash": 4, ...},
            "images": {...}
          }
        """
        summary = {
            "total_images": len([f for f in os.listdir(IMAGE_DIR) 
                                if f.lower().endswith(('.png', '.jpg', '.jpeg', '.webp'))]),
            "complete_images": 0,
            "images": {},
            "per_artist": {}
        }

        all_annotations = load_all_annotations()
        image_index = {}
        for annotation in all_annotations:
            image_id = annotation.get("image_id")
            if not image_id:
                continue
            entry = image_index.setdefault(image_id, {"artists": set(), "annotations": []})
            entry["annotations"].append(annotation)

            artist = annotation.get("artist_id")
            if artist:
                entry["artists"].add(artist)
                summary["per_artist"][artist] = summary["per_artist"].get(artist, 0) + 1

        for image_id, entry in image_index.items():
            if entry["artists"]:
                artists_list = sorted(entry["artists"])
                annotation_count = len(entry["artists"])
            else:
                artists_list = []
                annotation_count = len(entry["annotations"])

            is_complete = annotation_count >= 4
            if is_complete:
                summary["complete_images"] += 1

            summary["images"][image_id] = {
                "annotation_count": annotation_count,
                "artists": artists_list,
                "is_complete": is_complete
            }
        
        summary["pending_images"] = summary["total_images"] - summary["complete_images"]
        return jsonify(summary)

    @app.route("/api/artist-progress/<artist_id>", methods=["GET"])
    def get_artist_progress(artist_id):
        """
        VIEW: Show all images labeled by a specific artist (for personal progress).
        
        GET /api/artist-progress/{artist_id}
        
        Response:
          {
            "artist_id": "stephen",
            "annotations_count": 5,
            "annotations": [...]
          }
        """
        all_annotations = load_all_annotations()
        artist_annotations = [
            a for a in all_annotations if a.get("artist_id") == artist_id
        ]
        
        return jsonify({
            "artist_id": artist_id,
            "annotations_count": len(artist_annotations),
            "annotations": artist_annotations
        })

    @app.route("/api/data-summary", methods=["GET"])
    def get_data_summary():
        """
        DEBUG: Show detailed summary of all annotations and training data.
        
        GET /api/data-summary
        """
        summary = {
            "annotations_dir": 'data/annotations',
            "images": {}
        }

        all_annotations = load_all_annotations()
        image_index = {}
        for annotation in all_annotations:
            image_id = annotation.get("image_id")
            if not image_id:
                continue
            entry = image_index.setdefault(image_id, {"artists": set(), "count": 0})
            entry["count"] += 1

            artist = annotation.get("artist_id")
            if artist:
                entry["artists"].add(artist)

        for image_id, entry in image_index.items():
            if entry["artists"]:
                artists_list = sorted(entry["artists"])
                annotation_count = len(entry["artists"])
            else:
                artists_list = []
                annotation_count = entry["count"]

            summary["images"][image_id] = {
                "annotation_count": annotation_count,
                "artists": artists_list,
                "file": get_annotations_file(image_id),
                "has_training_data": has_training_data(image_id)
            }
        
        return jsonify(summary)

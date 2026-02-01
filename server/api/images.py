"""
==============================================================================
IMAGE STORAGE MODULE
==============================================================================
Handles listing images and reading image files.
==============================================================================
"""

import os
from flask import send_from_directory, jsonify

IMAGE_DIR = 'static/processed_images'


def init_routes(app):
    """Register image-related routes with Flask app."""
    
    @app.route('/api/images', methods=['GET'])
    def list_images():
        """
        PHASE 1: Fetch all available images.
        
        GET /api/images
        
        Response:
          {"images": ["1.jpeg", "2.webp", ...]}
        """
        files = [f for f in os.listdir(IMAGE_DIR) 
                if f.lower().endswith(('.png', '.jpg', '.jpeg', '.webp'))]
        return jsonify({"images": sorted(files)})

    @app.route('/static/training_images/<path:filename>')
    def serve_image(filename):
        """Serve static image files."""
        return send_from_directory(IMAGE_DIR, filename)


def get_image_path(image_name):
    """Get full path to an image file."""
    return os.path.join(IMAGE_DIR, image_name)


def image_exists(image_name):
    """Check if an image file exists."""
    return os.path.exists(get_image_path(image_name))

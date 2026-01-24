"""
==============================================================================
ARTLINGO ANNOTATION BACKEND - MAIN SERVER
# ==============================================================================

ARCHITECTURE:
  - api/images.py        → Image listing endpoints
  - api/annotations.py   → Annotation save/retrieve endpoints
  - api/progress.py      → Consensus, progress tracking, reporting
  - db/storage.py        → JSON file I/O
  - ml/analyzer.py       → Image analysis (metrics extraction)

FLOW:
  1. Artist selects image from /api/images list
  2. Clicks 3 cells → POST /api/label
  3. Backend analyzes image, creates heatmap, saves JSON
  4. When 4 artists complete → POST /api/generate-training-data
  5. Progress tracked via /api/progress-board and /api/artist-progress

STORAGE:
  - Annotations:  server/data/annotations/annotations_{image_id}.json
  - Training:     server/data/annotations/training_{image_id}.json
  - Images:       server/static/training_images/

==============================================================================
"""

from flask import Flask
from flask_cors import CORS

# Import API route modules
from api.images import init_routes as init_images_routes
from api.annotations import init_routes as init_annotations_routes
from api.progress import init_routes as init_progress_routes

# ===== INITIALIZE FLASK APP =====
app = Flask(__name__, static_folder='static')
CORS(app)  # Enable cross-origin requests from React frontend

# ===== REGISTER ALL ROUTES =====
init_images_routes(app)        # GET /api/images, /static/training_images/<file>
init_annotations_routes(app)   # POST /api/label, GET /api/labels/<image_id>
init_progress_routes(app)      # POST /api/generate-training-data, GET /api/progress-board, etc.

# ===== START SERVER =====
if __name__ == "__main__":
    print("""
    ╔════════════════════════════════════════════════╗
    ║      ARTLINGO ANNOTATION SERVER STARTED        ║
    ╠════════════════════════════════════════════════╣
    ║  Backend: Flask on http://localhost:5000       ║
    ║  Storage: server/data/annotations/ (JSON)      ║
    ║  Images:  server/static/training_images/       ║
    ║                                                ║
    ║  Available Endpoints:                          ║
    ║  - GET  /api/images                  (lists)   ║
    ║  - POST /api/label                   (save)    ║
    ║  - GET  /api/labels/<id>             (view)    ║
    ║  - POST /api/generate-training-data  (consensus║
    ║  - GET  /api/progress-board          (dashboard)
    ║  - GET  /api/artist-progress/<id>    (history) ║
    ║  - GET  /api/data-summary            (debug)   ║
    ╚════════════════════════════════════════════════╝
    """)
    app.run(debug=True, host='0.0.0.0', port=5000)
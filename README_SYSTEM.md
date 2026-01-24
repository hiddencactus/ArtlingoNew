# 🎨 ARTLINGO ANNOTATION SYSTEM

## Overview

A multi-artist annotation tool where **4 artists label 100 images** using a **16×16 grid interface**. The backend extracts image metrics and stores annotations locally as JSON files.

### Key Features
- ✅ Multi-artist collaboration (track each artist's annotations separately)
- ✅ 16×16 grid-based image labeling (click up to 3 cells per image)
- ✅ Image analysis (line straightness, value grouping, harmony metrics)
- ✅ Consensus generation (when 4 artists complete an image)
- ✅ Local JSON storage (no database needed)
- ✅ Progress tracking & reporting dashboards

---

## Architecture Overview

### Backend Structure (`server/`)

```
server/
├── app.py                    # Main Flask server (entry point)
├── api/
│   ├── images.py            # GET /api/images, serve image files
│   ├── annotations.py       # POST /api/label, GET /api/labels/<id>
│   └── progress.py          # Consensus, progress dashboards, reporting
├── db/
│   ├── storage.py           # JSON file I/O (load/save annotations)
│   └── mongo.py             # (Legacy - not used)
├── ml/
│   └── analyzer.py          # HarmonyAnalyzer class (image metrics)
└── static/
    └── training_images/     # Image files (user provides these)
```

### Frontend Structure (`client/src/`)

```
client/src/
├── pages/
│   └── Label.jsx            # Main annotation page (orchestrator)
├── components/
│   ├── ArtistModal.jsx      # Select artist (first screen)
│   ├── ImageCanvas.jsx      # Canvas + grid + clickable cells
│   ├── ControlPanel.jsx     # Navigation & submit buttons
│   └── ResultsPanel.jsx     # Metrics + heatmap + raw data
├── hooks/
│   ├── useImageLoader.js    # Fetch images from backend
│   └── useAnnotation.js     # Submit annotation to backend
├── utils/
│   └── constants.js         # API endpoints, grid config, artists
└── App.js                   # Root component (just renders Label)
```

---

## The Annotation Workflow

### Step 1: Artist Selection
1. User opens the app → Sees **ArtistModal.jsx**
2. Clicks one of 4 buttons: "Stephen", "Yash", "Artist 3", "Artist 4"
3. Choice saved to **localStorage** for persistence

### Step 2: Image Display & Clicking
1. **ImageCanvas.jsx** shows image + 16×16 grid overlay
2. Artist clicks up to 3 cells (appears red)
3. Grid cells are 32×32 pixels (512 ÷ 16 = 32)

### Step 3: Submission
1. Artist clicks "Submit Annotation" button
2. **useAnnotation** hook converts grid cells → pixel coordinates
3. Sends POST to `/api/label`:
```json
{
  "image_id": "1.jpeg",
  "artist_id": "stephen",
  "clicks": [[x1, y1], [x2, y2], [x3, y3]]
}
```

### Step 4: Backend Processing
1. **api/annotations.py** receives request
2. Creates 16×16 grid, increments clicked cells: `grid[row][col] += 1`
3. Applies **Gaussian blur** (sigma=0.5) to spread votes to neighbors
4. Normalizes to 0-1 range
5. **ml/analyzer.py** extracts 256 patch metrics:
   - **line**: Edge density (clean lines = high score)
   - **value**: Ink value range (grouped values = high score)
   - **harmony**: Combined aesthetic score
6. Saves to **server/data/annotations/annotations_{image_id}.json**

### Step 5: Display Results
1. Backend returns response with:
   - `blurred_grid`: 16×16 heatmap showing where artist clicked
   - `patches`: Metrics for all 256 patches
   - `progress`: How many artists have labeled this image
2. **ResultsPanel.jsx** displays:
   - Metrics from first patch (representative)
   - Heatmap visualization (red gradient)
   - Raw JSON (hidden by default)

### Step 6: Consensus (When 4 Artists Complete)
1. Manually call `POST /api/generate-training-data/{image_id}`
2. Backend averages all 4 blurred_grids
3. Creates training samples for ML pipeline
4. Saves to **server/data/annotations/training_{image_id}.json**

---

## Data Structures

### Annotation JSON File
**Location**: `server/data/annotations/annotations_1_jpeg.json`
```json
[
  {
    "image_id": "1.jpeg",
    "artist_id": "stephen",
    "timestamp": "2026-01-23T17:00:24.123456",
    "clicks": [[256, 256], [320, 192], [224, 320]],
    "blurred_grid": [
      [0.1, 0.05, 0.0, ...],
      [0.2, 0.9, 0.3, ...],
      ...
    ],
    "patches": [
      {
        "patch_id": 0,
        "grid_pos": [0, 0],
        "patch_metrics": {
          "line": 85,
          "value": 72,
          "harmony": 78
        },
        "target_label": 0.1
      },
      ...
    ]
  }
]
```

### Training Data JSON File
**Location**: `server/data/annotations/training_1_jpeg.json`
```json
{
  "image_id": "1.jpeg",
  "annotation_count": 4,
  "artist_ids": ["stephen", "yash", "user3", "user4"],
  "consensus_grid": [[0.15, ...], ...],
  "training_samples": [
    {
      "patch_id": 0,
      "grid_pos": [0, 0],
      "patch_metrics": {"line": 85, "value": 72, "harmony": 78},
      "consensus_label": 0.15,
      "num_artists": 4
    },
    ...
  ]
}
```

---

## API Endpoints

### Images
- **GET** `/api/images` → List all available images
- **GET** `/static/training_images/{filename}` → Serve image file

### Annotations (Phase 1)
- **POST** `/api/label` → Save artist annotation
  - Request: `{image_id, artist_id, clicks}`
  - Response: `{status, blurred_grid, patches, progress}`
- **GET** `/api/labels/{image_id}` → Get all annotations for image

### Consensus & Progress (Phase 2)
- **POST** `/api/generate-training-data/{image_id}` → Create consensus
- **GET** `/api/progress-board` → Dashboard (total/complete images, per-artist counts)
- **GET** `/api/artist-progress/{artist_id}` → Artist's annotation history
- **GET** `/api/data-summary` → Debug info (file paths, training status)

---

## Setup & Running

### Backend
```bash
cd server

# 1. Create virtual environment
python -m venv venv
.\venv\Scripts\Activate.ps1

# 2. Install dependencies
pip install flask flask-cors opencv-python numpy scipy

# 3. Start server
python app.py
```

Server runs at `http://localhost:5000`

### Frontend
```bash
cd client

# 1. Install dependencies
npm install

# 2. Start React dev server
npm start
```

Frontend runs at `http://localhost:3000`

### Add Images
1. Create folder: `server/static/training_images/`
2. Add image files (PNG, JPEG, WEBP)
3. They'll automatically appear in the app

---

## File Organization Guide

### When to Use Which File

**Backend**:
- `app.py` → Add new endpoints here (register routes)
- `api/*.py` → Add related endpoint logic here
- `ml/analyzer.py` → Add new metrics/analysis methods
- `db/storage.py` → Add new file I/O functions

**Frontend**:
- `pages/Label.jsx` → Main workflow orchestration
- `components/*.jsx` → Reusable UI pieces
- `hooks/*.js` → Data fetching & custom logic
- `utils/constants.js` → Centralize config & endpoints

---

## Key Metrics Explained

### Line Straightness (0-100)
- **Definition**: How clean/straight are the lines
- **Calculation**: Uses Canny edge detection. High edge density = messy (low score)
- **Score**: 100 = perfectly straight lines, 0 = very jagged

### Value Grouping (0-100)
- **Definition**: How grouped/consistent is the ink darkness
- **Calculation**: Measures range between 10th-90th percentile of ink values
- **Score**: 100 = tight value range, 0 = very inconsistent

### Harmony (0-100)
- **Definition**: Overall aesthetic quality (combination of above)
- **Calculation**: Average of line + value scores

---

## Troubleshooting

### "No images found"
- Check `server/static/training_images/` exists
- Add image files (PNG, JPEG, WEBP)

### Backend crashes on image 2+
- Check `ml/analyzer.py` handles edge cases
- Verify patch extraction doesn't go out of bounds
- Look for empty image arrays (SAFETY checks added)

### Annotations not saving
- Check `server/data/annotations/` directory exists
- Check backend is running (`http://localhost:5000/api/images`)
- Check browser console for fetch errors

### React won't start
- `rm -r node_modules` + `npm install`
- Check Node version: `node --version`

---

## Next Steps

1. **Test with 4 artists**
   - Have each artist label 20+ images
   - Watch progress at `/api/progress-board`

2. **Generate Consensus**
   - Call `POST /api/generate-training-data` when image has 4 annotations
   - Verify `training_*.json` files created

3. **Build ML Pipeline**
   - Load training data from JSON
   - Extract 32×32 patches from images
   - Train ResNet50 + Logistic Regression

4. **Deploy to Team**
   - Share Figma/docs with URLs
   - Coordinate which artists label which images
   - Track progress on dashboard

---

**Questions?** Check `server/api/*.py` docstrings and `client/src/components/*.jsx` comments for detailed explanations!

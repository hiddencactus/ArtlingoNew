# 🏗️ Architecture Diagrams

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    ARTLINGO ANNOTATION SYSTEM                   │
└─────────────────────────────────────────────────────────────────┘

┌──────────────────────────┐          ┌──────────────────────────┐
│  REACT FRONTEND          │          │  FLASK BACKEND           │
│  (localhost:3000)        │          │  (localhost:5000)        │
├──────────────────────────┤          ├──────────────────────────┤
│                          │          │                          │
│  pages/Label.jsx         │  HTTP    │  app.py                  │
│  ├─ ArtistModal          │◄────────►│  ├─ api/images.py        │
│  ├─ ImageCanvas          │  JSON    │  ├─ api/annotations.py   │
│  ├─ ControlPanel         │  Requests│  ├─ api/progress.py      │
│  └─ ResultsPanel         │          │  ├─ db/storage.py        │
│                          │          │  └─ ml/analyzer.py       │
│  hooks/                  │          │                          │
│  ├─ useImageLoader       │          │  Reads images from:      │
│  └─ useAnnotation        │          │  static/training_images/ │
│                          │          │                          │
│  utils/                  │          │  Writes JSON to:         │
│  └─ constants.js         │          │  data/annotations/       │
│                          │          │                          │
└──────────────────────────┘          └──────────────────────────┘
```

---

## Data Flow: Complete Annotation Journey

```
┌─────────────────────────────────────────────────────────────────┐
│                    PHASE 1: ANNOTATION                          │
└─────────────────────────────────────────────────────────────────┘

1. USER SELECTS ARTIST
   ┌──────────────────┐
   │ ArtistModal.jsx  │
   │ (4 buttons)      │
   └────────┬─────────┘
            │ onClick
            ▼
   ┌──────────────────┐
   │ localStorage     │
   │ artistId = name  │
   └────────┬─────────┘
            │
            ▼
   ┌──────────────────┐
   │ Show canvas      │
   └────────┬─────────┘

2. LOAD IMAGE
   ┌──────────────────┐
   │ useImageLoader   │◄─── useEffect
   │ GET /api/images  │
   └────────┬─────────┘
            │
            ▼
   ┌──────────────────┐
   │ api/images.py    │
   │ list_images()    │
   └────────┬─────────┘
            │
            ▼
   ┌──────────────────┐
   │ ImageCanvas.jsx  │
   │ Draws image      │
   └────────┬─────────┘

3. ARTIST CLICKS CELLS
   ┌──────────────────┐
   │ ImageCanvas.jsx  │
   │ 256 buttons      │
   └────────┬─────────┘
            │ onClick
            ▼
   ┌──────────────────┐
   │ selectedCells Set│
   │ max 3 selections │
   └────────┬─────────┘

4. SUBMIT ANNOTATION
   ┌──────────────────┐
   │ ControlPanel.jsx │
   │ Submit button    │
   └────────┬─────────┘
            │
            ▼
   ┌──────────────────────────┐
   │ useAnnotation.js         │
   │ convertCells→Pixels      │
   │ POST /api/label          │
   └────────┬─────────────────┘
            │
            ▼
   ┌──────────────────────────┐
   │ api/annotations.py       │
   │ save_annotation_endpoint │
   └────────┬─────────────────┘
            │
            ├─► 1. Load image from disk
            │
            ├─► 2. ml/analyzer.py
            │       analyze_patch()
            │       ├─ Line straightness (Canny edges)
            │       ├─ Value grouping (ink darkness)
            │       └─ Harmony (combined)
            │
            ├─► 3. Build blurred grid
            │       Create 16×16 grid
            │       Increment clicked cells: grid[row][col] += 1
            │       Apply Gaussian blur (sigma=0.5)
            │       Normalize to 0-1
            │
            ├─► 4. Extract 256 patch metrics
            │       For each grid cell:
            │       - Get patch_metrics from analyzer
            │       - Get target_label from blurred_grid
            │
            ├─► 5. db/storage.py
            │       save_annotation()
            │       Write to: annotations_{image_id}.json
            │
            └─► 6. Return response
                   {blurred_grid, patches, progress}
                   │
                   ▼
   ┌──────────────────────────┐
   │ ResultsPanel.jsx         │
   │ Display:                 │
   │ - Metrics                │
   │ - Heatmap                │
   │ - Raw JSON               │
   └──────────────────────────┘
```

---

## Data Flow: Consensus Generation (When 4 Artists Done)

```
┌─────────────────────────────────────────────────────────────────┐
│                    PHASE 2: CONSENSUS                           │
└─────────────────────────────────────────────────────────────────┘

POST /api/generate-training-data/{image_id}
│
▼
┌──────────────────────────────────────┐
│ api/progress.py                      │
│ generate_training_data()             │
└──────────┬───────────────────────────┘
           │
           ├─► 1. db/storage.py
           │       load_annotations()
           │       Read: annotations_{image_id}.json
           │       Get all 4 artists' data
           │
           ├─► 2. Average blurred grids
           │       grid1 + grid2 + grid3 + grid4
           │       ─────────────────────────────── = consensus_grid
           │                   4
           │
           ├─► 3. Create training samples
           │       For each patch:
           │       - patch_metrics (from analyzer)
           │       - consensus_label (from averaged grid)
           │       - Include only patches with consensus > 0
           │
           ├─► 4. db/storage.py
           │       save_training_data()
           │       Write to: training_{image_id}.json
           │
           └─► 5. Return response
                   {training_samples, labeled_patches count}
                   │
                   ▼
   ┌────────────────────────────┐
   │ training_{image_id}.json   │
   │ Ready for ML pipeline!     │
   └────────────────────────────┘
```

---

## File Organization: Backend

```
server/
│
├── app.py                  (ENTRY POINT - Registers routes)
│   │
│   └─ from api/
│
├── api/                    (API ENDPOINTS)
│   ├── images.py           ├─ GET /api/images
│   │                       └─ GET /static/training_images/<file>
│   │
│   ├── annotations.py      ├─ POST /api/label        (PHASE 1)
│   │                       └─ GET /api/labels/<id>
│   │
│   └── progress.py         ├─ POST /api/generate-training-data  (PHASE 2)
│                           ├─ GET /api/progress-board
│                           ├─ GET /api/artist-progress/<id>
│                           └─ GET /api/data-summary
│
├── ml/                     (IMAGE ANALYSIS)
│   └── analyzer.py         └─ HarmonyAnalyzer class
│                              └─ analyze_patch()
│
├── db/                     (DATA STORAGE)
│   └── storage.py          ├─ load_annotations()
│                           ├─ save_annotation()
│                           └─ save_training_data()
│
└── static/
    └── training_images/    ◄─ ADD YOUR IMAGES HERE
    
data/
└── annotations/            ◄─ AUTO-CREATED: JSON files saved here
```

---

## File Organization: Frontend

```
client/src/
│
├── App.js                  (ROOT - Just renders Label)
│   │
│   └─ import Label.jsx
│
├── pages/                  (PAGES/SCREENS)
│   └── Label.jsx           ├─ Orchestrates entire workflow
│                           ├─ Manages state
│                           ├─ Handles events
│                           ├─ Imports components & hooks
│                           └─ Renders structure
│
├── components/             (REUSABLE UI PIECES)
│   ├── ArtistModal.jsx     └─ Artist selection (4 buttons)
│   ├── ImageCanvas.jsx     └─ Canvas + grid + cells
│   ├── ControlPanel.jsx    └─ Nav buttons + submit
│   └── ResultsPanel.jsx    └─ Metrics + heatmap + raw data
│
├── hooks/                  (CUSTOM DATA-FETCHING LOGIC)
│   ├── useImageLoader.js   └─ GET /api/images
│   └── useAnnotation.js    └─ POST /api/label
│
└── utils/                  (CONFIGURATION & CONSTANTS)
    └── constants.js        ├─ API_ENDPOINTS (all URLs)
                            ├─ GRID_CONFIG (16, 32, 512, 3)
                            ├─ ARTISTS (4 names)
                            └─ STORAGE_KEYS (localStorage keys)
```

---

## Request/Response Examples

### Save Annotation
```javascript
// REQUEST
POST /api/label
{
  "image_id": "1.jpeg",
  "artist_id": "stephen",
  "clicks": [[256, 256], [320, 192], [224, 320]]
}

// RESPONSE
{
  "status": "saved",
  "artist_id": "stephen",
  "image_id": "1.jpeg",
  "annotations_count": 2,
  "progress": "2 of 4 artists have labeled this image",
  "message": "⏳ Annotation saved. 2 more artist(s) needed.",
  "blurred_grid": [[0.1, ...], ...],        // 16×16 array
  "patches": [{                              // 256 items
    "patch_id": 0,
    "grid_pos": [0, 0],
    "patch_metrics": {
      "line": 85,
      "value": 72,
      "harmony": 78
    },
    "target_label": 0.1
  }, ...]
}
```

### Generate Training Data
```javascript
// REQUEST
POST /api/generate-training-data/1.jpeg

// RESPONSE
{
  "status": "training_data_generated",
  "image_id": "1.jpeg",
  "labeled_patches": 45,
  "training_data": {
    "image_id": "1.jpeg",
    "annotation_count": 4,
    "artist_ids": ["stephen", "yash", "user3", "user4"],
    "consensus_grid": [[0.15, ...], ...],
    "training_samples": [{
      "patch_id": 0,
      "grid_pos": [0, 0],
      "patch_metrics": {"line": 85, "value": 72, "harmony": 78},
      "consensus_label": 0.15,
      "num_artists": 4
    }, ...]
  }
}
```

---

**This is the complete system architecture!** 🎯

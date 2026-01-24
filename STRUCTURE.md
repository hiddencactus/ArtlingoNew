# 📁 Project Structure Guide

## Complete Folder Layout

```
ArtlingoNew/
│
├── 📖 README_SYSTEM.md              ← START HERE! System overview
│
├── 🖥️ server/                        
│   ├── app.py                        ⭐ ENTRY POINT - Start here
│   │
│   ├── api/                          ← "What does the API do?"
│   │   ├── images.py                 - List images, serve files
│   │   ├── annotations.py            - Save/get annotations (Phase 1)
│   │   └── progress.py               - Consensus, dashboards (Phase 2)
│   │
│   ├── db/                           ← "How is data stored?"
│   │   └── storage.py                - JSON file I/O
│   │
│   ├── ml/                           ← "How are metrics calculated?"
│   │   └── analyzer.py               - HarmonyAnalyzer class
│   │
│   ├── static/
│   │   └── training_images/          ← ADD YOUR IMAGES HERE
│   │
│   ├── data/
│   │   └── annotations/              ← AUTO-CREATED: Where JSONs are saved
│   │
│   ├── venv/                         ← Virtual environment
│   ├── requirements.txt
│   └── basic_backend_old.py          (Backup of old monolithic code)
│
├── 🎨 client/
│   └── src/
│       ├── App.js                    ← Root component (renders Label)
│       │
│       ├── pages/                    ← "What are the screens?"
│       │   └── Label.jsx             ⭐ MAIN PAGE - Orchestrates workflow
│       │
│       ├── components/               ← "What are the UI pieces?"
│       │   ├── ArtistModal.jsx       - Artist selection (first screen)
│       │   ├── ImageCanvas.jsx       - Image + grid + cells
│       │   ├── ControlPanel.jsx      - Buttons (prev/next/submit)
│       │   └── ResultsPanel.jsx      - Metrics + heatmap display
│       │
│       ├── hooks/                    ← "How is data fetched/sent?"
│       │   ├── useImageLoader.js     - Fetch image list
│       │   └── useAnnotation.js      - Submit annotation to backend
│       │
│       ├── utils/                    ← "Where are constants/configs?"
│       │   └── constants.js          - API endpoints, grid size, artists
│       │
│       ├── package.json
│       └── public/
│
└── 📄 contributors.txt
```

---

## Understanding the Data Flow

### 1️⃣ Initial Load
```
App.js
  ↓
Label.jsx (calls useImageLoader)
  ↓
useImageLoader.js
  ↓
GET /api/images
  ↓
api/images.py (list_images)
  ↓
Returns: ["1.jpeg", "2.webp", ...]
```

### 2️⃣ Artist Selection
```
Label.jsx (shows ArtistModal)
  ↓
ArtistModal.jsx (user clicks button)
  ↓
handleSetArtist() in Label.jsx
  ↓
localStorage.setItem("artistId", name)
```

### 3️⃣ Image Display & Clicking
```
ImageCanvas.jsx
  ↓
User clicks cell
  ↓
handleCellClick() in Label.jsx
  ↓
selectedCells Set updated
```

### 4️⃣ Submission
```
ControlPanel.jsx (Submit button)
  ↓
handleSubmit() in Label.jsx
  ↓
useAnnotation.js (submitAnnotation)
  ↓
POST /api/label
  ↓
api/annotations.py (save_annotation_endpoint)
  ↓
1. Load image from disk
2. ml/analyzer.py (analyze_patch) → Calculate metrics
3. db/storage.py (save_annotation) → Write to JSON
4. Return response with blurred_grid + patches
  ↓
ResultsPanel.jsx (display metrics + heatmap)
```

### 5️⃣ Consensus Generation
```
POST /api/generate-training-data/{image_id}
  ↓
api/progress.py (generate_training_data)
  ↓
1. Load all 4 annotations from JSON
2. Average their blurred_grids
3. Create training samples
  ↓
db/storage.py (save_training_data)
  ↓
training_{image_id}.json created
```

---

## File Responsibilities

### Backend Files

| File | Responsibility | Key Functions |
|------|---|---|
| **app.py** | Server initialization, route registration | `init_routes()` calls |
| **api/images.py** | List & serve images | `list_images()`, `serve_image()` |
| **api/annotations.py** | Save/retrieve single annotations | `save_annotation_endpoint()`, `get_annotations()` |
| **api/progress.py** | Consensus, dashboards, reporting | `generate_training_data()`, `progress_board()` |
| **db/storage.py** | JSON file I/O | `load_annotations()`, `save_annotation()`, `save_training_data()` |
| **ml/analyzer.py** | Image analysis | `HarmonyAnalyzer.analyze_patch()` |

### Frontend Files

| File | Responsibility | Key Functions |
|------|---|---|
| **App.js** | Root component | Renders `<Label />` |
| **pages/Label.jsx** | Workflow orchestration | State management, event handlers |
| **components/ArtistModal.jsx** | Artist selection UI | Buttons for each artist |
| **components/ImageCanvas.jsx** | Image + grid display | Canvas, SVG grid, clickable cells |
| **components/ControlPanel.jsx** | Navigation & submit | Prev/Next/Clear/Submit buttons |
| **components/ResultsPanel.jsx** | Results display | Metrics, heatmap, raw data |
| **hooks/useImageLoader.js** | Fetch image list | `fetch('/api/images')` |
| **hooks/useAnnotation.js** | Submit annotation | `fetch('/api/label', POST)` |
| **utils/constants.js** | Config centralization | API endpoints, grid size, artists |

---

## How to Add Features

### Add a New API Endpoint

1. Create function in appropriate `api/*.py` file:
```python
@app.route("/api/new-endpoint", methods=["GET"])
def new_endpoint():
    return jsonify({"data": "something"})
```

2. Register in `app.py`:
```python
from api.new_module import init_routes as init_new_routes
init_new_routes(app)
```

3. Add to `utils/constants.js`:
```javascript
export const API_ENDPOINTS = {
  NEW_ENDPOINT: `${API_BASE}/api/new-endpoint`,
};
```

4. Use in React component:
```javascript
const res = await fetch(API_ENDPOINTS.NEW_ENDPOINT);
```

### Add a New UI Component

1. Create `components/NewComponent.jsx`:
```jsx
export default function NewComponent({ props }) {
  return <div>...</div>;
}
```

2. Use in `pages/Label.jsx`:
```jsx
import NewComponent from "../components/NewComponent";

// In JSX:
<NewComponent {...props} />
```

### Add a New Image Metric

1. Add calculation to `ml/analyzer.py`:
```python
def analyze_patch(self, row, col, patch_size=32):
    # ... existing code ...
    new_metric = calculate_something(patch_gray)
    return {
        "line": ...,
        "value": ...,
        "new_metric": new_metric
    }
```

2. Display in `components/ResultsPanel.jsx`:
```jsx
<div className="flex justify-between">
  <span>New Metric:</span>
  <span>{resultJson.patches[0]?.patch_metrics?.new_metric}%</span>
</div>
```

---

## Typical Debugging Workflow

**Issue**: Images not loading
```
1. Check Label_old.jsx was renamed
2. Check server/static/training_images/ has images
3. Check GET /api/images returns list
4. Check browser console for fetch errors
```

**Issue**: Annotations not saving
```
1. Check server/data/annotations/ directory exists
2. Check POST /api/label returns 200
3. Check JSON file was created
4. Check browser console for errors
5. Check backend terminal for error traceback
```

**Issue**: Metrics look wrong
```
1. Check ml/analyzer.py calculations
2. Check patch boundaries are correct
3. Check image loaded successfully
4. Add print() statements to debug
```

---

## ✅ Checklist Before Team Testing

- [ ] Images added to `server/static/training_images/`
- [ ] Backend runs without errors: `python app.py`
- [ ] Frontend runs: `npm start`
- [ ] Can select artist and see canvas
- [ ] Can click 3 cells and submit
- [ ] Results display metrics + heatmap
- [ ] JSON files created in `server/data/annotations/`
- [ ] All 4 artists can label the same image
- [ ] Progress board shows correct counts

---

**Now you should be able to understand the system! Pick any file and read its docstring.** 🚀

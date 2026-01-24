# 📚 Quick Navigation Guide

## 🚀 Getting Started

**First time?** Read these in order:

1. **[CHANGES.md](CHANGES.md)** - What was fixed and why
2. **[README_SYSTEM.md](README_SYSTEM.md)** - How the system works
3. **[STRUCTURE.md](STRUCTURE.md)** - How files are organized

---

## 🎯 Find What You Need

### Understanding the System
- **How does annotation work?** → [README_SYSTEM.md → The Annotation Workflow](README_SYSTEM.md#the-annotation-workflow)
- **What's the folder structure?** → [STRUCTURE.md → Complete Folder Layout](STRUCTURE.md#complete-folder-layout)
- **What's the data flow?** → [STRUCTURE.md → Understanding the Data Flow](STRUCTURE.md#understanding-the-data-flow)

### Backend Tasks
- **Fix a backend bug?** → Check relevant file in `server/api/` or `server/ml/`
- **Add a new API endpoint?** → [STRUCTURE.md → How to Add Features](STRUCTURE.md#add-a-new-api-endpoint)
- **Understand image metrics?** → `server/ml/analyzer.py` docstring
- **Debug JSON storage?** → `server/db/storage.py` docstring

### Frontend Tasks
- **Fix a UI bug?** → Check `client/src/components/` file
- **Add a new component?** → [STRUCTURE.md → How to Add Features](STRUCTURE.md#add-a-new-ui-component)
- **Change API endpoint?** → `client/src/utils/constants.js`
- **Add new state?** → `client/src/pages/Label.jsx` state section

### Debugging
- **Images not loading?** → [STRUCTURE.md → Debugging](STRUCTURE.md#typical-debugging-workflow)
- **Annotations not saving?** → Check `server/data/annotations/` exists
- **Backend crashes?** → Check error in terminal
- **React won't start?** → Check Node version

---

## 📁 Key Files to Know

### Backend
| When You Need To... | Go To... |
|---|---|
| List images | `server/api/images.py` |
| Save annotations | `server/api/annotations.py` |
| Generate consensus | `server/api/progress.py` |
| Store/retrieve JSON | `server/db/storage.py` |
| Calculate metrics | `server/ml/analyzer.py` |
| Start the server | `server/app.py` |

### Frontend
| When You Need To... | Go To... |
|---|---|
| Main workflow | `client/src/pages/Label.jsx` |
| Artist selection | `client/src/components/ArtistModal.jsx` |
| Image + grid display | `client/src/components/ImageCanvas.jsx` |
| Navigation buttons | `client/src/components/ControlPanel.jsx` |
| Results display | `client/src/components/ResultsPanel.jsx` |
| Fetch images | `client/src/hooks/useImageLoader.js` |
| Submit annotation | `client/src/hooks/useAnnotation.js` |
| Config & endpoints | `client/src/utils/constants.js` |

---

## 💡 Key Concepts

### The 16×16 Grid
- Image is 512×512 pixels
- Grid is 16×16 cells
- Each cell = 32×32 pixels (512 ÷ 16)
- Artist can click up to 3 cells per image

### The Workflow Phases
- **PHASE 1**: Artist clicks cells → Backend saves JSON → Shows metrics
- **PHASE 2**: When 4 artists complete image → Generate consensus → Create training data

### The Data Flow
```
Frontend Click → Grid Coordinates → Backend → Image Analysis → JSON File → Results Display
```

### JSON Files
- **Annotation**: `server/data/annotations/annotations_{image_id}.json`
  - Stores one entry per artist
  - Contains: clicks, blurred_grid, metrics
- **Training**: `server/data/annotations/training_{image_id}.json`
  - Created when 4 artists finish
  - Contains: consensus_grid, training_samples

---

## 🔧 Common Tasks

### Add a New API Endpoint
1. Create function in `server/api/*.py`
2. Register in `server/app.py`
3. Add to `client/src/utils/constants.js`
4. Use in component

### Add a New Image Metric
1. Add calculation in `server/ml/analyzer.py`
2. Return in `analyze_patch()` dict
3. Display in `client/src/components/ResultsPanel.jsx`

### Change the 4 Artists
1. Edit `client/src/utils/constants.js` → `ARTISTS` array
2. Backend automatically uses whatever artist_id is sent

### Change Grid Size
1. Edit `client/src/utils/constants.js` → `GRID_CONFIG.SIZE`
2. Update backend to match (multiply/divide accordingly)

---

## 📊 API Endpoints Reference

**Images**
- `GET /api/images` - List all images
- `GET /static/training_images/{file}` - Get image file

**PHASE 1: Annotation**
- `POST /api/label` - Save annotation
- `GET /api/labels/{image_id}` - Get annotations

**PHASE 2: Consensus**
- `POST /api/generate-training-data/{image_id}` - Create consensus
- `GET /api/progress-board` - Dashboard
- `GET /api/artist-progress/{artist_id}` - Artist history
- `GET /api/data-summary` - Debug info

---

## 🐛 Debugging Commands

```bash
# Backend
cd server
python app.py                    # Start server

# Frontend
cd client
npm start                        # Start React dev server

# Check if image exists
ls server/static/training_images/

# Check if JSON was created
ls server/data/annotations/

# Check API is running
curl http://localhost:5000/api/images
```

---

## ✨ Pro Tips

1. **Add print() statements** to `server/*.py` for debugging
2. **Check browser console** for frontend errors (F12)
3. **Check server terminal** for backend errors
4. **Use localStorage DevTools** to see artist ID: `localStorage.getItem("artistId")`
5. **Read docstrings** - Every file has comments explaining what it does

---

## 🚀 Ready?

1. Start backend: `cd server && python app.py`
2. Start frontend: `cd client && npm start`
3. Add images to `server/static/training_images/`
4. Open `http://localhost:3000`
5. Click "Stephen" → See canvas → Click 3 cells → Submit → See results!

---

**Any questions? Check the file docstrings or ask the team!** 💬

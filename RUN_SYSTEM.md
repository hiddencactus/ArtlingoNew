# 🚀 How to Run & Verify the Entire System

## 🎯 Quick Start (2 terminals required)

### Terminal 1: Start Backend
```powershell
# Navigate to server directory

cd d:\MacAI\ArtlingoNew\server

# Activate virtual environment
.\venv\Scripts\Activate.ps1

# Run the Flask server
python app.py
```

**Expected output:**
```
 * Running on http://localhost:5000
 * Debug mode: on
```

### Terminal 2: Start Frontend
```powershell
# Navigate to client directory
cd d:\MacAI\ArtlingoNew\client

# Start React development server
npm start
```

**Expected output:**
```
Compiled successfully!
You can now view artlingo in the browser.
Local: http://localhost:3000
```

Then your browser should automatically open to `http://localhost:3000`

---

## ✅ Step 1: Verify Backend is Running

### Check if Flask is listening on port 5000

**Option A: Using PowerShell**
```powershell
netstat -ano | findstr :5000
```

Should show something like:
```
TCP    127.0.0.1:5000    0.0.0.0:0    LISTENING
```

**Option B: Using curl (if installed)**
```powershell
curl http://localhost:5000/api/images
```

Should return a JSON list of images.

**Option C: Check terminal output**
- If you see `Running on http://localhost:5000` without errors, you're good ✅

---

## ✅ Step 2: Verify Frontend is Running

### Check if React is listening on port 3000

**Option A: Using PowerShell**
```powershell
netstat -ano | findstr :3000
```

Should show:
```
TCP    127.0.0.1:3000    0.0.0.0:0    LISTENING
```

**Option B: Visit in browser**
- Go to `http://localhost:3000`
- You should see the Artlingo UI with an artist selection modal
- No errors in browser console (check F12 → Console tab)

**Option C: Check terminal output**
- If you see `Compiled successfully!` without errors, you're good ✅

---

## ✅ Step 3: Test Backend API Endpoints

### 3.1 List Images
```powershell
curl http://localhost:5000/api/images
```

**Expected response:**
```json
{
  "images": ["1.jpeg", "2.jpeg", "3.jpeg"],
  "count": 3,
  "status": "ok"
}
```

**If you get connection refused:**
- ❌ Backend not running
- Start it in Terminal 1 with `python app.py`

**If you get empty list:**
- ⚠️ No images in `server/static/training_images/`
- Add test images (JPEGs) to that folder

---

### 3.2 Get Specific Image
```powershell
curl http://localhost:5000/static/training_images/1.jpeg
```

**Expected response:**
- Binary image data (you'll see mostly gibberish in terminal, which is normal)
- Status code 200 OK

**If you get 404:**
- ❌ Image not found in server/static/training_images/1.jpeg
- Add the image or use a different name

---

### 3.3 Submit Test Annotation
```powershell
# Windows PowerShell - Create JSON file first
$body = @{
    image_id = "1.jpeg"
    artist_id = "stephen"
    clicks = @(@(256, 256), @(320, 192), @(224, 320))
} | ConvertTo-Json

$body | curl -X POST `
  -H "Content-Type: application/json" `
  -d @- `
  http://localhost:5000/api/label
```

Or use this simpler version:
```powershell
curl -X POST `
  -H "Content-Type: application/json" `
  -d '{"image_id":"1.jpeg","artist_id":"stephen","clicks":[[256,256],[320,192],[224,320]]}' `
  http://localhost:5000/api/label
```

**Expected response:**
```json
{
  "status": "saved",
  "artist_id": "stephen",
  "image_id": "1.jpeg",
  "annotations_count": 1,
  "progress": "1 of 4 artists have labeled this image",
  "message": "⏳ Annotation saved. 3 more artist(s) needed.",
  "blurred_grid": [[0.0, 0.0, ...], ...],
  "patches": [...]
}
```

**If you get an error:**
- Check backend terminal for error details
- Common issues:
  - Invalid image_id (doesn't exist)
  - Invalid click coordinates (outside 512×512 range)
  - Backend crashed (check terminal output)

---

## ✅ Step 4: Test Frontend UI

### 4.1 Artist Selection
1. Open `http://localhost:3000`
2. Click on "Stephen" button
3. Should close modal and show image

**If modal doesn't close:**
- ❌ Check browser console (F12) for JavaScript errors
- Check network tab - should see POST requests succeeding

### 4.2 Image Display
1. Image should appear on canvas
2. 16×16 grid overlay should be visible (light lines)
3. Grid cells should be clickable (hover effect)

**If image is blank:**
- ❌ Backend not running or images not found
- Check browser console → Network tab
- Look for failed requests to `/static/training_images/`

### 4.3 Click Cells
1. Click up to 3 cells on the grid
2. Cells should highlight (darker color)
3. Cell count should update below canvas

**If cells don't highlight:**
- ❌ JavaScript error in ImageCanvas.jsx
- Check browser console for errors

### 4.4 Submit Annotation
1. Click 3 cells
2. Click "SUBMIT" button
3. Should see:
   - Results panel appear
   - Metrics displayed (line, value, harmony)
   - Heatmap showing where you clicked
   - Success message

**If submit fails:**
- ❌ Check browser console for errors
- Check backend terminal for error details
- Make sure artist is selected (localStorage might be cleared)

---

## ✅ Step 5: Verify Data Storage

### Check if annotations were saved
```powershell
# List all annotation files
ls d:\MacAI\ArtlingoNew\server\data\annotations\
```

**Expected output:**
```
Directory: D:\MacAI\ArtlingoNew\server\data\annotations

Mode    LastWriteTime     Length Name
----    -------------     ------ ----
-a----  1/23/2026 10:30    1540  annotations_1.jpeg.json
```

### Check annotation file contents
```powershell
cat d:\MacAI\ArtlingoNew\server\data\annotations\annotations_1.jpeg.json | ConvertFrom-Json | ConvertTo-Json
```

**Expected structure:**
```json
{
  "image_id": "1.jpeg",
  "annotations": {
    "stephen": {
      "artist_id": "stephen",
      "timestamp": "2026-01-23T10:30:45.123456",
      "clicks": [[256, 256], [320, 192], [224, 320]],
      "blurred_grid": [[0, 0, ..., 0.1, ..., 0], ...],
      "patches": [...]
    }
  }
}
```

**If file doesn't exist:**
- ❌ Annotation not saved
- Check backend terminal for errors
- Make sure you submitted (not just clicked submit, verify response)

---

## 🚨 Troubleshooting Guide

### Backend Issues

**Problem: Backend crashes on startup**
```
ModuleNotFoundError: No module named 'flask'
```

**Solution:**
```powershell
cd d:\MacAI\ArtlingoNew\server
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

---

**Problem: Backend crashes when submitting annotation**
```
cv2.error: OpenCV(4.13.0)... !_src.empty() in function 'cv::Sobel'
```

**Solution:** ✅ Already fixed in ml/analyzer.py with safety checks. If you see this:
- Delete your data/annotations/ folder
- Restart backend
- Re-submit

---

**Problem: Port 5000 already in use**
```
Address already in use
```

**Solution:**
```powershell
# Kill process using port 5000
netstat -ano | findstr :5000
taskkill /PID <PID_FROM_ABOVE> /F

# Or change port in app.py
# Change: app.run(debug=True, port=5000)
# To: app.run(debug=True, port=5001)
```

---

**Problem: Images not found**
```
GET /static/training_images/1.jpeg returns 404
```

**Solution:**
1. Add JPEG images to `server/static/training_images/`
2. Make sure filenames are exactly as shown in `/api/images` response
3. Restart backend if you added new images while it was running

---

### Frontend Issues

**Problem: React crashes on startup**
```
npm ERR! code ENOENT
npm ERR! syscall open
npm ERR! path package.json
```

**Solution:**
```powershell
cd d:\MacAI\ArtlingoNew\client
npm install
npm start
```

---

**Problem: Blank page or "cannot GET /"**

**Solution:**
1. Make sure you're on `http://localhost:3000` (not 3001 or another port)
2. Check browser console (F12) for errors
3. Restart React with Ctrl+C then `npm start`

---

**Problem: "Cannot reach backend" errors in console**

**Solution:**
1. Make sure backend is running on port 5000
2. Check in browser console → Network tab
3. Click on failed request to see error details
4. Verify backend is returning CORS headers

---

**Problem: Images load but grid doesn't work**

**Solution:**
1. Check browser console (F12)
2. Look for JavaScript errors in ImageCanvas component
3. Verify image is 512×512 pixels (required)
4. If not 512×512, resize or re-export images

---

## ✅ Complete System Verification Checklist

- [ ] Backend running on port 5000 (see `Running on http://localhost:5000`)
- [ ] Frontend running on port 3000 (browser shows UI)
- [ ] `GET /api/images` returns image list
- [ ] Images exist in `server/static/training_images/`
- [ ] Artist modal displays 4 buttons
- [ ] Image loads in canvas
- [ ] Grid overlay visible on image
- [ ] Can click cells (up to 3)
- [ ] Submit button enabled with 3 cells
- [ ] Submit returns results with metrics
- [ ] Results panel shows heatmap
- [ ] Annotation file created in `data/annotations/`
- [ ] Annotation JSON has correct structure
- [ ] Can navigate to previous/next image
- [ ] Previous image shows different content

**If all checked:** 🎉 **System is working perfectly!**

---

## 🔧 Advanced Verification

### Test with curl (Multiple Artists)

**Submit as artist 1:**
```powershell
curl -X POST `
  -H "Content-Type: application/json" `
  -d '{"image_id":"1.jpeg","artist_id":"stephen","clicks":[[256,256],[320,192],[224,320]]}' `
  http://localhost:5000/api/label
```

**Submit as artist 2:**
```powershell
curl -X POST `
  -H "Content-Type: application/json" `
  -d '{"image_id":"1.jpeg","artist_id":"yash","clicks":[[256,256],[320,192],[200,300]]}' `
  http://localhost:5000/api/label
```

**Check progress:**
```powershell
curl http://localhost:5000/api/progress-board
```

---

### Monitor Backend Logs

Keep backend terminal visible to see real-time logs:

```
127.0.0.1 - - [23/Jan/2026 10:30:45] "GET /api/images HTTP/1.1" 200 -
127.0.0.1 - - [23/Jan/2026 10:31:20] "POST /api/label HTTP/1.1" 200 -
```

Each line = one API request. Look for error codes (4xx, 5xx).

---

## 📊 Expected File Structure After Running

```
server/
├── data/
│   └── annotations/
│       ├── annotations_1.jpeg.json
│       ├── annotations_2.jpeg.json
│       └── annotations_3.jpeg.json

client/
└── (no new files created when running)
```

---

## 🎯 Next Steps

**After verifying everything works:**

1. **Add images** to `server/static/training_images/` (at least 4 JPEGs)
2. **Have 4 artists** label 3-5 images each
3. **Generate consensus** data via `/api/generate-training-data`
4. **Build ML model** using the training data
5. **Deploy** to production

**All commands to accomplish this are documented in README_SYSTEM.md** 📖

---

**Questions?** Check STRUCTURE.md for deeper technical details.

from flask import Flask, request, jsonify
from flask_cors import CORS
import cv2
import numpy as np
import math

app = Flask(__name__)
CORS(app)

class HarmonyAnalyzer:
    def __init__(self, image_bytes):
        # Decode image
        nparr = np.frombuffer(image_bytes, np.uint8)
        self.image_bgr = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        if self.image_bgr is not None:
            # Convert to HSV (Hue is what matters for the Color Wheel)
            self.image_hsv = cv2.cvtColor(self.image_bgr, cv2.COLOR_BGR2HSV)
            self.image_gray = cv2.cvtColor(self.image_bgr, cv2.COLOR_BGR2GRAY)
            self.height, self.width, _ = self.image_bgr.shape

    def get_dominant_hues(self, k=4):
        """
        Extracts the main colors (Hues) using K-Means Clustering.
        Ignores white background and black lines.
        """
        if self.image_hsv is None: return []

        # 1. Flatten the image to a list of pixels
        pixels = self.image_hsv.reshape(-1, 3)
        
        # 2. Filter out White/Gray/Black
        # Saturation > 20 (Not white/gray)
        # Value > 20 and < 250 (Not black, Not pure bright white paper)
        valid_pixels = pixels[
            (pixels[:, 1] > 20) & 
            (pixels[:, 2] > 20) & 
            (pixels[:, 2] < 250)
        ]

        if len(valid_pixels) < 100:
            return [] # Not enough color to analyze

        # 3. K-Means Clustering to find K dominant colors
        valid_pixels = np.float32(valid_pixels)
        criteria = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 10, 1.0)
        _, labels, centers = cv2.kmeans(valid_pixels, k, None, criteria, 10, cv2.KMEANS_RANDOM_CENTERS)
        
        # 4. Extract just the Hues (Channel 0)
        # OpenCV Hue is 0-179. We multiply by 2 to get standard 0-360 Color Wheel degrees.
        dominant_hues = [c[0] * 2 for c in centers]
        return sorted(dominant_hues)

    def analyze_color_harmony(self):
        """
        Determines which Harmony Template the palette fits best.
        """
        hues = self.get_dominant_hues()
        
        if not hues:
            return 0, "No distinct colors found (Grayscale/Blank).", "None"

        # Templates defined by ideal gaps between colors
        templates = {
            "Analogous": [0, 30],         # Colors close together
            "Complementary": [0, 180],    # Opposite sides
            "Triadic": [0, 120, 240],     # Triangle
            "Split-Complementary": [0, 150, 210], # Y-Shape
            "Tetradic": [0, 90, 180, 270] # Rectangle
        }

        best_fit_name = "None"
        best_fit_score = 0
        min_error = float('inf')

        # Test the palette against every template
        for name, angles in templates.items():
            current_template_error = float('inf')
            
            for base_hue in hues:
                ideal_angles = [(base_hue + a) % 360 for a in angles]
                total_dist = 0
                for h in hues:
                    distances = [min(abs(h - i), 360 - abs(h - i)) for i in ideal_angles]
                    total_dist += min(distances) 
                
                current_template_error = min(current_template_error, total_dist)

            if current_template_error < min_error:
                min_error = current_template_error
                best_fit_name = name

        # Score calculation
        best_fit_score = max(0, int(100 - (min_error * 1.5)))

        # Feedback Generation (Removed the ** asterisks)
        feedback = f"Your palette is closest to {best_fit_name}."
        if best_fit_score > 85:
            feedback += " It is a very strong match!"
        elif best_fit_score > 60:
            feedback += " It's recognizable, but some colors are drifting."
        else:
            feedback += " However, the colors are quite scattered."

        return best_fit_score, feedback, best_fit_name

    def analyze_values(self):
        """Analyze Light/Dark usage (Percentile based)"""
        if self.image_bgr is None: return 0, "Error"
        ink_mask = self.image_gray < 250
        if np.sum(ink_mask) == 0: return 0, "Canvas appears blank."
        
        ink_values = self.image_gray[ink_mask]
        dark_p = np.percentile(ink_values, 10)
        light_p = np.percentile(ink_values, 90)
        dynamic_range = light_p - dark_p
        
        score = 0
        if dynamic_range > 30:
            score = min(100, int((dynamic_range / 200) * 100))
        
        feedback = "Good contrast." if score > 70 else "Increase contrast."
        return score, feedback

    def analyze_lines(self):
        """Analyze Line Quality (Ratio based)"""
        if self.image_bgr is None: return 0
        edges = cv2.Canny(self.image_gray, 50, 150)
        edge_pixel_count = np.count_nonzero(edges)
        ink_mask = self.image_gray < 250
        ink_pixel_count = np.count_nonzero(ink_mask)
        if ink_pixel_count == 0: return 0
        
        ratio = edge_pixel_count / ink_pixel_count
        score = 100 - int((ratio - 0.15) * 300)
        return max(0, min(100, score))

    def get_full_report(self):
        if self.image_bgr is None: return {"error": "Could not process image"}
        
        val_s, val_m = self.analyze_values()
        line_s = self.analyze_lines()
        harm_s, harm_m, harm_type = self.analyze_color_harmony()
        
        return {
            "metrics": {
                "straightness": line_s,
                "value_grouping": val_s,
                "harmony": harm_s
            },
            "feedback": {
                "general": f"{harm_m} {val_m}",
                "harmony_type": harm_type,
            }
        }

@app.route("/", methods=["GET"])
def root(): return jsonify({"status": "ArtLingo AI Backend Running"})

@app.route("/api/analyze", methods=["POST"])
def analyze():
    if "file" not in request.files: return jsonify({"error": "No file"}), 400
    file = request.files["file"]
    
    # Run Analysis
    analyzer = HarmonyAnalyzer(file.read())
    report = analyzer.get_full_report()
    
    # DEBUG PRINT: This will show up in your VS Code / Terminal
    print("\n--- NEW ANALYSIS ---")
    print(f"Harmony Type: {report.get('feedback', {}).get('harmony_type')}")
    print(f"Scores: {report.get('metrics')}")
    print(f"Feedback: {report.get('feedback', {}).get('general')}")
    print("--------------------\n")
    
    return jsonify(report)

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
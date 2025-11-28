from flask import Flask, request, jsonify
from flask_cors import CORS
from PIL import Image
import io
import os
import cv2
import numpy as np

app = Flask(__name__)
CORS(app)

class HarmonyAnalyzer:
    def __init__(self, image_bytes):
        nparr = np.frombuffer(image_bytes, np.uint8)
        self.image_bgr = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        if self.image_bgr is not None:
            self.image_lab = cv2.cvtColor(self.image_bgr, cv2.COLOR_BGR2LAB)
            self.image_gray = cv2.cvtColor(self.image_bgr, cv2.COLOR_BGR2GRAY)
            self.height, self.width, _ = self.image_bgr.shape

    def analyze_values(self):
        """Analyze Light/Dark usage (Smart Contrast)"""
        if self.image_bgr is None: return 0, "Error"
        
        # 1. Mask out white background
        ink_mask = self.image_gray < 250
        if np.sum(ink_mask) == 0: return 0, "Canvas appears blank."

        # 2. Analyze the ink
        ink_values = self.image_gray[ink_mask]
        darkest_val = np.min(ink_values)
        lightest_ink = np.max(ink_values)
        
        dynamic_range = lightest_ink - darkest_val
        score = min(100, int((dynamic_range / 255) * 100))
        
        # --- TEACHER LOGIC ---
        feedback = []
        if score < 40:
            feedback.append("Your drawing is very faint.")
            feedback.append("Try pressing harder or using a darker brush for shadows.")
        elif score < 70:
            feedback.append("Good start on contrast.")
            feedback.append("To make it pop, add some pure black to the deepest shadows.")
        else:
            feedback.append("Excellent use of value range!")
            
        return score, " ".join(feedback)

    def analyze_temperature(self):
        """Analyze Warm/Cool Balance"""
        if self.image_bgr is None: return 0, "Error"
        
        l, a, b = cv2.split(self.image_lab)
        neutral_min, neutral_max = 123, 133

        warm_mask = (a > neutral_max) | (b > neutral_max)
        cool_mask = (a < neutral_min) | (b < neutral_min)
        
        warm_count = np.count_nonzero(warm_mask)
        cool_count = np.count_nonzero(cool_mask)
        total = warm_count + cool_count
        
        if total == 0: return 0, "No color detected.", "#FFFFFF"

        warm_ratio = warm_count / total
        
        # --- TEACHER LOGIC ---
        feedback = []
        suggestion_col = "#FFFFFF"
        
        if warm_ratio > 0.8:
            feedback.append("This is a very warm, energetic image.")
            feedback.append("Try adding a cool blue background or green accents to balance the heat.")
            suggestion_col = "#0000FF" # Blue
        elif warm_ratio < 0.2:
            feedback.append("This is a very cool, calm image.")
            feedback.append("A splash of orange or red would create a striking focal point.")
            suggestion_col = "#FF4500" # Orange
        elif 0.4 <= warm_ratio <= 0.6:
            feedback.append("Perfectly balanced temperatures!")
            feedback.append("The interaction between warm and cool areas is working well.")
        else:
            dominant = "Warm" if warm_ratio > 0.5 else "Cool"
            feedback.append(f"The image leans {dominant}.")
            feedback.append("Consider pushing the contrast between the two temperatures further.")
            suggestion_col = "#00FF00" if dominant == "Warm" else "#FF0000"

        # Score based on intentionality
        dist_from_balance = abs(warm_ratio - 0.5)
        score = int(100 - (abs(dist_from_balance - 0.4) * 200))
        score = max(0, min(100, score))

        return score, " ".join(feedback), suggestion_col

    def analyze_lines(self):
        """Analyze Edge/Line Quality (MISSING FUNCTION ADDED BACK)"""
        if self.image_bgr is None: return 0
        
        # Detect edges
        edges = cv2.Canny(self.image_gray, 50, 150)
        edge_pixel_count = np.count_nonzero(edges)
        
        # Calculate density (lines per area)
        density = edge_pixel_count / (self.width * self.height)
        
        # Heuristic: Lower density usually means cleaner, more confident lines
        score = max(0, 100 - int(density * 1000)) 
        return score

    def get_full_report(self):
        if self.image_bgr is None: return {"error": "Could not process image"}
        
        val_score, val_msg = self.analyze_values()
        temp_score, temp_msg, suggest_col = self.analyze_temperature()
        line_score = self.analyze_lines()
        
        full_feedback = f"{val_msg} {temp_msg}"
        
        return {
            "metrics": {
                "straightness": line_score,
                "value_grouping": val_score,
                "harmony": temp_score
            },
            "feedback": {
                "general": full_feedback,
                "suggestion_color": suggest_col
            }
        }

@app.route("/", methods=["GET"])
def root():
    return jsonify({"status": "ArtLingo AI Backend Running"})

@app.route("/api/analyze", methods=["POST"])
def analyze():
    if "file" not in request.files:
        return jsonify({"error": "No file provided"}), 400

    file = request.files["file"]

    try:
        img_bytes = file.read()
        analyzer = HarmonyAnalyzer(img_bytes)
        results = analyzer.get_full_report()
        print("Analysis Results:", results)
        return jsonify(results)

    except Exception as e:
        print("Analysis error:", e)
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
"""
==============================================================================
IMAGE ANALYSIS MODULE
==============================================================================
Analyzes 64x64 patches of images for metrics (line, value, harmony).
This is where we extract image features for training data.
==============================================================================
"""

import cv2
import numpy as np


class HarmonyAnalyzer:
    """
    Analyzes an image and extracts patch-level metrics.
    
    CONCEPT:
      - Image is 1024x1024 pixels
      - Divided into 16x16 grid = 256 patches
      - Each patch is 64x64 pixels
      - For each patch, we calculate: line straightness, value grouping, harmony
    
    METRICS:
      - line (0-100): How clean/straight are the lines (low edge density = clean)
      - value (0-100): How grouped are the ink values (tight range = good)
      - harmony (0-100): Combined aesthetic score
    """
    
    def __init__(self, image_bytes):
        """
        Load image from bytes.
        
        Args:
          image_bytes: Raw image file as bytes (PNG, JPEG, WEBP, etc.)
        """
        nparr = np.frombuffer(image_bytes, np.uint8)
        self.image_bgr = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        if self.image_bgr is not None:
            self.image_hsv = cv2.cvtColor(self.image_bgr, cv2.COLOR_BGR2HSV)
            self.image_gray = cv2.cvtColor(self.image_bgr, cv2.COLOR_BGR2GRAY)
        else:
            self.image_gray = None

    def analyze_patch(self, row, col, patch_size=64):
        """
        Analyze a specific 64x64 patch at grid position (row, col).
        
        Args:
          row (int): Row index in 16x16 grid (0-15)
          col (int): Column index in 16x16 grid (0-15)
          patch_size (int): Size of each patch in pixels (default 64)
        
        Returns:
          dict: {"line": 0-100, "value": 0-100, "harmony": 0-100}
        """
        # Graceful fallback if image didn't load
        if self.image_bgr is None or self.image_gray is None:
            return {"line": 50, "value": 50, "harmony": 50}
        
        # Calculate pixel boundaries
        y_start, x_start = row * patch_size, col * patch_size
        y_end, x_end = y_start + patch_size, x_start + patch_size
        
        # Clamp to image boundaries
        y_end = min(y_end, self.image_gray.shape[0])
        x_end = min(x_end, self.image_gray.shape[1])
        
        # Extract patch
        patch_gray = self.image_gray[y_start:y_end, x_start:x_end]
        
        # SAFETY: Check if patch is empty or too small
        if patch_gray.size == 0 or patch_gray.shape[0] < 2 or patch_gray.shape[1] < 2:
            return {"line": 50, "value": 50, "harmony": 50}
        
        # ===== METRIC 1: LINE STRAIGHTNESS =====
        # Detection: Use Canny edge detector
        try:
            edges = cv2.Canny(patch_gray, 50, 150)
            edge_count = np.count_nonzero(edges)
        except Exception as e:
            print(f"[ERROR] Canny edge detection failed: {e}")
            edge_count = 0
        
        # Calculation: High edge density = messy lines
        ink_count = np.count_nonzero(patch_gray < 250)  # Count dark pixels
        if ink_count > 0:
            edge_density = edge_count / ink_count
            straightness = max(0, min(100, 100 - int(edge_density * 300)))
        else:
            straightness = 50  # Blank patch = neutral
        
        # ===== METRIC 2: VALUE GROUPING =====
        # Detection: Range of ink darkness (is it all dark or varied?)
        ink_mask = patch_gray < 250
        if np.sum(ink_mask) > 0:
            ink_values = patch_gray[ink_mask]
            p10 = np.percentile(ink_values, 10)
            p90 = np.percentile(ink_values, 90)
            dynamic_range = p90 - p10
            # If range is small = good value grouping
            value_grouping = min(100, int((dynamic_range / 200) * 100)) if dynamic_range > 30 else 0
        else:
            value_grouping = 50  # Blank patch = neutral
        
        # ===== METRIC 3: HARMONY =====
        # Combined line + value score
        harmony = int((straightness + value_grouping) / 2)
        
        return {
            "line": int(straightness),
            "value": int(value_grouping),
            "harmony": int(harmony)
        }

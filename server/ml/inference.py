# imports
import io
import os
import traceback
from typing import Any, Dict, Optional, Tuple

import numpy as np
from PIL import Image

import torch
import torch.nn as nn
from torchvision import models, transforms


# Config

MODEL_FILENAME = "best.pt"
MODEL_PATH = os.path.join(os.path.dirname(__file__), MODEL_FILENAME)
DEVICE = "cpu"

_MODEL: Optional[nn.Module] = None

IMAGENET_MEAN = (0.485, 0.456, 0.406)
IMAGENET_STD = (0.229, 0.224, 0.225)

GRID = 16
INPUT_SIZE = 224

TARGET_SIZE = 1024
LEGACY_METRIC_MAX_DIM = 512
HARMONY_MAX_SAMPLES = 20000

# Padding color used during preprocessing(letterboxing)
PAD_COLOR = (255, 255, 255)  # white



# Transforms (match training)

LOCAL_TRANSFORM = transforms.Compose([
    transforms.Resize((INPUT_SIZE, INPUT_SIZE)),
    transforms.ToTensor(),
    transforms.Normalize(IMAGENET_MEAN, IMAGENET_STD),
])

GLOBAL_TRANSFORM = transforms.Compose([
    transforms.Resize((INPUT_SIZE, INPUT_SIZE)),
    transforms.ToTensor(),
    transforms.Normalize(IMAGENET_MEAN, IMAGENET_STD),
])



# Model

class DualStreamEfficientNet(nn.Module):
    """
    Matches checkpoint naming:
      local_backbone.*
      global_backbone.*
      main_head.*   (BCE, 1 output: issue/hot-tile)
      aux_head.*    (MSE, 3 outputs: line/value/harmony in ~0..1)
    """

    def __init__(self, main_out: int, aux_out: int, pretrained: bool = False):
        super().__init__()

        weights = models.EfficientNet_B0_Weights.IMAGENET1K_V1 if pretrained else None

        self.local_backbone = models.efficientnet_b0(weights=weights)
        self.global_backbone = models.efficientnet_b0(weights=weights)

        # Return features 
        self.local_backbone.classifier = nn.Identity()
        self.global_backbone.classifier = nn.Identity()

        feat_dim = 1280
        self.main_head = nn.Linear(feat_dim * 2, main_out)
        self.aux_head = nn.Linear(feat_dim * 2, aux_out)

    def forward(self, local_x: torch.Tensor, global_x: torch.Tensor) -> Dict[str, torch.Tensor]:
        lf = self.local_backbone(local_x)    # [B,1280]
        gf = self.global_backbone(global_x)  # [B,1280]
        feats = torch.cat([lf, gf], dim=1)   # [B,2560]
        return {
            "main": self.main_head(feats),   # [B,1]
            "aux": self.aux_head(feats),     # [B,3]
        }



# helpers

def _strip_module_prefix(sd: Dict[str, torch.Tensor]) -> Dict[str, torch.Tensor]:
    if not any(k.startswith("module.") for k in sd.keys()):
        return sd
    return {k.replace("module.", "", 1): v for k, v in sd.items()}


def _load_state_dict(path: str) -> Dict[str, torch.Tensor]:
    obj = torch.load(path, map_location=DEVICE)

    # raw state_dict
    if isinstance(obj, dict) and obj and all(isinstance(v, torch.Tensor) for v in obj.values()):
        return obj

    # checkpoint 
    if isinstance(obj, dict) and "model_state_dict" in obj:
        return obj["model_state_dict"]

    raise RuntimeError("Unsupported .pt format: expected state_dict or checkpoint with model_state_dict.")


def _infer_head_dims(sd: Dict[str, torch.Tensor]) -> Tuple[int, int, int]:
    if "main_head.weight" not in sd:
        raise RuntimeError("state_dict missing main_head.weight")
    if "aux_head.weight" not in sd:
        raise RuntimeError("state_dict missing aux_head.weight")

    main_w = sd["main_head.weight"]  # [main_out, feat_in]
    aux_w = sd["aux_head.weight"]    # [aux_out, feat_in]

    if main_w.ndim != 2 or aux_w.ndim != 2:
        raise RuntimeError("Unexpected head weight dims; expected 2D tensors.")

    feat_in = int(main_w.shape[1])
    main_out = int(main_w.shape[0])
    aux_out = int(aux_w.shape[0])

    return feat_in, main_out, aux_out


def _load_model() -> nn.Module:
    global _MODEL
    if _MODEL is not None:
        return _MODEL

    if not os.path.exists(MODEL_PATH):
        raise RuntimeError(f"Model file not found at: {MODEL_PATH}")

    sd = _load_state_dict(MODEL_PATH)
    sd = _strip_module_prefix(sd)

    print("First 20 state_dict keys:", list(sd.keys())[:20], flush=True)

    feat_in, main_out, aux_out = _infer_head_dims(sd)
    print(f"Inferred head dims: feat_in={feat_in}, main_out={main_out}, aux_out={aux_out}", flush=True)

    if feat_in != 2560:
        raise RuntimeError(f"Unexpected feat_in={feat_in}. Expected 2560 for dual-stream EfficientNetB0.")
    if main_out != 1:
        raise RuntimeError(f"Unexpected main_out={main_out}. Expected main_out=1.")
    if aux_out != 3:
        raise RuntimeError(f"Unexpected aux_out={aux_out}. Expected aux_out=3.")

    model = DualStreamEfficientNet(main_out=main_out, aux_out=aux_out, pretrained=False).to(DEVICE)
    model.eval()
    model.load_state_dict(sd, strict=True)

    _MODEL = model
    print(" Loaded DualStreamEfficientNet OK", flush=True)
    return _MODEL



# Image helpers

def _pil_from_bytes(img_bytes: bytes) -> Image.Image:
    return Image.open(io.BytesIO(img_bytes)).convert("RGB")


def _clamp_0_100(x: float) -> int:
    return int(max(0, min(100, round(float(x)))))


def _clamp01(x: float) -> float:
    return float(max(0.0, min(1.0, x)))


def _norm_range(x: float, lo: float, hi: float) -> float:
    if hi <= lo:
        return 0.0
    return _clamp01((float(x) - lo) / (hi - lo))


def _content_rgb(square_img: Image.Image, meta: Dict[str, int]) -> np.ndarray:
    arr = np.asarray(square_img, dtype=np.float32) / 255.0
    x0 = int(meta["pad_left"])
    y0 = int(meta["pad_top"])
    x1 = x0 + int(meta["resized_width"])
    y1 = y0 + int(meta["resized_height"])
    content = arr[y0:y1, x0:x1, :]
    if content.size == 0:
        return arr
    return content


def _rgb_to_hsv_np(rgb: np.ndarray) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
    r = rgb[..., 0]
    g = rgb[..., 1]
    b = rgb[..., 2]

    maxc = np.max(rgb, axis=-1)
    minc = np.min(rgb, axis=-1)
    delta = maxc - minc

    h = np.zeros_like(maxc, dtype=np.float32)
    s = np.zeros_like(maxc, dtype=np.float32)
    v = maxc.astype(np.float32)

    nonzero = delta > 1e-8
    with np.errstate(divide="ignore", invalid="ignore"):
        s = np.where(maxc > 1e-8, delta / maxc, 0.0).astype(np.float32)

        rmax = nonzero & (maxc == r)
        gmax = nonzero & (maxc == g)
        bmax = nonzero & (maxc == b)

        h[rmax] = np.mod((g[rmax] - b[rmax]) / delta[rmax], 6.0)
        h[gmax] = ((b[gmax] - r[gmax]) / delta[gmax]) + 2.0
        h[bmax] = ((r[bmax] - g[bmax]) / delta[bmax]) + 4.0
        h = (h / 6.0).astype(np.float32)

    return h, s, v


def _rgb_u8_from_pil(img: Image.Image) -> np.ndarray:
    return np.asarray(img.convert("RGB"), dtype=np.uint8)


def _resize_for_legacy_metrics(img: Image.Image, max_dim: int = LEGACY_METRIC_MAX_DIM) -> Image.Image:
    w, h = img.size
    longest = max(w, h)
    if longest <= max_dim:
        return img

    scale = max_dim / float(longest)
    resized_w = max(1, int(round(w * scale)))
    resized_h = max(1, int(round(h * scale)))
    return img.resize((resized_w, resized_h), resample=Image.Resampling.BILINEAR)


def _gray_u8_from_rgb(rgb_u8: np.ndarray) -> np.ndarray:
    gray = (
        (0.299 * rgb_u8[..., 0]) +
        (0.587 * rgb_u8[..., 1]) +
        (0.114 * rgb_u8[..., 2])
    )
    return np.clip(np.rint(gray), 0, 255).astype(np.uint8)


def _convolve2d(image: np.ndarray, kernel: np.ndarray) -> np.ndarray:
    kh, kw = kernel.shape
    pad_y = kh // 2
    pad_x = kw // 2
    padded = np.pad(image, ((pad_y, pad_y), (pad_x, pad_x)), mode="edge")
    windows = np.lib.stride_tricks.sliding_window_view(padded, (kh, kw))
    return np.tensordot(windows, kernel, axes=((2, 3), (0, 1))).astype(np.float32)


def _canny_edges(gray_u8: np.ndarray, low_threshold: float = 50.0, high_threshold: float = 150.0) -> np.ndarray:
    gray = gray_u8.astype(np.float32)

    gaussian_kernel = np.array([
        [2, 4, 5, 4, 2],
        [4, 9, 12, 9, 4],
        [5, 12, 15, 12, 5],
        [4, 9, 12, 9, 4],
        [2, 4, 5, 4, 2],
    ], dtype=np.float32) / 159.0
    blurred = _convolve2d(gray, gaussian_kernel)

    sobel_x = np.array([
        [-1, 0, 1],
        [-2, 0, 2],
        [-1, 0, 1],
    ], dtype=np.float32)
    sobel_y = np.array([
        [1, 2, 1],
        [0, 0, 0],
        [-1, -2, -1],
    ], dtype=np.float32)

    grad_x = _convolve2d(blurred, sobel_x)
    grad_y = _convolve2d(blurred, sobel_y)
    magnitude = np.abs(grad_x) + np.abs(grad_y)

    angle = (np.rad2deg(np.arctan2(grad_y, grad_x)) + 180.0) % 180.0
    direction = np.zeros_like(angle, dtype=np.uint8)
    direction[(angle >= 22.5) & (angle < 67.5)] = 45
    direction[(angle >= 67.5) & (angle < 112.5)] = 90
    direction[(angle >= 112.5) & (angle < 157.5)] = 135

    left = np.roll(magnitude, 1, axis=1)
    right = np.roll(magnitude, -1, axis=1)
    up = np.roll(magnitude, -1, axis=0)
    down = np.roll(magnitude, 1, axis=0)
    up_right = np.roll(up, -1, axis=1)
    down_left = np.roll(down, 1, axis=1)
    up_left = np.roll(up, 1, axis=1)
    down_right = np.roll(down, -1, axis=1)

    keep = np.zeros_like(magnitude, dtype=bool)
    mask_0 = direction == 0
    mask_45 = direction == 45
    mask_90 = direction == 90
    mask_135 = direction == 135

    keep |= mask_0 & (magnitude >= left) & (magnitude >= right)
    keep |= mask_45 & (magnitude >= up_right) & (magnitude >= down_left)
    keep |= mask_90 & (magnitude >= up) & (magnitude >= down)
    keep |= mask_135 & (magnitude >= up_left) & (magnitude >= down_right)

    keep[[0, -1], :] = False
    keep[:, [0, -1]] = False
    nms = np.where(keep, magnitude, 0.0)

    strong = nms >= high_threshold
    weak = nms >= low_threshold
    if not np.any(strong):
        return strong

    edges = strong.copy()
    stack = [tuple(idx) for idx in np.argwhere(strong)]
    height, width = edges.shape

    while stack:
        y, x = stack.pop()
        for ny in range(max(0, y - 1), min(height, y + 2)):
            for nx in range(max(0, x - 1), min(width, x + 2)):
                if weak[ny, nx] and not edges[ny, nx]:
                    edges[ny, nx] = True
                    stack.append((ny, nx))

    return edges


def _legacy_value_score(rgb_u8: np.ndarray) -> Tuple[int, Dict[str, float]]:
    gray_u8 = _gray_u8_from_rgb(rgb_u8)
    ink_mask = gray_u8 < 250
    ink_pixels = int(np.count_nonzero(ink_mask))
    if ink_pixels == 0:
        return 0, {
            "ink_pixels": 0.0,
            "dynamic_range": 0.0,
            "dark_percentile": 0.0,
            "light_percentile": 0.0,
        }

    ink_values = gray_u8[ink_mask].astype(np.float32)
    dark_p = float(np.percentile(ink_values, 10))
    light_p = float(np.percentile(ink_values, 90))
    dynamic_range = float(light_p - dark_p)

    score = 0
    if dynamic_range > 30.0:
        score = min(100, int((dynamic_range / 200.0) * 100.0))

    return score, {
        "ink_pixels": float(ink_pixels),
        "dynamic_range": dynamic_range,
        "dark_percentile": dark_p,
        "light_percentile": light_p,
    }


def _legacy_line_score(rgb_u8: np.ndarray) -> Tuple[int, Dict[str, float]]:
    gray_u8 = _gray_u8_from_rgb(rgb_u8)
    ink_mask = gray_u8 < 250
    ink_pixel_count = int(np.count_nonzero(ink_mask))
    if ink_pixel_count == 0:
        return 0, {
            "ink_pixel_count": 0.0,
            "edge_pixel_count": 0.0,
            "edge_ratio": 0.0,
        }

    edges = _canny_edges(gray_u8, low_threshold=50.0, high_threshold=150.0)
    edge_pixel_count = int(np.count_nonzero(edges))
    ratio = float(edge_pixel_count / ink_pixel_count)
    score = 100 - int((ratio - 0.15) * 300.0)

    return max(0, min(100, score)), {
        "ink_pixel_count": float(ink_pixel_count),
        "edge_pixel_count": float(edge_pixel_count),
        "edge_ratio": ratio,
    }


def _kmeans_plus_plus_init(points: np.ndarray, k: int, rng: np.random.Generator) -> np.ndarray:
    num_points = points.shape[0]
    centers = np.empty((k, points.shape[1]), dtype=np.float32)
    centers[0] = points[rng.integers(num_points)]
    closest_dist_sq = np.sum((points - centers[0]) ** 2, axis=1)

    for idx in range(1, k):
        total = float(np.sum(closest_dist_sq))
        if total <= 1e-8:
            centers[idx:] = points[rng.integers(num_points, size=k - idx)]
            break

        probs = closest_dist_sq / total
        centers[idx] = points[rng.choice(num_points, p=probs)]
        dist_sq = np.sum((points - centers[idx]) ** 2, axis=1)
        closest_dist_sq = np.minimum(closest_dist_sq, dist_sq)

    return centers


def _run_kmeans(points: np.ndarray, k: int = 4, max_iter: int = 10, attempts: int = 10) -> Tuple[np.ndarray, np.ndarray]:
    num_points = points.shape[0]
    if num_points == 0:
        return np.empty((0,), dtype=np.int32), np.empty((0, points.shape[1]), dtype=np.float32)

    k = min(k, num_points)
    best_labels = np.zeros((num_points,), dtype=np.int32)
    best_centers = np.zeros((k, points.shape[1]), dtype=np.float32)
    best_inertia = float("inf")
    rng = np.random.default_rng(0)

    for _ in range(attempts):
        centers = _kmeans_plus_plus_init(points, k, rng)

        for _ in range(max_iter):
            distances = np.sum((points[:, None, :] - centers[None, :, :]) ** 2, axis=2)
            labels = np.argmin(distances, axis=1).astype(np.int32)

            new_centers = centers.copy()
            for cluster_idx in range(k):
                mask = labels == cluster_idx
                if np.any(mask):
                    new_centers[cluster_idx] = points[mask].mean(axis=0)
                else:
                    new_centers[cluster_idx] = points[rng.integers(num_points)]

            if np.allclose(new_centers, centers, atol=1e-3):
                centers = new_centers
                break
            centers = new_centers

        distances = np.sum((points[:, None, :] - centers[None, :, :]) ** 2, axis=2)
        labels = np.argmin(distances, axis=1).astype(np.int32)
        inertia = float(np.sum(np.min(distances, axis=1)))
        if inertia < best_inertia:
            best_inertia = inertia
            best_labels = labels
            best_centers = centers.copy()

    return best_labels, best_centers


def _legacy_harmony_score(rgb_u8: np.ndarray, k: int = 4) -> Tuple[int, Dict[str, Any]]:
    rgb = rgb_u8.astype(np.float32) / 255.0
    h, s, v = _rgb_to_hsv_np(rgb)
    hsv_cv = np.stack((h * 179.0, s * 255.0, v * 255.0), axis=-1).astype(np.float32)
    pixels = hsv_cv.reshape(-1, 3)

    valid_mask = (
        (pixels[:, 1] > 20.0) &
        (pixels[:, 2] > 20.0) &
        (pixels[:, 2] < 250.0)
    )
    valid_pixels = pixels[valid_mask]
    if valid_pixels.shape[0] < 100:
        return 0, {
            "dominant_hues": [],
            "cluster_weights": [],
            "best_fit_name": "None",
            "min_error": None,
            "valid_pixels": float(valid_pixels.shape[0]),
        }

    sampled_pixels = valid_pixels
    if valid_pixels.shape[0] > HARMONY_MAX_SAMPLES:
        sample_rng = np.random.default_rng(0)
        sample_idx = sample_rng.choice(valid_pixels.shape[0], size=HARMONY_MAX_SAMPLES, replace=False)
        sampled_pixels = valid_pixels[sample_idx]

    labels, centers = _run_kmeans(sampled_pixels, k=k, max_iter=6, attempts=4)
    dominant_hues = [float(center[0] * 2.0) for center in centers]
    counts = np.bincount(labels, minlength=len(centers)).astype(np.float32)
    total = float(np.sum(counts))
    if total <= 1e-8:
        return 0, {
            "dominant_hues": [],
            "cluster_weights": [],
            "best_fit_name": "None",
            "min_error": None,
            "valid_pixels": float(valid_pixels.shape[0]),
        }
    cluster_weights = [float(count / total) for count in counts]

    templates = {
        "Analogous": [0, 30],
        "Complementary": [0, 180],
        "Triadic": [0, 120, 240],
        "Split-Complementary": [0, 150, 210],
        "Tetradic": [0, 90, 180, 270],
    }

    best_fit_name = "None"
    min_error = float("inf")

    for name, angles in templates.items():
        current_template_error = float("inf")

        for base_hue in dominant_hues:
            ideal_angles = [float((base_hue + angle) % 360.0) for angle in angles]
            total_dist = 0.0
            for hue, weight in zip(dominant_hues, cluster_weights):
                distances = [min(abs(hue - ideal), 360.0 - abs(hue - ideal)) for ideal in ideal_angles]
                total_dist += weight * min(distances)

            current_template_error = min(current_template_error, total_dist)

        if current_template_error < min_error:
            min_error = current_template_error
            best_fit_name = name

    score = max(0, int(100.0 - (min_error * 2.0)))
    clusters = [
        {"hue": float(hue), "weight": float(weight)}
        for hue, weight in sorted(zip(dominant_hues, cluster_weights), key=lambda item: item[1], reverse=True)
    ]
    return score, {
        "dominant_hues": [cluster["hue"] for cluster in clusters],
        "cluster_weights": [cluster["weight"] for cluster in clusters],
        "clusters": clusters,
        "best_fit_name": best_fit_name,
        "min_error": float(min_error),
        "valid_pixels": float(valid_pixels.shape[0]),
        "sampled_pixels": float(sampled_pixels.shape[0]),
    }


def _heuristic_value_score(content_rgb: np.ndarray) -> Tuple[float, Dict[str, float]]:
    luma = (
        0.2126 * content_rgb[..., 0] +
        0.7152 * content_rgb[..., 1] +
        0.0722 * content_rgb[..., 2]
    ).astype(np.float32)

    p10, p90 = np.percentile(luma, [10, 90])
    dynamic_range = float(p90 - p10)
    luma_std = float(np.std(luma))
    mean_luma = float(np.mean(luma))

    gx = np.abs(np.diff(luma, axis=1))
    gy = np.abs(np.diff(luma, axis=0))
    local_contrast = float((np.mean(gx) + np.mean(gy)) * 0.5)

    dr_n = _norm_range(dynamic_range, 0.18, 0.65)
    std_n = _norm_range(luma_std, 0.07, 0.30)
    edge_n = _norm_range(local_contrast, 0.01, 0.12)
    midtone_n = 1.0 - min(1.0, abs(mean_luma - 0.5) / 0.5)

    score = _clamp01((0.45 * dr_n) + (0.25 * std_n) + (0.20 * edge_n) + (0.10 * midtone_n))
    debug = {
        "dynamic_range": dynamic_range,
        "luma_std": luma_std,
        "local_contrast": local_contrast,
        "mean_luma": mean_luma,
        "dynamic_range_n": dr_n,
        "luma_std_n": std_n,
        "local_contrast_n": edge_n,
        "midtone_n": midtone_n,
    }
    return score, debug


def _heuristic_harmony_score(content_rgb: np.ndarray) -> Tuple[float, Dict[str, float]]:
    h, s, v = _rgb_to_hsv_np(content_rgb)
    weights = (s * v).astype(np.float32)

    valid = weights > 0.02
    if np.sum(valid) < 64:
        sat_mean = float(np.mean(s))
        fallback = _clamp01(_norm_range(sat_mean, 0.10, 0.50))
        return fallback, {
            "sat_mean": sat_mean,
            "top3_share": 0.0,
            "entropy": 1.0,
            "warm_fraction": 0.5,
            "cohesion_n": 0.0,
            "entropy_n": 0.0,
            "vibrancy_n": fallback,
            "temperature_n": 0.5,
        }

    hv = h[valid]
    sv = s[valid]
    wv = weights[valid]

    bins = 24
    hist, _ = np.histogram(hv, bins=bins, range=(0.0, 1.0), weights=wv)
    total = float(np.sum(hist))
    if total <= 1e-8:
        return 0.5, {
            "sat_mean": float(np.mean(sv)),
            "top3_share": 0.0,
            "entropy": 1.0,
            "warm_fraction": 0.5,
            "cohesion_n": 0.0,
            "entropy_n": 0.0,
            "vibrancy_n": 0.0,
            "temperature_n": 0.5,
        }

    p = hist / total
    top3_share = float(np.sort(p)[-3:].sum())
    nonzero = p > 1e-8
    entropy = float(-np.sum(p[nonzero] * np.log(p[nonzero])) / np.log(bins))
    sat_mean = float(np.mean(sv))

    warm_w = float(np.sum(wv[(hv < (1.0 / 6.0)) | (hv >= (5.0 / 6.0))]))
    cool_w = float(np.sum(wv[(hv >= (1.0 / 3.0)) & (hv < (2.0 / 3.0))]))
    wc_total = warm_w + cool_w
    warm_fraction = (warm_w / wc_total) if wc_total > 1e-8 else 0.5

    cohesion_n = _norm_range(top3_share, 0.35, 0.85)
    entropy_n = 1.0 - _norm_range(entropy, 0.55, 0.95)
    vibrancy_n = _norm_range(sat_mean, 0.12, 0.55)
    temperature_n = 1.0 - min(1.0, abs(warm_fraction - 0.65) / 0.65)

    score = _clamp01(
        (0.45 * cohesion_n) +
        (0.25 * entropy_n) +
        (0.20 * vibrancy_n) +
        (0.10 * temperature_n)
    )

    debug = {
        "sat_mean": sat_mean,
        "top3_share": top3_share,
        "entropy": entropy,
        "warm_fraction": warm_fraction,
        "cohesion_n": cohesion_n,
        "entropy_n": entropy_n,
        "vibrancy_n": vibrancy_n,
        "temperature_n": temperature_n,
    }
    return score, debug


def _letterbox_to_square(
    img: Image.Image,
    target_size: int = TARGET_SIZE,
    pad_color: Tuple[int, int, int] = PAD_COLOR,
) -> Tuple[Image.Image, Dict[str, int]]:
    """
    Letterbox image to (target_size x target_size) without distorting aspect ratio.
    Uses LANCZOS resize and pads with pad_color which is white in this case.

    Returns:
      (square_img, meta)
      meta includes resized_width/resized_height/pad_left/pad_top/target_size
    """
    w, h = img.size
    if w <= 0 or h <= 0:
        raise RuntimeError(f"Invalid image size: {w}x{h}")

    # scale so that the longer side becomes target_size
    scale = min(target_size / w, target_size / h)
    new_w = max(1, int(round(w * scale)))
    new_h = max(1, int(round(h * scale)))

    # high-quality resize
    resized = img.resize((new_w, new_h), resample=Image.Resampling.LANCZOS)

    # create square canvas + paste centered
    square = Image.new("RGB", (target_size, target_size), pad_color)
    pad_left = (target_size - new_w) // 2
    pad_top = (target_size - new_h) // 2
    square.paste(resized, (pad_left, pad_top))

    meta = {
        "target_size": target_size,
        "resized_width": new_w,
        "resized_height": new_h,
        "pad_left": pad_left,
        "pad_top": pad_top,
    }
    return square, meta


def _extract_patch_from_square(square_img: Image.Image, r: int, c: int, grid: int = GRID) -> Image.Image:
    """
    Extract tile (r,c) from a square letterboxed image.
    This matches training where images were normalized to a fixed square and then tiled.
    """
    w, h = square_img.size
    # should be square
    tile = w / grid
    left = int(round(c * tile))
    top = int(round(r * tile))
    right = int(round((c + 1) * tile))
    bottom = int(round((r + 1) * tile))
    return square_img.crop((left, top, right, bottom))



# Inference 

def run_inference(img_bytes: bytes) -> Dict[str, Any]:
    try:
        model = _load_model()

        raw_img = _pil_from_bytes(img_bytes)

        # letterbox to training-like square
        square_img, meta = _letterbox_to_square(raw_img, target_size=TARGET_SIZE, pad_color=PAD_COLOR)

        # global branch uses the letterboxed square too
        global_t = GLOBAL_TRANSFORM(square_img).unsqueeze(0).to(DEVICE)  # [1,3,224,224]

        # main -> 16x16 issue heatmap
        issue_heatmap = np.zeros((GRID, GRID), dtype=np.float32)

        # aux -> regression line/value/harmony 
        aux_sum = np.zeros((3,), dtype=np.float32)

        # Debug stats
        main_probs_all = []
        aux_raw_all = []

        with torch.no_grad():
            for r in range(GRID):
                for c in range(GRID):
                    patch = _extract_patch_from_square(square_img, r, c, grid=GRID)
                    local_t = LOCAL_TRANSFORM(patch).unsqueeze(0).to(DEVICE)

                    out = model(local_t, global_t)

                    # main: scalar issue probability
                    main_logit = out["main"].squeeze(0).squeeze(0)
                    issue_prob = float(torch.sigmoid(main_logit).item())
                    issue_heatmap[r, c] = issue_prob
                    main_probs_all.append(issue_prob)

                    # aux: regression (no sigmoid)
                    aux_vec = out["aux"].squeeze(0).cpu().numpy().astype(np.float32)  
                    aux_raw_all.append(aux_vec.tolist())

                    aux_sum += aux_vec

        aux_mean = aux_sum / float(GRID * GRID)

        line_model = _clamp01(float(aux_mean[0]))
        value_model = _clamp01(float(aux_mean[1]))
        harmony_model = _clamp01(float(aux_mean[2]))

        metric_img = _resize_for_legacy_metrics(raw_img)
        metric_rgb_u8 = _rgb_u8_from_pil(metric_img)
        line_score, line_debug = _legacy_line_score(metric_rgb_u8)
        value_score, value_debug = _legacy_value_score(metric_rgb_u8)
        harmony_score, harmony_debug = _legacy_harmony_score(metric_rgb_u8)

        overall_good = _clamp_0_100((1.0 - float(issue_heatmap.mean())) * 100.0)

        return {
            "success": True,
            "model_used": True,
            "metrics": {
                "line": line_score,
                "value": value_score,
                "harmony": harmony_score,
            },
            "overall": overall_good,
            "heatmaps": {
                "issue": issue_heatmap.tolist(),
            },
            "debug": {
                "device": DEVICE,
                "model_path": MODEL_PATH,
                "grid": f"{GRID}x{GRID}",
                "preprocess": {
                    "letterbox": True,
                    "target_size": meta["target_size"],
                    "resized_width": meta["resized_width"],
                    "resized_height": meta["resized_height"],
                    "pad_left": meta["pad_left"],
                    "pad_top": meta["pad_top"],
                    "pad_color": PAD_COLOR,
                    "resample": "LANCZOS",
                },
                "main_issue_prob_mean": float(np.mean(main_probs_all)) if main_probs_all else None,
                "main_issue_prob_min": float(np.min(main_probs_all)) if main_probs_all else None,
                "main_issue_prob_max": float(np.max(main_probs_all)) if main_probs_all else None,
                "aux_mean_raw": aux_mean.tolist(),
                "metric_components": {
                    "line_model": line_model,
                    "value_model": value_model,
                    "harmony_model": harmony_model,
                    "line_legacy": line_score / 100.0,
                    "value_legacy": value_score / 100.0,
                    "harmony_legacy": harmony_score / 100.0,
                    "legacy_metric_image_size": {
                        "width": int(metric_img.size[0]),
                        "height": int(metric_img.size[1]),
                        "max_dim": LEGACY_METRIC_MAX_DIM,
                    },
                    "line_legacy_debug": line_debug,
                    "value_legacy_debug": value_debug,
                    "harmony_legacy_debug": harmony_debug,
                },
                "note": (
                    "Inference matches training geometry by letterboxing input to a fixed square "
                    f"({TARGET_SIZE}x{TARGET_SIZE}), then tiling 16x16. main_head -> issue via sigmoid; "
                    "aux_head -> regression for [line,value,harmony] (no sigmoid). "
                    "User-facing metrics are restored to the prior K-means, Canny-edge, "
                    "and grayscale-percentile pipeline."
                ),
            },
        }

    except Exception as e:
        return {
            "success": False,
            "model_used": False,
            "error": "MODEL_INFERENCE_FAILED",
            "message": str(e),
            "debug": {
                "device": DEVICE,
                "model_path": MODEL_PATH,
                "traceback": traceback.format_exc(),
            },
        }

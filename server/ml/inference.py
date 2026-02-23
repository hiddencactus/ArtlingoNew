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

        # clamp to [0,1] then map to 0..100 for user-facing
        line_score = _clamp_0_100(_clamp01(float(aux_mean[0])) * 100.0)
        value_score = _clamp_0_100(_clamp01(float(aux_mean[1])) * 100.0)
        harmony_score = _clamp_0_100(_clamp01(float(aux_mean[2])) * 100.0)

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
                "note": (
                    "Inference matches training geometry by letterboxing input to a fixed square "
                    f"({TARGET_SIZE}x{TARGET_SIZE}), then tiling 16x16. main_head -> issue via sigmoid; "
                    "aux_head -> regression for [line,value,harmony] (no sigmoid)."
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

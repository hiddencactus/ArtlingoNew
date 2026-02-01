"""
Resize and letterbox images to a square target size with Lanczos resampling.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from PIL import Image, ImageOps


SUPPORTED_EXTS = {".jpg", ".jpeg", ".png", ".webp"}


def parse_background(value: str) -> tuple[int, int, int]:
    value = value.strip().lower()
    named = {
        "white": (255, 255, 255),
        "black": (0, 0, 0),
        "gray": (128, 128, 128),
        "grey": (128, 128, 128),
    }
    if value in named:
        return named[value]

    if value.startswith("#"):
        value = value[1:]
        if len(value) != 6:
            raise ValueError("Hex color must be 6 characters like #ffffff.")
        return (int(value[0:2], 16), int(value[2:4], 16), int(value[4:6], 16))

    parts = [part.strip() for part in value.split(",")]
    if len(parts) == 3 and all(part.isdigit() for part in parts):
        rgb = tuple(int(part) for part in parts)
        if all(0 <= channel <= 255 for channel in rgb):
            return rgb  # type: ignore[return-value]

    raise ValueError("Background must be name, #RRGGBB, or R,G,B.")


def letterbox_resize(
    image: Image.Image,
    size: int,
    background: tuple[int, int, int],
    resample: int,
) -> tuple[Image.Image, dict]:
    image = ImageOps.exif_transpose(image)
    has_alpha = image.mode in ("RGBA", "LA") or (
        image.mode == "P" and "transparency" in image.info
    )
    image = image.convert("RGBA" if has_alpha else "RGB")

    width, height = image.size
    if width == 0 or height == 0:
        raise ValueError("Image has invalid dimensions.")

    scale = min(size / width, size / height)
    new_width = max(1, int(round(width * scale)))
    new_height = max(1, int(round(height * scale)))
    image = image.resize((new_width, new_height), resample=resample)

    pad_left = (size - new_width) // 2
    pad_top = (size - new_height) // 2
    pad_right = size - new_width - pad_left
    pad_bottom = size - new_height - pad_top

    if has_alpha:
        canvas = Image.new("RGBA", (size, size), background + (255,))
        canvas.alpha_composite(image, (pad_left, pad_top))
        resized = canvas.convert("RGB")
    else:
        canvas = Image.new("RGB", (size, size), background)
        canvas.paste(image, (pad_left, pad_top))
        resized = canvas

    metadata = {
        "original_width": width,
        "original_height": height,
        "resized_width": new_width,
        "resized_height": new_height,
        "target_size": size,
        "scale": scale,
        "pad_left": pad_left,
        "pad_top": pad_top,
        "pad_right": pad_right,
        "pad_bottom": pad_bottom,
        "background_rgb": list(background),
    }

    return resized, metadata


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Letterbox images to a square size using Lanczos resampling."
    )
    parser.add_argument(
        "-i",
        "--input",
        default=None,
        help="Input folder (default: server/static/training_images).",
    )
    parser.add_argument(
        "-o",
        "--output",
        default=None,
        help="Output folder (default: server/static/processed_images).",
    )
    parser.add_argument(
        "-s",
        "--size",
        type=int,
        default=1024,
        help="Output size in pixels (default: 1024).",
    )
    parser.add_argument(
        "-b",
        "--background",
        default="white",
        help="Background color: name, #RRGGBB, or R,G,B (default: white).",
    )
    parser.add_argument(
        "--overwrite",
        action="store_true",
        help="Overwrite existing files in the output folder.",
    )
    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()

    script_dir = Path(__file__).resolve().parent
    input_dir = Path(args.input) if args.input else script_dir / "static" / "training_images"
    output_dir = (
        Path(args.output) if args.output else script_dir / "static" / "processed_images"
    )

    input_dir = input_dir.resolve()
    output_dir = output_dir.resolve()

    if not input_dir.is_dir():
        raise SystemExit(f"Input folder not found: {input_dir}")

    output_dir.mkdir(parents=True, exist_ok=True)
    background = parse_background(args.background)

    resample = Image.Resampling.LANCZOS if hasattr(Image, "Resampling") else Image.LANCZOS

    processed = 0
    skipped = 0
    failed = 0

    for src in input_dir.rglob("*"):
        if not src.is_file():
            continue
        if src.suffix.lower() not in SUPPORTED_EXTS:
            continue
        if output_dir in src.parents:
            continue

        rel_path = src.relative_to(input_dir)
        dst = output_dir / rel_path
        if dst.exists() and not args.overwrite:
            skipped += 1
            continue

        dst.parent.mkdir(parents=True, exist_ok=True)

        try:
            with Image.open(src) as img:
                resized, metadata = letterbox_resize(img, args.size, background, resample)
                save_kwargs = {}
                if dst.suffix.lower() in (".jpg", ".jpeg", ".webp"):
                    save_kwargs = {"quality": 95}
                resized.save(dst, **save_kwargs)
                metadata["source"] = str(rel_path).replace("\\", "/")
                metadata_path = dst.with_suffix(dst.suffix + ".json")
                with metadata_path.open("w", encoding="utf-8") as handle:
                    json.dump(metadata, handle, indent=2)
            processed += 1
        except Exception as exc:
            failed += 1
            print(f"[ERROR] {src} -> {dst}: {exc}")

    print(
        f"Done. Processed: {processed}, skipped: {skipped}, failed: {failed}, output: {output_dir}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

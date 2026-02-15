#!/usr/bin/env python3
"""
gobo_pad.py
Create "projector gobo" variants by adding black padding (increasing canvas size)
so the original image occupies a chosen percentage of the output frame.

Example:
  python3 gobo_pad.py --input BE100.jpg --prefix BE --out ./out --sizes 100,75,50,33,25,10

Notes:
- The original image pixels are NOT resampled (no blur).
- Output dimensions increase for smaller percentages.
"""

from __future__ import annotations
import argparse
import os
from pathlib import Path
from typing import List, Tuple

from PIL import Image

def parse_sizes(s: str) -> List[int]:
    out = []
    for part in s.split(","):
        part = part.strip()
        if not part:
            continue
        val = int(part)
        if val <= 0 or val > 100:
            raise ValueError(f"Size must be 1..100, got {val}")
        out.append(val)
    if 100 not in out:
        out.insert(0, 100)
    return out

def new_canvas_size(orig_w: int, orig_h: int, percent: int) -> Tuple[int, int]:
    # If original should occupy `percent` of the frame in both width/height:
    # frame_w = orig_w / (percent/100)
    scale = percent / 100.0
    frame_w = int(round(orig_w / scale))
    frame_h = int(round(orig_h / scale))
    return frame_w, frame_h

def save_jpeg(img: Image.Image, out_path: Path, quality: int = 95) -> None:
    # Ensure RGB for JPEG
    if img.mode != "RGB":
        img = img.convert("RGB")
    img.save(
        out_path,
        format="JPEG",
        quality=quality,
        subsampling=0,   # keep edges cleaner
        optimize=True
    )

def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", required=True, help="Path to the BE100-style JPEG")
    ap.add_argument("--prefix", default=None, help="Output prefix (ex: BE). Default: inferred from input name")
    ap.add_argument("--out", default=".", help="Output folder")
    ap.add_argument("--sizes", default="100,75,50,33,25,10", help="Comma-separated percents (1..100)")
    ap.add_argument("--quality", type=int, default=95, help="JPEG quality (1..100)")
    args = ap.parse_args()

    in_path = Path(args.input).expanduser().resolve()
    out_dir = Path(args.out).expanduser().resolve()
    out_dir.mkdir(parents=True, exist_ok=True)

    sizes = parse_sizes(args.sizes)

    # Infer prefix from filename if not provided: BE100.jpg -> BE
    if args.prefix is None:
        stem = in_path.stem  # BE100
        # strip trailing digits (100/75/50/etc)
        prefix = stem.rstrip("0123456789")
        prefix = prefix if prefix else stem
    else:
        prefix = args.prefix

    with Image.open(in_path) as im:
        im = im.convert("RGB")
        orig_w, orig_h = im.size

        for p in sizes:
            frame_w, frame_h = new_canvas_size(orig_w, orig_h, p)

            # Create black canvas and center original image
            canvas = Image.new("RGB", (frame_w, frame_h), (0, 0, 0))
            x = (frame_w - orig_w) // 2
            y = (frame_h - orig_h) // 2
            canvas.paste(im, (x, y))

            out_name = f"{prefix}{p}.jpg"
            out_path = out_dir / out_name
            save_jpeg(canvas, out_path, quality=args.quality)

    print(f"Done. Wrote {len(sizes)} files to: {out_dir}")

if __name__ == "__main__":
    main()
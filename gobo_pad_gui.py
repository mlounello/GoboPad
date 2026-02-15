#!/usr/bin/env python3
"""
Gobo Padder GUI
- Adds black canvas around an image so the original occupies N% of the output frame
- Does NOT resample the original pixels (stays sharp)
- Batch processes multiple files
- Outputs JPEGs named PREFIX{percent}.jpg for each input

Tested conceptually for macOS/Windows with Tkinter + Pillow.

Packaging notes (PyInstaller) at bottom.
"""

from __future__ import annotations

import os
from pathlib import Path
import tkinter as tk
from tkinter import ttk, filedialog, messagebox

from PIL import Image


DEFAULT_SIZES = "100,75,50,33,25,10"


def parse_sizes(s: str) -> list[int]:
    parts = [p.strip() for p in s.split(",") if p.strip()]
    if not parts:
        raise ValueError("Sizes list is empty.")
    sizes: list[int] = []
    for p in parts:
        val = int(p)
        if val <= 0 or val > 100:
            raise ValueError(f"Size must be 1..100. Got: {val}")
        sizes.append(val)
    # ensure uniqueness while preserving order
    seen = set()
    sizes = [x for x in sizes if not (x in seen or seen.add(x))]
    return sizes


def infer_prefix_from_filename(path: Path) -> str:
    stem = path.stem  # e.g. BE100
    prefix = stem.rstrip("0123456789")
    return prefix if prefix else stem


def new_canvas_size(orig_w: int, orig_h: int, percent: int) -> tuple[int, int]:
    # original should occupy `percent` of output in width and height
    scale = percent / 100.0
    frame_w = int(round(orig_w / scale))
    frame_h = int(round(orig_h / scale))
    return frame_w, frame_h


def save_jpeg(img: Image.Image, out_path: Path, quality: int) -> None:
    if img.mode != "RGB":
        img = img.convert("RGB")
    img.save(
        out_path,
        format="JPEG",
        quality=quality,
        subsampling=0,  # helps keep edges cleaner
        optimize=True,
    )


class App(tk.Tk):
    def __init__(self) -> None:
        super().__init__()
        self.title("Gobo Padder")
        self.minsize(760, 520)

        self.selected_files: list[Path] = []
        self.output_dir: Path | None = None

        self.prefix_var = tk.StringVar(value="")  # if empty, infer per file
        self.sizes_var = tk.StringVar(value=DEFAULT_SIZES)
        self.quality_var = tk.IntVar(value=95)

        self._build_ui()

    def _build_ui(self) -> None:
        pad = 12

        # Top controls
        top = ttk.Frame(self, padding=pad)
        top.pack(fill="x")

        btn_add = ttk.Button(top, text="Add Images...", command=self.add_images)
        btn_add.grid(row=0, column=0, sticky="w")

        btn_clear = ttk.Button(top, text="Clear List", command=self.clear_list)
        btn_clear.grid(row=0, column=1, sticky="w", padx=(8, 0))

        btn_out = ttk.Button(top, text="Choose Output Folder...", command=self.choose_output)
        btn_out.grid(row=0, column=2, sticky="w", padx=(8, 0))

        self.out_label = ttk.Label(top, text="Output: (not set)")
        self.out_label.grid(row=1, column=0, columnspan=3, sticky="w", pady=(8, 0))

        # Settings panel
        settings = ttk.LabelFrame(self, text="Settings", padding=pad)
        settings.pack(fill="x", padx=pad, pady=(0, pad))

        ttk.Label(settings, text="Prefix (optional):").grid(row=0, column=0, sticky="w")
        prefix_entry = ttk.Entry(settings, textvariable=self.prefix_var, width=20)
        prefix_entry.grid(row=0, column=1, sticky="w", padx=(8, 18))

        ttk.Label(settings, text="Sizes (comma-separated):").grid(row=0, column=2, sticky="w")
        sizes_entry = ttk.Entry(settings, textvariable=self.sizes_var, width=24)
        sizes_entry.grid(row=0, column=3, sticky="w", padx=(8, 0))

        ttk.Label(settings, text="JPEG Quality (1-100):").grid(row=1, column=0, sticky="w", pady=(10, 0))
        quality_spin = ttk.Spinbox(settings, from_=1, to=100, textvariable=self.quality_var, width=6)
        quality_spin.grid(row=1, column=1, sticky="w", padx=(8, 18), pady=(10, 0))

        hint = (
            "Behavior: adds black space only (no resampling). "
            "Output size increases as % decreases. "
            "Names: PREFIX{percent}.jpg. "
            "If Prefix is blank, it is inferred from each filename (letters before trailing digits)."
        )
        ttk.Label(settings, text=hint, wraplength=700).grid(row=2, column=0, columnspan=4, sticky="w", pady=(10, 0))

        # File list
        list_frame = ttk.LabelFrame(self, text="Files", padding=pad)
        list_frame.pack(fill="both", expand=True, padx=pad, pady=(0, pad))

        self.listbox = tk.Listbox(list_frame, height=14)
        self.listbox.pack(fill="both", expand=True, side="left")

        scrollbar = ttk.Scrollbar(list_frame, orient="vertical", command=self.listbox.yview)
        scrollbar.pack(side="right", fill="y")
        self.listbox.config(yscrollcommand=scrollbar.set)

        # Bottom action bar
        bottom = ttk.Frame(self, padding=pad)
        bottom.pack(fill="x")

        self.progress = ttk.Progressbar(bottom, mode="determinate")
        self.progress.pack(fill="x", expand=True, side="left")

        btn_run = ttk.Button(bottom, text="Export Variants", command=self.export_variants)
        btn_run.pack(side="right", padx=(10, 0))

    def add_images(self) -> None:
        paths = filedialog.askopenfilenames(
            title="Select images",
            filetypes=[
                ("Images", "*.jpg *.jpeg *.png *.tif *.tiff *.bmp"),
                ("JPEG", "*.jpg *.jpeg"),
                ("PNG", "*.png"),
                ("All files", "*.*"),
            ],
        )
        if not paths:
            return

        for p in paths:
            path = Path(p)
            if path.exists():
                self.selected_files.append(path)

        self._refresh_listbox()

    def clear_list(self) -> None:
        self.selected_files = []
        self._refresh_listbox()

    def choose_output(self) -> None:
        d = filedialog.askdirectory(title="Choose output folder")
        if not d:
            return
        self.output_dir = Path(d)
        self.out_label.config(text=f"Output: {self.output_dir}")

    def _refresh_listbox(self) -> None:
        self.listbox.delete(0, tk.END)
        for p in self.selected_files:
            self.listbox.insert(tk.END, str(p))

    def export_variants(self) -> None:
        if not self.selected_files:
            messagebox.showwarning("No files", "Add at least one image first.")
            return

        if self.output_dir is None:
            messagebox.showwarning("No output folder", "Choose an output folder first.")
            return

        try:
            sizes = parse_sizes(self.sizes_var.get())
        except Exception as e:
            messagebox.showerror("Invalid sizes", str(e))
            return

        quality = int(self.quality_var.get())
        if quality < 1 or quality > 100:
            messagebox.showerror("Invalid quality", "JPEG quality must be 1 to 100.")
            return

        prefix_override = self.prefix_var.get().strip()
        total_steps = len(self.selected_files) * len(sizes)
        self.progress["maximum"] = total_steps
        self.progress["value"] = 0
        self.update_idletasks()

        errors: list[str] = []
        step = 0

        for in_path in self.selected_files:
            try:
                with Image.open(in_path) as im:
                    im = im.convert("RGB")
                    orig_w, orig_h = im.size

                    prefix = prefix_override if prefix_override else infer_prefix_from_filename(in_path)

                    # Create a subfolder per input (optional). If you prefer flat output, set use_subfolder=False.
                    use_subfolder = True
                    out_dir = self.output_dir / in_path.stem if use_subfolder else self.output_dir
                    out_dir.mkdir(parents=True, exist_ok=True)

                    for p in sizes:
                        frame_w, frame_h = new_canvas_size(orig_w, orig_h, p)
                        canvas = Image.new("RGB", (frame_w, frame_h), (0, 0, 0))
                        x = (frame_w - orig_w) // 2
                        y = (frame_h - orig_h) // 2
                        canvas.paste(im, (x, y))

                        out_name = f"{prefix}{p}.jpg"
                        out_path = out_dir / out_name
                        save_jpeg(canvas, out_path, quality=quality)

                        step += 1
                        self.progress["value"] = step
                        self.update_idletasks()

            except Exception as e:
                errors.append(f"{in_path.name}: {e}")

        if errors:
            messagebox.showerror("Completed with errors", "Some files failed:\n\n" + "\n".join(errors))
        else:
            messagebox.showinfo("Done", f"Exported {total_steps} files to:\n{self.output_dir}")


if __name__ == "__main__":
    # Better default styling on macOS/Windows
    try:
        from tkinter import font  # noqa: F401
    except Exception:
        pass

    app = App()
    app.mainloop()
#!/usr/bin/env python3
"""
rasterize.py — renders a PDF to one PNG per page.

Stands in for pdftoppm/poppler (not available in this environment) using
PyMuPDF's own rasterizer, which needs no external binary.

Usage:
    python3 rasterize.py <pdf_path> <output_prefix> [--dpi 150]

Writes <output_prefix>-1.png, <output_prefix>-2.png, ...
Prints the list of written files, one per line, to stdout.
"""
import argparse
import sys
from pathlib import Path

import fitz  # PyMuPDF


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("pdf_path")
    parser.add_argument("output_prefix")
    parser.add_argument("--dpi", type=int, default=150)
    args = parser.parse_args()

    pdf_path = Path(args.pdf_path)
    if not pdf_path.exists():
        print(f"PDF not found: {pdf_path}", file=sys.stderr)
        sys.exit(1)

    doc = fitz.open(pdf_path)
    zoom = args.dpi / 72
    mat = fitz.Matrix(zoom, zoom)
    written = []
    for i, page in enumerate(doc):
        pix = page.get_pixmap(matrix=mat, alpha=False)
        out_path = f"{args.output_prefix}-{i + 1}.png"
        pix.save(out_path)
        written.append(out_path)

    for p in written:
        print(p)


if __name__ == "__main__":
    main()

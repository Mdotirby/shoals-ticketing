#!/usr/bin/env python3
"""
extract.py — pulls exact layout data out of a source PDF.

Usage:
    python3 extract.py <type-slug> [--source-pdf PATH]

Reads doc-templates/source/{type-slug}.pdf (or --source-pdf) and writes:
    doc-templates/templates/{type-slug}/extraction.json
    doc-templates/templates/{type-slug}/assets/images/*.png
    doc-templates/templates/{type-slug}/assets/fonts/*.{ttf,otf}

extraction.json is the raw layout record: page size, every text run with
exact position/font/size/color, every vector line/rect, every image
placement, and which fonts were embedded vs. need a fallback. build_template.py
turns this into template.html + manifest.json.
"""
import argparse
import json
import sys
from pathlib import Path

import fitz  # PyMuPDF

PT_TO_PX = 96 / 72

ROOT = Path(__file__).resolve().parent.parent

# Fonts PyMuPDF can extract as embedded font programs (skip Type3/CID base14 etc.)
EMBEDDABLE_EXTS = {"ttf", "otf", "woff", "woff2"}

# Best-effort fallback stacks for the common base14 / non-embedded font names.
FALLBACK_STACKS = {
    "helvetica": "Helvetica, Arial, sans-serif",
    "arial": "Arial, Helvetica, sans-serif",
    "times": "'Times New Roman', Times, serif",
    "times new roman": "'Times New Roman', Times, serif",
    "courier": "'Courier New', Courier, monospace",
    "georgia": "Georgia, serif",
    "verdana": "Verdana, Geneva, sans-serif",
    "calibri": "Calibri, Candara, sans-serif",
}


def hex_color(int_color):
    if int_color is None:
        return "#000000"
    r = (int_color >> 16) & 255
    g = (int_color >> 8) & 255
    b = int_color & 255
    return "#{:02x}{:02x}{:02x}".format(r, g, b)


def guess_fallback(base_font_name):
    name = (base_font_name or "").split("+")[-1]  # strip subset prefix e.g. ABCDEF+Helvetica
    lname = name.lower()
    for key, stack in FALLBACK_STACKS.items():
        if key in lname:
            return stack
    if "bold" in lname or "black" in lname:
        return "Arial, sans-serif"
    if "serif" in lname or "times" in lname or "georgia" in lname:
        return "Georgia, serif"
    return "Arial, sans-serif"


def extract_fonts(doc, page, assets_fonts_dir):
    """Returns {base_font_name: {embedded, asset_path, fallback}}"""
    fonts = {}
    for f in page.get_fonts(full=True):
        xref, ext, font_type, base_font, font_name, encoding = f[:6]
        key = base_font or font_name
        if key in fonts:
            continue
        embedded = False
        asset_path = None
        if xref and ext in EMBEDDABLE_EXTS:
            try:
                extracted = doc.extract_font(xref)
                buf = extracted[3] if len(extracted) > 3 else None
                if buf:
                    safe_name = "".join(c if c.isalnum() or c in "-_." else "_" for c in key)
                    fname = f"{safe_name}.{ext}"
                    (assets_fonts_dir / fname).write_bytes(buf)
                    embedded = True
                    asset_path = f"assets/fonts/{fname}"
            except Exception as e:
                print(f"  ! could not extract font {key}: {e}", file=sys.stderr)
        fonts[key] = {
            "embedded": embedded,
            "asset_path": asset_path,
            "fallback": guess_fallback(key),
        }
    return fonts


def extract_text_runs(page):
    runs = []
    raw = page.get_text("dict")
    for block in raw.get("blocks", []):
        if block.get("type") != 0:  # not a text block
            continue
        for line in block.get("lines", []):
            for span in line.get("spans", []):
                text = span.get("text", "")
                if text.strip() == "":
                    continue
                x0, y0, x1, y1 = span["bbox"]
                origin_x, origin_y = span.get("origin", (x0, y1))
                flags = span.get("flags", 0)
                bold = bool(flags & 16) or "bold" in span.get("font", "").lower()
                italic = bool(flags & 2) or "italic" in span.get("font", "").lower() or "oblique" in span.get("font", "").lower()
                runs.append({
                    "text": text,
                    # bbox: tight glyph box, used for manifest/position review only.
                    "x_px": round(x0 * PT_TO_PX, 2),
                    "y_px": round(y0 * PT_TO_PX, 2),
                    "width_px": round((x1 - x0) * PT_TO_PX, 2),
                    "height_px": round((y1 - y0) * PT_TO_PX, 2),
                    # baseline origin: what SVG <text x y> actually needs for
                    # pixel-exact vertical alignment (HTML div top/line-height
                    # cannot reproduce a PDF's glyph baseline reliably).
                    "baseline_x_px": round(origin_x * PT_TO_PX, 2),
                    "baseline_y_px": round(origin_y * PT_TO_PX, 2),
                    "font_name": span.get("font", ""),
                    "size_pt": round(span.get("size", 0), 2),
                    "size_px": round(span.get("size", 0) * PT_TO_PX, 2),
                    "color": hex_color(span.get("color")),
                    "bold": bold,
                    "italic": italic,
                })
    return runs


def extract_drawings(page):
    shapes = []
    for d in page.get_drawings():
        rect = d.get("rect")
        if rect is None:
            continue
        x0, y0, x1, y1 = rect
        stroke = d.get("color")
        fill = d.get("fill")
        width = d.get("width") or 0
        if fill is None and stroke is None:
            continue
        shapes.append({
            "x_px": round(x0 * PT_TO_PX, 2),
            "y_px": round(y0 * PT_TO_PX, 2),
            "width_px": round((x1 - x0) * PT_TO_PX, 2),
            "height_px": round((y1 - y0) * PT_TO_PX, 2),
            "stroke_color": hex_color(int(stroke[0] * 255) << 16 | int(stroke[1] * 255) << 8 | int(stroke[2] * 255)) if stroke else None,
            "fill_color": hex_color(int(fill[0] * 255) << 16 | int(fill[1] * 255) << 8 | int(fill[2] * 255)) if fill else None,
            "stroke_width_px": round(width * PT_TO_PX, 2),
        })
    return shapes


def extract_images(doc, page, page_index, assets_images_dir):
    images = []
    try:
        infos = page.get_image_info(xrefs=True)
    except Exception:
        infos = []
    seen = 0
    for info in infos:
        xref = info.get("xref")
        bbox = info.get("bbox")
        if not xref or not bbox:
            continue
        x0, y0, x1, y1 = bbox
        try:
            extracted = doc.extract_image(xref)
            ext = extracted.get("ext", "png")
            buf = extracted.get("image")
        except Exception as e:
            print(f"  ! could not extract image xref {xref}: {e}", file=sys.stderr)
            continue
        fname = f"p{page_index + 1}_img{seen}.{ext}"
        (assets_images_dir / fname).write_bytes(buf)
        images.append({
            "asset_path": f"assets/images/{fname}",
            "x_px": round(x0 * PT_TO_PX, 2),
            "y_px": round(y0 * PT_TO_PX, 2),
            "width_px": round((x1 - x0) * PT_TO_PX, 2),
            "height_px": round((y1 - y0) * PT_TO_PX, 2),
        })
        seen += 1
    return images


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("type_slug", help="document type slug, e.g. settlement-report")
    parser.add_argument("--source-pdf", default=None, help="override source PDF path")
    args = parser.parse_args()

    source_pdf = Path(args.source_pdf) if args.source_pdf else ROOT / "source" / f"{args.type_slug}.pdf"
    if not source_pdf.exists():
        print(f"Source PDF not found: {source_pdf}", file=sys.stderr)
        sys.exit(1)

    template_dir = ROOT / "templates" / args.type_slug
    assets_dir = template_dir / "assets"
    assets_images_dir = assets_dir / "images"
    assets_fonts_dir = assets_dir / "fonts"
    for d in (template_dir, assets_images_dir, assets_fonts_dir):
        d.mkdir(parents=True, exist_ok=True)

    doc = fitz.open(source_pdf)
    pages_out = []
    all_fonts = {}

    for i, page in enumerate(doc):
        w_pt, h_pt = page.rect.width, page.rect.height
        fonts = extract_fonts(doc, page, assets_fonts_dir)
        all_fonts.update(fonts)
        page_record = {
            "page_number": i + 1,
            "width_pt": round(w_pt, 2),
            "height_pt": round(h_pt, 2),
            "width_px": round(w_pt * PT_TO_PX, 2),
            "height_px": round(h_pt * PT_TO_PX, 2),
            "text_runs": extract_text_runs(page),
            "drawings": extract_drawings(page),
            "images": extract_images(doc, page, i, assets_images_dir),
        }
        pages_out.append(page_record)
        print(f"  page {i + 1}: {len(page_record['text_runs'])} text runs, "
              f"{len(page_record['drawings'])} drawings, {len(page_record['images'])} images")

    extraction = {
        "type_slug": args.type_slug,
        "source_pdf": str(source_pdf.relative_to(ROOT)) if source_pdf.is_relative_to(ROOT) else str(source_pdf),
        "page_count": len(pages_out),
        "fonts": all_fonts,
        "pages": pages_out,
    }

    out_path = template_dir / "extraction.json"
    out_path.write_text(json.dumps(extraction, indent=2))

    n_embedded = sum(1 for f in all_fonts.values() if f["embedded"])
    n_fallback = len(all_fonts) - n_embedded
    print(f"\nExtracted {len(pages_out)} page(s) from {source_pdf.name}")
    print(f"Fonts: {n_embedded} embedded/extracted, {n_fallback} using system fallback")
    if n_fallback:
        for name, f in all_fonts.items():
            if not f["embedded"]:
                print(f"  ! '{name}' not embedded in PDF -> fallback: {f['fallback']}")
    print(f"Wrote {out_path.relative_to(ROOT)}")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""
extract_psd.py — pulls exact layout data out of a source Photoshop (.psd) file.

Use this instead of extract.py when the "reference PDF" for a doc type is
itself a flattened/rasterized Photoshop export with no real text objects to
extract (common for W72's design-first templates — Photoshop's Image
Conversion plug-in bakes the whole page into one raster image). extract_psd.py
reads the real .psd source instead and produces the *same* extraction.json
schema extract.py does, so build_template.py works unchanged either way.

Usage:
    python3 extract_psd.py <type-slug> --source-psd PATH
        [--reference-pdf PATH] [--dpi 300]

--reference-pdf, if given, is used only to derive the canvas DPI (comparing
the PSD's pixel dimensions against the reference PDF's point dimensions) so
coordinates convert to CSS px exactly the way they do for a real vector PDF.
Falls back to --dpi (default 300, Photoshop's common print default) if no
reference PDF is given or its page size doesn't yield a clean match.

Text layers are reconstructed as real, styled text (not rasterized) using
locally installed font files matched by PostScript name, with baseline
position computed from each layer's tight visual bbox + real font metrics
(cap-height / descender ratios from the actual font file) — this is what
lets generate.js later substitute new values into these layers and still
render pixel-accurate. Every other visible layer (shapes, smart objects,
pixel layers) is composited to PNG and placed as a positioned image, which
is exact regardless of fill type (solid, gradient, blend effects, etc.).
"""
import argparse
import glob
import re
import sys
from pathlib import Path

import fitz  # PyMuPDF, only used to read a reference PDF's page size
from fontTools.ttLib import TTFont
from psd_tools import PSDImage

ROOT = Path(__file__).resolve().parent.parent

FONT_SEARCH_DIRS = [
    Path.home() / "Library" / "Fonts",
    Path("/Library/Fonts"),
    Path("/System/Library/Fonts"),
]

DESCENDER_CHARS = set("gjpqyQ()")

FALLBACK_STACKS = {
    "helvetica": "Helvetica, Arial, sans-serif",
    "arial": "Arial, Helvetica, sans-serif",
    "times": "'Times New Roman', Times, serif",
    "courier": "'Courier New', Courier, monospace",
    "archivo": "Arial, sans-serif",
    "myriad": "Arial, sans-serif",
}


def guess_fallback(font_name):
    lname = (font_name or "").lower()
    for key, stack in FALLBACK_STACKS.items():
        if key in lname:
            return stack
    return "Arial, sans-serif"


def rgb_hex(r, g, b):
    return "#{:02x}{:02x}{:02x}".format(
        max(0, min(255, round(r * 255))),
        max(0, min(255, round(g * 255))),
        max(0, min(255, round(b * 255))),
    )


def normalize_font_name(name):
    return re.sub(r"[^a-z0-9]", "", (name or "").lower())


class FontResolver:
    """Matches a PSD-internal PostScript font name (e.g. 'Archivo-Black') to
    a locally installed font file, and caches its real cap-height/ascender/
    descender ratios read straight from the font's own tables."""

    def __init__(self):
        self._index = {}  # normalized name -> path
        for d in FONT_SEARCH_DIRS:
            if not d.exists():
                continue
            for p in list(d.glob("*.ttf")) + list(d.glob("*.otf")):
                try:
                    f = TTFont(str(p), lazy=True)
                    name_table = f["name"]
                    for name_id in (6, 4, 1):  # PostScript name, full name, family
                        val = name_table.getDebugName(name_id)
                        if val:
                            self._index.setdefault(normalize_font_name(val), p)
                except Exception:
                    continue
        self._metrics_cache = {}

    def resolve_path(self, psd_font_name):
        target = normalize_font_name(psd_font_name)
        if target in self._index:
            return self._index[target]
        # fuzzy: substring match either direction (PSD name vs PostScript name
        # often differ slightly, e.g. 'Archivo-Black' vs 'ArchivoBlack-Regular')
        for key, path in self._index.items():
            if target and (target in key or key in target):
                return path
        return None

    def metrics(self, psd_font_name):
        if psd_font_name in self._metrics_cache:
            return self._metrics_cache[psd_font_name]
        path = self.resolve_path(psd_font_name)
        result = {"path": path, "cap_height_ratio": 0.72, "descent_ratio": 0.22}
        if path:
            try:
                f = TTFont(str(path), lazy=True)
                units = f["head"].unitsPerEm
                if "OS/2" in f and getattr(f["OS/2"], "sCapHeight", 0):
                    cap = f["OS/2"].sCapHeight / units
                else:
                    cap = f["hhea"].ascent / units * 0.72
                if "OS/2" in f and f["OS/2"].sTypoDescender:
                    desc = abs(f["OS/2"].sTypoDescender) / units
                else:
                    desc = abs(f["hhea"].descent) / units
                result["cap_height_ratio"] = cap
                result["descent_ratio"] = desc
            except Exception as e:
                print(f"  ! could not read metrics for {psd_font_name} ({path}): {e}", file=sys.stderr)
        self._metrics_cache[psd_font_name] = result
        return result


def has_descender(text):
    return any(c in DESCENDER_CHARS for c in text)


def determine_dpi(psd, reference_pdf, cli_dpi):
    if reference_pdf:
        try:
            doc = fitz.open(reference_pdf)
            page = doc[0]
            dpi_w = psd.width / (page.rect.width / 72)
            dpi_h = psd.height / (page.rect.height / 72)
            if abs(dpi_w - dpi_h) < 1.0:
                return round((dpi_w + dpi_h) / 2)
            print(f"  ! reference PDF dpi mismatch (w={dpi_w:.1f} h={dpi_h:.1f}), using --dpi {cli_dpi}", file=sys.stderr)
        except Exception as e:
            print(f"  ! could not read reference PDF for dpi: {e}", file=sys.stderr)
    return cli_dpi


def extract_text_layer(layer, scale, resolver, fonts_out, assets_fonts_dir):
    """Returns a list of text_run dicts (usually one, more if the layer has
    multiple style runs / explicit line breaks)."""
    text = layer.text or ""
    if not text.strip():
        return []

    bbox = layer.bbox
    if bbox is None:
        return []
    x0, y0, x1, y1 = bbox

    a, b, c, d, _tx, _ty = layer.transform
    scale_y = abs(d) if d else 1.0
    if abs(b) > 0.01 or abs(c) > 0.01:
        print(f"  ! layer '{layer.name}' has rotation/skew — position may be approximate", file=sys.stderr)

    ed = layer.engine_dict
    style_runs = ed["StyleRun"]["RunArray"]
    run_lengths = ed["StyleRun"]["RunLengthArray"]
    resource_dict = layer.resource_dict
    font_set = resource_dict["FontSet"] if resource_dict and "FontSet" in resource_dict else []

    # Split text by run boundaries.
    segments = []
    pos = 0
    for i, length in enumerate(run_lengths):
        seg_text = text[pos:pos + length]
        style = dict(style_runs[i]["StyleSheet"]["StyleSheetData"]) if i < len(style_runs) else {}
        segments.append((seg_text, style))
        pos += length
    if not segments:
        segments = [(text, {})]

    multi = len(segments) > 1 or "\r" in text or "\n" in text
    if multi:
        print(f"  ! layer '{layer.name}' has multiple style runs/lines — position is approximated per-line/run", file=sys.stderr)

    runs_out = []
    n_segments = max(1, len(segments))
    char_offset = 0
    for seg_text, style in segments:
        lines = re.split(r"[\r\n]+", seg_text)
        line_count = max(1, len([l for l in lines if l != ""]) or 1)
        for li, line_text in enumerate(lines):
            if line_text == "":
                continue
            font_idx = style.get("Font", 0)
            if font_idx < len(font_set):
                raw_name = font_set[font_idx]["Name"]
                font_name = getattr(raw_name, "value", None) or str(raw_name)
            else:
                font_name = "Helvetica"
            native_size = style.get("FontSize", 12.0)
            effective_em_native = native_size * scale_y
            effective_em_px = effective_em_native * scale

            metrics = resolver.metrics(font_name)
            if font_name not in fonts_out:
                if metrics["path"]:
                    safe = re.sub(r"[^A-Za-z0-9_.-]", "_", font_name)
                    dest = assets_fonts_dir / f"{safe}{metrics['path'].suffix}"
                    if not dest.exists():
                        dest.write_bytes(metrics["path"].read_bytes())
                    fonts_out[font_name] = {"embedded": True, "asset_path": f"assets/fonts/{dest.name}", "fallback": guess_fallback(font_name)}
                else:
                    fonts_out[font_name] = {"embedded": False, "asset_path": None, "fallback": guess_fallback(font_name)}

            fill = list(style.get("FillColor", {}).get("Values", [1, 0, 0, 0]))
            fill = (fill + [1, 0, 0, 0])[:4]
            alpha, r, g, bl = fill
            color = rgb_hex(r, g, bl)

            faux_bold = bool(style.get("FauxBold"))
            faux_italic = bool(style.get("FauxItalic"))

            # Position: use the layer's own tight bbox for the common single
            # run/line case (exact); approximate proportionally otherwise.
            if not multi:
                run_x0, run_y0, run_x1, run_y1 = x0, y0, x1, y1
            else:
                frac0 = char_offset / max(1, len(text))
                frac1 = (char_offset + len(line_text)) / max(1, len(text))
                run_x0 = x0 + (x1 - x0) * frac0
                run_x1 = x0 + (x1 - x0) * frac1
                line_h = (y1 - y0) / line_count
                run_y0 = y0 + line_h * li
                run_y1 = run_y0 + line_h

            baseline_y_native = run_y1 - (effective_em_native * metrics["descent_ratio"] if has_descender(line_text) else 0)

            runs_out.append({
                "text": line_text,
                "x_px": round(run_x0 * scale, 2),
                "y_px": round(run_y0 * scale, 2),
                "width_px": round((run_x1 - run_x0) * scale, 2),
                "height_px": round((run_y1 - run_y0) * scale, 2),
                "baseline_x_px": round(run_x0 * scale, 2),
                "baseline_y_px": round(baseline_y_native * scale, 2),
                "font_name": font_name,
                "size_pt": round(effective_em_native, 2),
                "size_px": round(effective_em_px, 2),
                "color": color,
                "bold": faux_bold or "bold" in font_name.lower() or "black" in font_name.lower(),
                "italic": faux_italic or "italic" in font_name.lower(),
                "layer_name": layer.name,
            })
            char_offset += len(line_text) + 1

    return runs_out


def extract_visual_layer(layer, scale, page_index, img_counter, assets_images_dir):
    bbox = layer.bbox
    if bbox is None:
        return None
    x0, y0, x1, y1 = bbox
    if x1 <= x0 or y1 <= y0:
        return None
    try:
        img = layer.composite()
    except Exception as e:
        print(f"  ! could not composite layer '{layer.name}': {e}", file=sys.stderr)
        return None
    if img is None:
        return None

    fname = f"p{page_index + 1}_layer{img_counter:03d}.png"
    out_path = assets_images_dir / fname
    img.save(out_path)
    return {
        "asset_path": f"assets/images/{fname}",
        "x_px": round(x0 * scale, 2),
        "y_px": round(y0 * scale, 2),
        "width_px": round((x1 - x0) * scale, 2),
        "height_px": round((y1 - y0) * scale, 2),
    }


def walk(layer, scale, resolver, fonts_out, page_index, assets_fonts_dir, assets_images_dir,
         text_runs, images, counters):
    if hasattr(layer, "is_visible") and not layer.is_visible():
        return
    if layer.is_group():
        if getattr(layer, "opacity", 255) != 255:
            print(f"  ! group '{layer.name}' has non-100% opacity — not reproduced (children flattened independently)", file=sys.stderr)
        for child in layer:
            walk(child, scale, resolver, fonts_out, page_index, assets_fonts_dir, assets_images_dir,
                 text_runs, images, counters)
        return

    if layer.kind == "type":
        text_runs.extend(extract_text_layer(layer, scale, resolver, fonts_out, assets_fonts_dir))
    else:
        counters["img"] += 1
        rec = extract_visual_layer(layer, scale, page_index, counters["img"], assets_images_dir)
        if rec:
            images.append(rec)


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("type_slug")
    parser.add_argument("--source-psd", required=True)
    parser.add_argument("--reference-pdf", default=None)
    parser.add_argument("--dpi", type=int, default=300)
    args = parser.parse_args()

    psd_path = Path(args.source_psd)
    if not psd_path.exists():
        print(f"PSD not found: {psd_path}", file=sys.stderr)
        sys.exit(1)

    template_dir = ROOT / "templates" / args.type_slug
    assets_dir = template_dir / "assets"
    assets_images_dir = assets_dir / "images"
    assets_fonts_dir = assets_dir / "fonts"
    for d in (template_dir, assets_images_dir, assets_fonts_dir):
        d.mkdir(parents=True, exist_ok=True)

    psd = PSDImage.open(psd_path)
    dpi = determine_dpi(psd, args.reference_pdf, args.dpi)
    scale = 96 / dpi
    print(f"Canvas: {psd.width}x{psd.height}px @ {dpi}dpi -> {round(psd.width*scale)}x{round(psd.height*scale)}px CSS")

    resolver = FontResolver()
    fonts_out = {}
    text_runs = []
    images = []
    counters = {"img": 0}

    for layer in psd:
        walk(layer, scale, resolver, fonts_out, 0, assets_fonts_dir, assets_images_dir,
             text_runs, images, counters)

    page_record = {
        "page_number": 1,
        "width_pt": round(psd.width * 72 / dpi, 2),
        "height_pt": round(psd.height * 72 / dpi, 2),
        "width_px": round(psd.width * scale, 2),
        "height_px": round(psd.height * scale, 2),
        "text_runs": text_runs,
        "drawings": [],
        "images": images,
    }

    extraction = {
        "type_slug": args.type_slug,
        "source_pdf": str(psd_path),
        "page_count": 1,
        "fonts": fonts_out,
        "pages": [page_record],
    }

    out_path = template_dir / "extraction.json"
    out_path.write_text(__import__("json").dumps(extraction, indent=2))

    n_embedded = sum(1 for f in fonts_out.values() if f["embedded"])
    n_fallback = len(fonts_out) - n_embedded
    print(f"\nExtracted {len(text_runs)} text runs, {len(images)} visual layers from {psd_path.name}")
    print(f"Fonts: {n_embedded} resolved to real local font files, {n_fallback} using system fallback")
    for name, f in fonts_out.items():
        flag = "OK" if f["embedded"] else "FALLBACK"
        print(f"  [{flag:8}] {name} -> {f['asset_path'] or f['fallback']}")
    print(f"Wrote {out_path.relative_to(ROOT)}")


if __name__ == "__main__":
    main()

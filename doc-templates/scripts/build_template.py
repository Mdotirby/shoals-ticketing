#!/usr/bin/env python3
"""
build_template.py — turns extraction.json into template.html + manifest.json.

Two phases, because we should never lock in a field map on an unconfirmed guess:

  draft     python3 build_template.py draft <type-slug>
            Reads extraction.json. Writes template.html (pixel-positioned,
            literal source text, each run tagged data-run-id) and manifest.json
            (best-guess variable/fixed classification per run). Prints the
            field list so a human can confirm or correct it.

  finalize  python3 build_template.py finalize <type-slug>
            Reads the (now human-reviewed) manifest.json. For every entry
            marked "variable": true, swaps that run's text in template.html
            for a {{field_name}} placeholder. Marks manifest as finalized.
            This is the template generate.js will actually use.

Nothing in `finalize` re-guesses anything — it trusts manifest.json exactly
as reviewed. Edit manifest.json directly (field_name, type, variable, notes)
before running finalize.
"""
import argparse
import html
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

CURRENCY_RE = re.compile(r"^\(?-?\$\s?-?[\d,]+(\.\d{2})?\)?$")
NUMBER_RE = re.compile(r"^-?[\d,]+(\.\d+)?%?$")
DATE_RE = re.compile(
    r"^(?:\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4}"
    r"|\d{4}-\d{2}-\d{2}"
    r"|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4})$",
    re.IGNORECASE,
)
LABEL_WORDS = {
    "total", "subtotal", "date", "venue", "artist", "signature", "amount due",
    "amount", "terms", "agreement", "settlement", "settlement report", "offer",
    "contract", "invoice", "balance", "due", "paid", "guarantee", "deposit",
    "expenses", "gross", "net", "capacity", "attendance", "show date", "page",
    "name", "address", "phone", "email", "title", "print name", "notes",
    "description", "qty", "quantity", "rate", "price", "gross sales",
    "net sales", "commission", "fee", "fees", "tax", "grand total",
    # settlement-report line-item / column labels — these are the fixed
    # category names printed on every settlement, only the amount next to
    # them varies. Learned from the W72 settlement template's real vocabulary.
    "service fees", "facility fees", "cc/processing fees",
    "gross box office receipts", "net box office receipts", "catering",
    "hospitality", "support", "talent", "marketing", "labor", "insurance",
    "security", "ushers", "police", "cleaning", "medical", "ascap", "bmi",
    "sesac", "gmr", "fixed", "variable", "total expenses", "artist take",
    "gross merch sales", "net merch sales", "venue merch take",
    "artist gurantee", "artist guarantee", "total due to artist",
    "backend overage", "financial summary", "merch settlement",
    "artist settlement", "totals", "tier name", "sold", "comp/guest", "svc",
    "fac", "cc", "ticket audit", "deal terms", "deal type", "event settlement",
}


def classify_run(text):
    """Returns (variable: bool, field_type: str, confidence: str)."""
    stripped = text.strip()
    bare = stripped.rstrip(":").strip().lower()

    if bare in LABEL_WORDS or (stripped.endswith(":") and len(stripped) <= 40):
        return False, "text", "high"

    if CURRENCY_RE.match(stripped):
        return True, "currency", "high"

    if DATE_RE.match(stripped):
        return True, "date", "high"

    if NUMBER_RE.match(stripped) and any(c.isdigit() for c in stripped):
        return True, "number", "high"

    word_count = len(stripped.split())

    if word_count >= 8:
        # long run-on text -> almost certainly fixed boilerplate/legal language
        return False, "text", "medium"

    if stripped.isupper() and word_count <= 3:
        # short all-caps: could be a section header (fixed) or a venue/artist
        # name in display caps (variable). Flag for review either way.
        return True, "text", "low"

    if word_count <= 6 and any(c.isalpha() for c in stripped):
        # short, not a known label, not boilerplate -> plausible name/value
        return True, "text", "medium"

    return False, "text", "low"


def slugify(text, used):
    base = re.sub(r"[^a-z0-9]+", "_", text.strip().lower()).strip("_")[:30] or "field"
    candidate = base
    i = 2
    while candidate in used:
        candidate = f"{base}_{i}"
        i += 1
    used.add(candidate)
    return candidate


def build_draft(type_slug):
    template_dir = ROOT / "templates" / type_slug
    extraction_path = template_dir / "extraction.json"
    if not extraction_path.exists():
        print(f"No extraction.json for '{type_slug}'. Run extract.py first.", file=sys.stderr)
        sys.exit(1)

    extraction = json.loads(extraction_path.read_text())
    fonts = extraction["fonts"]

    used_names = set()
    fields = []
    html_pages = []

    font_face_rules = []
    for font_name, info in fonts.items():
        if info["embedded"] and info["asset_path"]:
            font_face_rules.append(
                f"@font-face {{ font-family: '{css_escape(font_name)}'; "
                f"src: url('{info['asset_path']}'); }}"
            )

    for page in extraction["pages"]:
        page_no = page["page_number"]
        elements = []
        text_elements = []

        run_counter = 0
        for run in page["text_runs"]:
            run_counter += 1
            run_id = f"p{page_no}_r{run_counter:03d}"
            variable, field_type, confidence = classify_run(run["text"])

            if variable:
                field_name = slugify(run["text"], used_names)
                fields.append({
                    "run_id": run_id,
                    "field_name": field_name,
                    "type": field_type,
                    "source_text": run["text"],
                    "source_layer": run.get("layer_name"),
                    "variable": True,
                    "confidence": confidence,
                    "position": {
                        # Baseline coords, not bbox top -- these are what the
                        # rendered SVG <text x= y=> attributes actually use.
                        # A reflow/shift engine must operate in this same
                        # reference frame or shifts land at the wrong place.
                        "page": page_no, "x_px": run["baseline_x_px"], "y_px": run["baseline_y_px"],
                        "width_px": run["width_px"], "height_px": run["height_px"],
                    },
                })
            else:
                fields.append({
                    "run_id": run_id,
                    "field_name": None,
                    "type": field_type,
                    "source_text": run["text"],
                    "source_layer": run.get("layer_name"),
                    "variable": False,
                    "confidence": confidence,
                    "position": {
                        # Baseline coords, not bbox top -- these are what the
                        # rendered SVG <text x= y=> attributes actually use.
                        # A reflow/shift engine must operate in this same
                        # reference frame or shifts land at the wrong place.
                        "page": page_no, "x_px": run["baseline_x_px"], "y_px": run["baseline_y_px"],
                        "width_px": run["width_px"], "height_px": run["height_px"],
                    },
                })

            font_info = fonts.get(run["font_name"], {})
            font_family = run["font_name"] if font_info.get("embedded") else font_info.get("fallback", "Arial, sans-serif")
            weight = "bold" if run["bold"] else "normal"
            style = "italic" if run["italic"] else "normal"
            # SVG <text> uses baseline coordinates (x,y = glyph baseline),
            # matching exactly how the PDF itself positions text — an
            # absolutely-positioned HTML <div> cannot reproduce this because
            # CSS line boxes measure from font ascent, not the PDF glyph box.
            text_elements.append(
                f'<text data-run-id="{run_id}" x="{run["baseline_x_px"]}" y="{run["baseline_y_px"]}" '
                f'font-family="\'{css_escape(font_family)}\'" font-size="{run["size_px"]}" '
                f'fill="{run["color"]}" font-weight="{weight}" font-style="{style}" '
                f'xml:space="preserve">{html.escape(run["text"])}</text>'
            )

        for shape in page["drawings"]:
            style_parts = [f'left:{shape["x_px"]}px', f'top:{shape["y_px"]}px',
                            f'width:{shape["width_px"]}px', f'height:{shape["height_px"]}px']
            if shape["fill_color"]:
                style_parts.append(f'background-color:{shape["fill_color"]}')
            if shape["stroke_color"] and shape["stroke_width_px"]:
                style_parts.append(f'border:{shape["stroke_width_px"]}px solid {shape["stroke_color"]}')
            elements.append(f'<div class="shape" style="{"; ".join(style_parts)};"></div>')

        img_counter = 0
        for img in page["images"]:
            img_counter += 1
            run_id = f"p{page_no}_img{img_counter:03d}"
            fields.append({
                "run_id": run_id,
                "field_name": None,
                "type": "image",
                "source_text": img["asset_path"],
                "variable": False,
                "confidence": "low",
                "position": {
                    "page": page_no, "x_px": img["x_px"], "y_px": img["y_px"],
                    "width_px": img["width_px"], "height_px": img["height_px"],
                },
            })
            elements.append(
                f'<img class="img" data-run-id="{run_id}" src="{img["asset_path"]}" style="'
                f'left:{img["x_px"]}px; top:{img["y_px"]}px; '
                f'width:{img["width_px"]}px; height:{img["height_px"]}px;">'
            )

        svg_text_layer = (
            f'<svg class="text-layer" width="{page["width_px"]}" height="{page["height_px"]}" '
            f'viewBox="0 0 {page["width_px"]} {page["height_px"]}">\n      '
            + "\n      ".join(text_elements) + "\n    </svg>"
        )

        html_pages.append({
            "page_number": page_no,
            "width_px": page["width_px"],
            "height_px": page["height_px"],
            "elements_html": "\n      ".join(elements) + "\n    " + svg_text_layer,
        })

    template_html = render_document_html(type_slug, html_pages, font_face_rules)
    (template_dir / "template.html").write_text(template_html)

    manifest = {
        "type_slug": type_slug,
        "source_pdf": extraction["source_pdf"],
        "page_count": extraction["page_count"],
        "finalized": False,
        "fields": fields,
    }
    (template_dir / "manifest.json").write_text(json.dumps(manifest, indent=2))

    variable_fields = [f for f in fields if f["variable"]]
    image_fields = [f for f in fields if f["type"] == "image"]
    print(f"Draft template written: {template_dir / 'template.html'}")
    print(f"Draft manifest written: {template_dir / 'manifest.json'}")
    print(f"\n{len(variable_fields)} of {len(fields)} runs flagged as VARIABLE:\n")
    for f in variable_fields:
        print(f"  [{f['confidence']:6}] {f['field_name']:30} ({f['type']:8}) = {f['source_text']!r}")
    print(f"\nEverything else ({len(fields) - len(variable_fields)} runs) treated as fixed boilerplate.")
    if image_fields:
        print(f"\n{len(image_fields)} image(s) found, all defaulted to FIXED (logos/art). "
              f"If any of these is actually variable per-document (e.g. a signature), "
              f"flip its \"variable\" to true and give it a field_name in manifest.json:")
        for f in image_fields:
            print(f"  [fixed]  {f['run_id']:16} = {f['source_text']}")
    print("\nReview manifest.json: fix any field_name/type/variable values that are wrong,")
    print("then run:  python3 build_template.py finalize " + type_slug)


def finalize(type_slug):
    template_dir = ROOT / "templates" / type_slug
    manifest_path = template_dir / "manifest.json"
    template_path = template_dir / "template.html"
    if not manifest_path.exists() or not template_path.exists():
        print(f"Missing manifest.json/template.html for '{type_slug}'. Run draft first.", file=sys.stderr)
        sys.exit(1)

    manifest = json.loads(manifest_path.read_text())
    html_text = template_path.read_text()

    seen_names = set()
    for f in manifest["fields"]:
        if not f["variable"]:
            continue
        if not f["field_name"]:
            print(f"Field for run {f['run_id']} is marked variable but has no field_name.", file=sys.stderr)
            sys.exit(1)
        if f["field_name"] in seen_names:
            print(f"Duplicate field_name '{f['field_name']}' — field names must be unique.", file=sys.stderr)
            sys.exit(1)
        seen_names.add(f["field_name"])

        run_id = f["run_id"]
        placeholder = f'{{{{{f["field_name"]}}}}}'

        if f["type"] == "image":
            pattern = re.compile(
                r'(<img class="img" data-run-id="' + re.escape(run_id) + r'"[^>]*src=")[^"]*("[^>]*>)'
            )
        else:
            pattern = re.compile(
                r'(<text data-run-id="' + re.escape(run_id) + r'"[^>]*>)(.*?)(</text>)',
                re.DOTALL,
            )

        if f["type"] == "image":
            new_html, n = pattern.subn(lambda m: m.group(1) + placeholder + m.group(2), html_text)
        else:
            new_html, n = pattern.subn(lambda m: m.group(1) + html.escape(placeholder) + m.group(3), html_text)
        if n == 0:
            print(f"Warning: run_id {run_id} not found in template.html — skipped.", file=sys.stderr)
        html_text = new_html

    template_path.write_text(html_text)
    manifest["finalized"] = True
    manifest_path.write_text(json.dumps(manifest, indent=2))
    print(f"Finalized template: {template_path}")
    print(f"Variable fields locked in: {sorted(seen_names)}")


def css_escape(name):
    return (name or "").replace("'", "\\'")


def render_document_html(type_slug, pages, font_face_rules):
    page_blocks = []
    for p in pages:
        page_blocks.append(
            f'<section class="doc-page" style="width:{p["width_px"]}px; height:{p["height_px"]}px;">\n'
            f'      {p["elements_html"]}\n'
            f'    </section>'
        )

    first = pages[0]
    return f"""<meta charset="utf-8">
<meta name="hz:doc-type" content="{html.escape(type_slug)}">
<title>{html.escape(type_slug)}</title>
<style>
  {chr(10).join(font_face_rules)}

  * {{ margin: 0; padding: 0; box-sizing: border-box; }}
  html, body {{ background: #ffffff; }}
  .doc-page {{
    position: relative;
    overflow: hidden;
    background: #ffffff;
    page-break-after: always;
  }}
  .doc-page:last-child {{ page-break-after: auto; }}
  .shape {{ position: absolute; }}
  .img {{ position: absolute; }}
  .text-layer {{ position: absolute; top: 0; left: 0; }}
  .text-layer text {{ dominant-baseline: alphabetic; }}
  @page {{ size: {first["width_px"]}px {first["height_px"]}px; margin: 0; }}
</style>
<body>
    {chr(10).join(page_blocks)}
</body>
"""


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="mode", required=True)
    draft_p = sub.add_parser("draft")
    draft_p.add_argument("type_slug")
    fin_p = sub.add_parser("finalize")
    fin_p.add_argument("type_slug")
    args = parser.parse_args()

    if args.mode == "draft":
        build_draft(args.type_slug)
    elif args.mode == "finalize":
        finalize(args.type_slug)


if __name__ == "__main__":
    main()

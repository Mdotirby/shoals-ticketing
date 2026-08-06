#!/usr/bin/env python3
"""One-off: surgical HTML edits for the settlement-report template --
removes the baked-in example expense rows (now driven by repeating_sections
instead), adds the new UNSOLD ticket-audit column, blanks the totals-row
price cell, and substitutes {{field_name}} placeholders for every variable
field except row-0 repeat stencils (those are filled by generate.js's
reflow engine at render time, not by static substitution)."""
import html
import json
import re
from pathlib import Path

TEMPLATE_DIR = Path("/Users/mattirby/shoals-ticketing/.claude/worktrees/wonderful-noyce-2f95b9/doc-templates/templates/settlement-report")
manifest = json.loads((TEMPLATE_DIR / "manifest.json").read_text())
html_text = (TEMPLATE_DIR / "template.html").read_text()
fields_by_id = {f["run_id"]: f for f in manifest["fields"]}

FIXED_EXTRA = {
    "p1_r020", "p1_r021", "p1_r022", "p1_r023", "p1_r024", "p1_r025",
    "p1_r026", "p1_r027", "p1_r028", "p1_r029", "p1_r030", "p1_r031",
    "p1_r032", "p1_r033", "p1_r034", "p1_r035", "p1_r036", "p1_r037",
    "p1_r038", "p1_r039", "p1_r040", "p1_r041",
}
VARIABLE_EXTRA = {"p1_r044", "p1_r045", "p1_r046", "p1_r047", "p1_r048", "p1_r049"}

# 1. Remove baked-in extra example rows (they're not in manifest anymore, but
#    their <text> elements are still sitting in the raw template.html).
for run_id in FIXED_EXTRA | VARIABLE_EXTRA:
    pattern = re.compile(r'<text data-run-id="' + re.escape(run_id) + r'"[^>]*>.*?</text>\n?\s*', re.DOTALL)
    html_text, n = pattern.subn("", html_text)
    assert n == 1, f"expected exactly one match removing {run_id}, got {n}"

# 2. Blank the totals-row Price cell (real app leaves it empty).
def blank_run(m):
    return m.group(1) + m.group(3)

pattern = re.compile(r'(<text data-run-id="p1_r078"[^>]*>)(.*?)(</text>)', re.DOTALL)
html_text, n = pattern.subn(blank_run, html_text)
assert n == 1

# 3. Add the new UNSOLD column (header + row0 stencil + totals), styled to
#    match its neighboring columns exactly, right-aligned in the gap between
#    COMP/GUEST and PRICE. x=420 originally collided with "COMP/GUEST"
#    (measured via getComputedTextLength() in a real render: COMP/GUEST
#    ends at x=376.34, "UNSOLD" at x=420 end-anchored starts at x=375.55 --
#    a ~1px overlap, invisible in a synthetic test but visible with real
#    data in production). x=427 leaves ~6px clearance on both sides
#    (COMP/GUEST ends 376.34, PRICE starts 435.2, UNSOLD is 44.45px wide).
UNSOLD_X = "427"
new_elements = [
    # header label, matches style of neighboring "COMP/GUEST" header (p1_r097)
    '<text data-run-id="p1_new_unsold_header" x="{x}" y="226.56" font-family="\'Archivo-Regular\'" '
    'font-size="10.67" fill="#000000" font-weight="normal" font-style="normal" text-anchor="end" '
    'xml:space="preserve">UNSOLD</text>'.format(x=UNSOLD_X),
    # row-0 stencil, matches style of neighboring "comps" data cell (p1_r087)
    '<text data-run-id="p1_new_unsold_row0" x="{x}" y="240.64" font-family="\'Archivo-Regular\'" '
    'font-size="10.67" fill="#000000" font-weight="normal" font-style="normal" text-anchor="end" '
    'xml:space="preserve">{{{{__row0_ticket_audit_unsold}}}}</text>'.format(x=UNSOLD_X),
    # totals cell, matches style of neighboring "comps" totals cell (p1_r077)
    '<text data-run-id="p1_new_unsold_totals" x="{x}" y="256.0" font-family="\'Archivo-Bold\'" '
    'font-size="10.67" fill="#000000" font-weight="bold" font-style="normal" text-anchor="end" '
    'xml:space="preserve">{{{{ticket_totals_unsold}}}}</text>'.format(x=UNSOLD_X),
]
insertion_point = html_text.index('<text data-run-id="p1_r088"')  # right before "price" row cell
html_text = html_text[:insertion_point] + "\n      ".join(new_elements) + "\n      " + html_text[insertion_point:]

# Position values here MUST match the actual x/y attributes on the elements
# above (226.56/240.64/256.0, x=420) -- this manifest position is what the
# reflow engine in generate.js uses as ground truth, not a re-derivable value.
manifest["fields"].append({
    "run_id": "p1_new_unsold_header", "field_name": None, "type": "text",
    "source_text": "UNSOLD", "variable": False, "confidence": "confirmed",
    "note": "New column, not present in PSD -- added per Matt's request to replace the current app's %H (sell-through) column with an unsold count instead.",
    "position": {"page": 1, "x_px": 420, "y_px": 226.56, "width_px": 80, "height_px": 13.12},
})
manifest["fields"].append({
    "run_id": "p1_new_unsold_row0", "field_name": "__row0_ticket_audit_unsold", "type": "number",
    "source_text": "0", "variable": True, "confidence": "confirmed",
    "repeat_row0_of": "ticket_audit", "repeat_row0_key": "unsold",
    "position": {"page": 1, "x_px": 420, "y_px": 240.64, "width_px": 80, "height_px": 8.0},
})
manifest["fields"].append({
    "run_id": "p1_new_unsold_totals", "field_name": "ticket_totals_unsold", "type": "number",
    "source_text": "0", "variable": True, "confidence": "confirmed",
    "note": "= ticket_totals_capacity - ticket_totals_sold - ticket_totals_comps",
    "position": {"page": 1, "x_px": 420, "y_px": 256.0, "width_px": 80, "height_px": 8.0},
})

# 3b. Add the Deposits Paid / Cash Advance conditional deduction section (not
#     in the PSD at all -- Matt asked for these to match
#     settlement-pdf.ts:415-418). One stencil row, reused via the repeating-
#     section engine for 0-2 actual lines.
#
#     Geometry note: "Artist Guarantee" sits at y=880.32, "Venue Merch Take"
#     at y=897.6 -- only 17.28px apart, not enough room to insert a 15px-
#     pitch line AND still leave clearance below it for Venue Merch Take
#     without Venue Merch Take also shifting. So the anchor goes at
#     y=895.32 (880.32 + one row_height, i.e. right after Guarantee with
#     proper clearance) -- below that threshhold, Venue Merch Take,
#     Backend Overage, Total Due to Artist, and the footer all correctly
#     cascade down when 1-2 deduction lines are actually present, and
#     nothing moves at all in the (typical) case where neither applies.
DEDUCTION_Y = "895.32"
deduction_elements = [
    '<text data-run-id="p1_new_deduction_label" x="103.68" y="{y}" font-family="\'Archivo-Regular\'" '
    'font-size="10.51" fill="#000000" font-weight="normal" font-style="normal" '
    'xml:space="preserve">0</text>'.format(y=DEDUCTION_Y),
    '<text data-run-id="p1_new_deduction_value" x="721.28" y="{y}" font-family="\'Archivo-Regular\'" '
    'font-size="10.51" fill="#000000" font-weight="normal" font-style="normal" '
    'xml:space="preserve">0</text>'.format(y=DEDUCTION_Y),
]
insertion_point = html_text.index('<text data-run-id="p1_r066"')  # right before "Venue Merch Take" label
html_text = html_text[:insertion_point] + "\n      ".join(deduction_elements) + "\n      " + html_text[insertion_point:]

manifest["fields"].append({
    "run_id": "p1_new_deduction_label", "field_name": "__row0_artist_deduction_lines_label", "type": "text",
    "source_text": "0", "variable": True, "confidence": "confirmed",
    "repeat_row0_of": "artist_deduction_lines", "repeat_row0_key": "label",
    "position": {"page": 1, "x_px": 103.68, "y_px": 895.32, "width_px": 100, "height_px": 8.0},
})
manifest["fields"].append({
    "run_id": "p1_new_deduction_value", "field_name": "__row0_artist_deduction_lines_value", "type": "currency_paren",
    "source_text": "0", "variable": True, "confidence": "confirmed",
    "repeat_row0_of": "artist_deduction_lines", "repeat_row0_key": "value",
    "position": {"page": 1, "x_px": 721.28, "y_px": 895.32, "width_px": 100, "height_px": 8.0},
})

# 3c. Right-align the header block (artist name + "Event Settlement" +
#     "Created on:" date) at a shared right edge instead of each line being
#     independently left-anchored at a fixed x. The original PSD's example
#     ("THE RANSOM BROTHERS", a long name) happened to reach close to the
#     page's right margin when left-anchored, LOOKING right-aligned by
#     coincidence -- but a short name ("Twin Fin") left-anchored at that
#     same x stops far short of the margin, visibly unaligned with the
#     subtext below it. text-anchor="end" at the header block's right edge
#     (764.8, from the PSD's own header group bbox) makes any name length
#     terminate flush, matching what's actually being asked for.
HEADER_RIGHT_X = "764.8"
for run_id in ("p1_r116", "p1_r117", "p1_r118"):
    pattern = re.compile(r'(<text data-run-id="' + re.escape(run_id) + r'" x=")[^"]*(")')
    html_text, n = pattern.subn(r'\g<1>' + HEADER_RIGHT_X + r'\g<2>', html_text)
    assert n == 1, f"expected to update x= on {run_id}, matched {n}"
    pattern2 = re.compile(r'(<text data-run-id="' + re.escape(run_id) + r'"[^>]*?)(xml:space=)')
    html_text, n2 = pattern2.subn(r'\g<1>text-anchor="end" \g<2>', html_text)
    assert n2 == 1, f"expected to add text-anchor on {run_id}, matched {n2}"

# 3d. Every bold subtotal row in this template ("Gross Box Office
#     Receipts", "Fixed", "Net Merch Sales", "Total Due to Artist", etc.)
#     is followed by a thin horizontal-rule PNG that acts as its closing
#     underline -- confirmed from extraction.json ordering, every one of
#     these dividers sits ~13-14px below its own bold row's text-top, not
#     between two unrelated rows. extract_psd.py's NATIVE_BASELINE_OVERSHOOT_PX
#     (calibrated for section-header vertical-centering) pushes ALL text
#     baselines down by 10 native px (~3.2 CSS px), including these bold
#     row labels -- but the divider PNGs are static assets, unaffected by
#     that formula, so they didn't move with the text. That 3.2px of body
#     text sinking into an already-tight ~2px original clearance is what
#     turns the underline into a literal strikethrough through the row's
#     own text (measured directly: "Fixed"'s ink bottom sits at raster
#     y=710 in a 150dpi render, its divider at y=708 -- 2px *inside* the
#     glyphs, not below them). Fix: shift every one of these dividers back
#     down by a uniform compensating amount so each regains the clearance
#     it had before the overshoot went in.
DIVIDER_SHIFT_DOWN_PX = 4.5
BOLD_ROW_DIVIDERS = [
    "p1_img016",  # under the ticket-audit column-header row
    "p1_img004",  # under "Gross Box Office Receipts"
    "p1_img005",  # under "Net Box Office Receipts"
    "p1_img009",  # under "Fixed" (expenses)
    "p1_img010",  # under "Variable" (expenses)
    "p1_img011",  # under "Total Expenses"
    "p1_img012",  # under "Gross Merch Sales"
    "p1_img013",  # under "Net Merch Sales"
    "p1_img014",  # under "Artist Gurantee"
    "p1_img015",  # under "Total Due to Artist"
]
for run_id in BOLD_ROW_DIVIDERS:
    shift_up_px = -DIVIDER_SHIFT_DOWN_PX
    m = re.search(r'top:([\d.]+)px', html_text[html_text.index(f'data-run-id="{run_id}"'):])
    assert m, f"could not find top: for {run_id}"
    old_top = float(m.group(1))
    new_top = old_top - shift_up_px
    pattern = re.compile(r'(<img[^>]*data-run-id="' + re.escape(run_id) + r'"[^>]*top:)' + re.escape(m.group(1)) + r'(px)')
    html_text, n = pattern.subn(r'\g<1>' + str(new_top) + r'\g<2>', html_text)
    assert n == 1, f"expected to update top: on {run_id}, matched {n}"
    fields_by_id[run_id]["position"]["y_px"] = new_top

# 4. Substitute {{field_name}} placeholders for every variable field EXCEPT
#    row-0 repeat stencils (those get their text set live by generate.js).
fields_by_id = {f["run_id"]: f for f in manifest["fields"]}
placeholder_count = 0
for f in manifest["fields"]:
    if not f["variable"]:
        continue
    if f.get("repeat_row0_of") and f["run_id"] != "p1_new_unsold_row0":
        continue  # row-0 stencils (existing PSD ones) keep literal example text
    if f["run_id"] == "p1_new_unsold_row0":
        continue  # already inserted as a placeholder literal above
    placeholder = f"{{{{{f['field_name']}}}}}"
    pattern = re.compile(r'(<text data-run-id="' + re.escape(f["run_id"]) + r'"[^>]*>)(.*?)(</text>)', re.DOTALL)
    new_html, n = pattern.subn(lambda m: m.group(1) + html.escape(placeholder) + m.group(3), html_text)
    if n != 1:
        print(f"WARNING: {f['run_id']} ({f['field_name']}) matched {n} times")
    else:
        placeholder_count += 1
    html_text = new_html

manifest["finalized"] = True
(TEMPLATE_DIR / "template.html").write_text(html_text)
(TEMPLATE_DIR / "manifest.json").write_text(json.dumps(manifest, indent=2))
print(f"Removed {len(FIXED_EXTRA | VARIABLE_EXTRA)} baked-in rows, added 3 UNSOLD column elements, "
      f"substituted {placeholder_count} placeholders. Template finalized.")

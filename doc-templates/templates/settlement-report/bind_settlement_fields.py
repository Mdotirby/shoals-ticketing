#!/usr/bin/env python3
"""One-off: rebinds the settlement-report draft manifest to real Settlement
fields (lib/types/settlement.ts) instead of auto-slugged placeholder names,
and adds repeating_sections metadata for ticket_audit / fixed-expenses /
variable-expenses rows."""
import json
from pathlib import Path

MANIFEST_PATH = Path("/Users/mattirby/shoals-ticketing/.claude/worktrees/wonderful-noyce-2f95b9/doc-templates/templates/settlement-report/manifest.json")

manifest = json.loads(MANIFEST_PATH.read_text())
fields_by_id = {f["run_id"]: f for f in manifest["fields"]}

# run_id -> (field_name, type, extra overrides)
REMAP = {
    # Header
    "p1_r116": ("artist_name", "text", {"text_transform": "uppercase"}),  # header title, ALL CAPS display of same value
    "p1_r117": ("created_on_label", "text", {"note": "computed at generation time: 'Created on: ' + today's date, not stored Settlement data"}),
    # Deal terms
    "p1_r109": ("artist_name", "text", {}),
    "p1_r113": ("event_date_label", "text", {"note": "pre-formatted date string, matches eventDateLabel passed into drawDealTerms() in lib/pdf/settlement-pdf.ts"}),
    "p1_r106": ("deal_type", "text", {"note": "Settlement.deal_type: FLAT|VS|PLUS|DOOR|CO_PROMOTE"}),
    "p1_r111": ("guarantee", "currency", {}),
    "p1_r115": ("backend_percentage_label", "text", {"note": "pre-formatted '(backend_percentage*100).toFixed(2)+\"%\"', matches settlement-pdf.ts:256"}),
    # Financial summary
    "p1_r012": ("gross_receipts", "currency", {"note": "computed = total_gross + ticketing_fees + facility_fees + cc_fees + taxes, matches settlement-pdf.ts:269-271"}),
    "p1_r004": ("ticketing_fees", "currency_paren", {"note": "always parenthesized -- settlement-pdf.ts:278 hardcodes `(${fmt(x)})`, not sign-dependent"}),
    "p1_r006": ("facility_fees", "currency_paren", {}),
    "p1_r007": ("tax_label", "text", {"note": "pre-formatted 'Taxes (' + (tax_rate*100).toFixed(2) + '%, ' + (tax_method==='divisor'?'Divisor':'Multiplier') + ')' -- mockup wording, confirmed by Matt"}),
    "p1_r008": ("taxes", "currency_paren", {}),
    "p1_r010": ("cc_fees", "currency_paren", {}),
    "p1_r014": ("net_receipts", "currency", {}),
    # Expenses subtotals (fixed position, values computed by adapter from settlement_expenses)
    "p1_r053": ("expenses_fixed_total", "currency", {}),
    "p1_r055": ("expenses_variable_total", "currency", {}),
    "p1_r057": ("total_expenses", "currency", {}),
    # Merch settlement (all aggregate scalars, no itemization per Matt's answer)
    "p1_r063": ("merch_total_gross", "currency", {}),
    "p1_r050": ("merch_tax_label", "text", {"note": "pre-formatted 'Sales Tax (' + (merch_tax_rate*100).toFixed(2) + '%, ' + (merch_tax_method==='divisor'?'Divisor':'Multiplier') + ')'"}),
    "p1_r051": ("merch_total_tax", "currency_paren", {}),
    "p1_r065": ("merch_total_net", "currency", {}),
    "p1_r058": ("merch_venue_take_label", "text", {"note": "pre-formatted 'Venue Take (' + (merch_split_venue_pct*100).toFixed(1) + '% of Net)'"}),
    "p1_r059": ("merch_venue_share", "currency", {}),
    "p1_r061": ("merch_artist_share", "currency", {}),
    # Artist settlement
    "p1_r069": ("guarantee", "currency", {}),  # same value shown again
    "p1_r067": ("merch_venue_take_deduction", "currency_paren", {"note": "SAME underlying value as merch_venue_share (p1_r059) but a distinct field_name -- the two occurrences need different formatting (plain vs. parenthesized-deduction) and placeholder substitution is a global string replace per field_name, so they can't share one. Adapter should pass merch_venue_share's value under both keys. Real balance_due can also subtract artistPaidMerchSellerFee and venuePaidMerchTax when those apply (settlement-pdf.ts:421-424), which this design has no line for -- flagged to Matt, not yet added."}),
    "p1_r071": ("artist_backend", "currency", {"note": "settlement.artist_backend (labeled 'Backend Overage' in mockup)"}),
    "p1_r073": ("balance_due", "currency", {"note": "mockup labels this 'Total Due to Artist' but the arithmetic (guarantee - venue_merch_take = this value) matches Settlement.balance_due, not artist_total -- artist_total is pre-deposit/advance/merch deductions"}),
    # Ticket audit TOTALS row (y=248, distinct from the y=232 example row above)
    "p1_r075": ("ticket_totals_capacity", "number", {}),
    "p1_r076": ("ticket_totals_sold", "number", {}),
    "p1_r077": ("ticket_totals_comps", "number", {}),
    "p1_r079": ("ticket_totals_svc", "currency", {}),
    "p1_r080": ("ticket_totals_fac", "currency", {}),
    "p1_r081": ("ticket_totals_tax", "currency", {}),
    "p1_r082": ("ticket_totals_cc", "currency", {}),
    "p1_r083": ("ticket_totals_gross", "currency", {}),
}
# Real app leaves the Price cell blank on the totals row (settlement-pdf.ts:217
# `doc.text("", colX[5], y)`) -- not a data field, just cleared to empty.
BLANK_RUN_IDS = {"p1_r078"}

# Column header + row-template run_ids for the ticket_audit repeating section.
TICKET_ROW_FIELDS = [
    {"key": "tier", "run_id": "p1_r084", "type": "text"},
    {"key": "capacity", "run_id": "p1_r085", "type": "number"},
    {"key": "sold", "run_id": "p1_r086", "type": "number"},
    {"key": "comps", "run_id": "p1_r087", "type": "number"},
    {"key": "unsold", "run_id": "p1_new_unsold_row0", "type": "number"},  # new column, added by compose_template.py
    {"key": "price", "run_id": "p1_r088", "type": "currency"},
    {"key": "svc", "run_id": "p1_r089", "type": "currency"},
    {"key": "fac", "run_id": "p1_r090", "type": "currency"},
    {"key": "tax", "run_id": "p1_r091", "type": "currency"},
    {"key": "cc", "run_id": "p1_r092", "type": "currency"},
    {"key": "gross", "run_id": "p1_r093", "type": "currency"},
]
TICKET_TOTALS_FIELDS = {
    "capacity": "p1_r075", "sold": "p1_r076", "comps": "p1_r077",
    "price": "p1_r078",  # real app leaves this blank on the totals row
    "svc": "p1_r079", "fac": "p1_r080", "tax": "p1_r081", "cc": "p1_r082", "gross": "p1_r083",
}

FIXED_EXPENSE_ROW_FIELDS = [
    {"key": "name", "run_id": "p1_r018", "type": "text"},
    {"key": "amount", "run_id": "p1_r019", "type": "currency"},
]
VARIABLE_EXPENSE_ROW_FIELDS = [
    {"key": "name", "run_id": "p1_r042", "type": "text"},
    {"key": "amount", "run_id": "p1_r043", "type": "currency"},
]

# Every run_id that belongs to a repeating row (example instance) or a totals
# row driven by aggregate math -- these get pulled OUT of the flat "fields"
# list (they're described by repeating_sections / totals instead) except the
# totals ones, which stay as normal scalar fields (already remapped above).
REPEAT_EXAMPLE_ROW_IDS = {f["run_id"] for f in TICKET_ROW_FIELDS if f["run_id"]} | \
    {f["run_id"] for f in FIXED_EXPENSE_ROW_FIELDS} | \
    {f["run_id"] for f in VARIABLE_EXPENSE_ROW_FIELDS}

# All the "Catering/Hospitality/.../Medical" and "ASCAP/BMI/SESAC/GMR" label
# + amount runs beyond the first example of each category are removed from
# the static template entirely -- they become repeat-section rows 1..N-1,
# generated at render time, not baked into template.html.
FIXED_EXPENSE_EXTRA_ROW_IDS = {
    "p1_r020", "p1_r021", "p1_r022", "p1_r023", "p1_r024", "p1_r025",
    "p1_r026", "p1_r027", "p1_r028", "p1_r029", "p1_r030", "p1_r031",
    "p1_r032", "p1_r033", "p1_r034", "p1_r035", "p1_r036", "p1_r037",
    "p1_r038", "p1_r039", "p1_r040", "p1_r041",
}
VARIABLE_EXPENSE_EXTRA_ROW_IDS = {
    "p1_r044", "p1_r045", "p1_r046", "p1_r047", "p1_r048", "p1_r049",
}

for run_id, (field_name, ftype, extra) in REMAP.items():
    f = fields_by_id[run_id]
    f["field_name"] = field_name
    f["type"] = ftype
    f["variable"] = True
    f["confidence"] = "confirmed"
    if extra:
        f.update(extra)

for run_id in BLANK_RUN_IDS:
    f = fields_by_id[run_id]
    f["field_name"] = None
    f["variable"] = False
    f["confidence"] = "confirmed"
    f["blank"] = True

# Drop the "extra" hardcoded example rows for Hospitality..Medical and
# BMI..GMR -- only the FIRST example of each category stays in the static
# template as the row-template stencil; the rest become generated rows.
manifest["fields"] = [
    f for f in manifest["fields"]
    if f["run_id"] not in FIXED_EXPENSE_EXTRA_ROW_IDS
    and f["run_id"] not in VARIABLE_EXPENSE_EXTRA_ROW_IDS
]

# Row-template stencil fields (Catering/$0.00, ASCAP/$0.00, GENERAL ADMISSION
# row) stay in manifest["fields"] too (as variable, driven by row index 0 of
# their section) so build_template.py's existing text-substitution still
# handles them uniformly -- but tag them so generate.js knows they're row 0
# of a repeating section, not a plain scalar.
ROW0_TAGS = {
    "p1_r084": ("ticket_audit", "tier"), "p1_r085": ("ticket_audit", "capacity"),
    "p1_r086": ("ticket_audit", "sold"), "p1_r087": ("ticket_audit", "comps"),
    "p1_r088": ("ticket_audit", "price"), "p1_r089": ("ticket_audit", "svc"),
    "p1_r090": ("ticket_audit", "fac"), "p1_r091": ("ticket_audit", "tax"),
    "p1_r092": ("ticket_audit", "cc"), "p1_r093": ("ticket_audit", "gross"),
    "p1_r018": ("fixed_expenses", "name"), "p1_r019": ("fixed_expenses", "amount"),
    "p1_r042": ("variable_expenses", "name"), "p1_r043": ("variable_expenses", "amount"),
}
for run_id, (section_id, key) in ROW0_TAGS.items():
    f = fields_by_id[run_id]
    f["field_name"] = f"__row0_{section_id}_{key}"
    f["variable"] = True
    f["repeat_row0_of"] = section_id
    f["repeat_row0_key"] = key
    f["confidence"] = "confirmed"

manifest["repeating_sections"] = [
    {
        "id": "ticket_audit",
        "data_path": "ticket_audit",
        "anchor_run_id": "p1_r084",
        "row_height_px": 16.0,
        "row_fields": TICKET_ROW_FIELDS,
        "totals_fields": TICKET_TOTALS_FIELDS,
        # How many rows' worth of vertical space everything BELOW this
        # section is already positioned for in the static template -- NOT
        # how many <text> elements are physically baked into template.html
        # (that's always exactly 1, the row-0 stencil). The PSD mockup drew
        # 1 ticket tier, so elements below already assume 1 row of space.
        "example_row_count": 1,
        "note": "row_height_px derived from gap between the single example tier row (y~232) and the TOTALS row (y~248) -- only one example row exists in the PSD, so pitch is inferred rather than measured across multiple rows.",
    },
    {
        "id": "fixed_expenses",
        "data_path": "expenses_fixed",
        "anchor_run_id": "p1_r018",
        "row_height_px": 13.2,
        "row_fields": FIXED_EXPENSE_ROW_FIELDS,
        # The mockup drew 12 fixed-category expense rows (Catering..Medical)
        # -- "Variable"/"Total Expenses"/everything below is already
        # positioned assuming 12 rows of space, even though only 1 row
        # (Catering) is physically left in template.html as the row-0 stencil.
        "example_row_count": 12,
        "note": "row_height_px averaged from the 12 consecutive example rows (Catering..Medical) in the PSD.",
    },
    {
        "id": "variable_expenses",
        "data_path": "expenses_variable",
        "anchor_run_id": "p1_r042",
        "row_height_px": 13.2,
        "row_fields": VARIABLE_EXPENSE_ROW_FIELDS,
        "example_row_count": 4,
        "note": "row_height_px averaged from the 4 consecutive example rows (ASCAP..GMR) in the PSD.",
    },
    {
        # Deposits Paid / Cash Advances, matches settlement-pdf.ts:415-418
        # (`if (deposit_paid > 0) ...`, `if (cash_advance > 0) ...`).
        # Modeled as ONE repeating section with 0-2 rows (not two separate
        # 0-or-1 sections) -- there isn't room between the fixed "Venue
        # Merch Take" and "Backend Overage" lines to insert new content
        # without shifting Venue Merch Take too, so the anchor sits just
        # ABOVE it (right after Artist Guarantee) and both Venue Merch
        # Take + everything below cascade down together when 1-2 of these
        # deduction lines are actually present. Adapter builds the array in
        # display order, e.g. [{"label":"Deposits Paid","value":dep},
        # {"label":"Cash Advances","value":adv}], omitting any that are 0.
        "id": "artist_deduction_lines",
        "data_path": "artist_deduction_lines",
        "anchor_run_id": "p1_new_deduction_label",
        "row_height_px": 15.0,
        "row_fields": [
            {"key": "label", "run_id": "p1_new_deduction_label", "type": "text"},
            {"key": "value", "run_id": "p1_new_deduction_value", "type": "currency_paren"},
        ],
        "example_row_count": 0,
    },
]

MANIFEST_PATH.write_text(json.dumps(manifest, indent=2))
print(f"Remapped {len(REMAP)} scalar fields, tagged {len(ROW0_TAGS)} row-0 stencils, "
      f"removed {len(FIXED_EXPENSE_EXTRA_ROW_IDS) + len(VARIABLE_EXPENSE_EXTRA_ROW_IDS)} baked-in example rows.")
print(f"Total fields remaining: {len(manifest['fields'])}")

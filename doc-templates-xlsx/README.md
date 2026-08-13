# xlsx document pipeline

Status as of 2026-08-12: **Offer, Artist Settlement, and Venue Settlement
shipped** -- built, tested, and wired to their real buttons, replacing the
old PDF exports for these three document types. Contract, Invoice, Proposal,
Rental Contract, Co-Promote Agreement, and Ticket Audit are not covered yet
-- no Numbers design for those exists; old PDF exports for those types are
untouched.

Source design: Matt's `VENUECORE XCL TEMPLATES/Offer:Settlement
templates.xlsx` (4 sheets: OFFER, ARTIST_SETTLEMENT, VENUE_SETTLEMENTv1,
VENUE_SETTLEMENTv2 -- v1/v2 are two layout variants of the same venue
document, v2 is the one actually used, since it has the corrected Total Due
to Artist formula and an extra line item v1 lacked).

## Pipeline stages (as actually used)

1. `scripts/extract_xlsx.mjs <file.xlsx> extraction.json` -- deterministic
   dump of every sheet: cell values/addresses, fonts, fills, number formats,
   merges, column widths. No inference -- a faithful transcript, read by
   hand to build the field mapping (same reasoning-not-heuristics approach
   as the earlier PDF/PSD pipeline).
2. `scripts/isolate_sheet.mjs <source.xlsx> <sheet-name> <out.xlsx>` --
   extracts one sheet into its own single-sheet workbook, formulas stripped
   to their last static value (the production render engine writes real
   app-computed values directly; a live Excel formula left in a cell would
   silently overwrite it on open).
3. `templates/<type>/manifest.json` -- hand-authored cell-address -> field
   mapping, plus `repeating_sections` config for variable-length tables
   (ticket tiers, expense lines) using real Excel row insertion/deletion
   (`worksheet.duplicateRow` / `spliceRows`), not a pixel-shift hack.
4. Production: `lib/xlsx-templates/<type>/adapter.ts` (real domain object ->
   flat field values, binds to the app's own already-computed fields --
   `settlement.balance_due`, `offer.splitpoint`, etc. -- never re-derives
   the source spreadsheet's own formulas, several of which turned out to be
   wrong or tier-1-only) + shared `lib/xlsx-templates/render.ts` (loads
   template, applies manifest, grows repeating tables, embeds the logo,
   protects the sheet, returns a Buffer) + one `/api/.../export-xlsx` route
   per doc type, wired to each admin page's export button.

## Two exceljs pitfalls that cost real debugging time

- **Custom indexed-color palette gets silently dropped.** Matt's source
  file overrides the standard 56-color Excel palette (e.g. index 10 = a
  specific gray, not the standard palette's pure red). `exceljs` drops the
  `<colors><indexedColors>...</indexedColors></colors>` override on *every*
  read+write round-trip -- confirmed by reading the original file and
  writing it straight back out with zero edits. Every indexed-color
  reference then falls back to the wrong standard interpretation (gray ->
  red headers, light-gray fills -> bold blue boxes). Fixed by
  `lib/xlsx-templates/fix-indexed-colors.ts`, which patches the palette
  back into the written buffer's `xl/styles.xml`.
- **Column widths drift by a fraction of a unit on every round-trip.** A
  logo position computed once during template authoring (baked in via a
  since-removed `add_logo.mjs`) went visibly off-center after several more
  `isolate -> clear -> embed` round-trips each perturbed the widths
  slightly. Fixed by moving logo placement into `render.ts` itself
  (`embed-logo.ts`), computed fresh against the FINAL column widths right
  before the buffer is written -- and using a `twoCellAnchor` (pinned to
  two grid corners) instead of a `oneCellAnchor` + explicit pixel size, so
  the receiving app does its own width math instead of trusting a
  pre-computed guess.

## Real production bugs found via this migration (not just document bugs)

- **Backend Overage formula** was `(NetAfterExpenses − Guarantee) ×
  Backend%` in `app/admin/settlements/[id]/page.tsx`; corrected to
  `(Splitpoint × Backend%) − Guarantee` per Matt, floored at 0. Cross-
  checked against `app/admin/offers/new/page.tsx`, which already had the
  right shape (`artistPAS = max(guarantee, splitpoint * backendPct)` --
  algebraically the same formula).
- **`ticketing_rebate` double-counting**: now flows into the artist's
  payout as an additive Bonus line (only nonzero for ticketing-only deals),
  offset on the venue P&L side so the money is counted exactly once instead
  of appearing as pure venue profit while also being paid out.

## Locking

Protected worksheet, no password (Matt's call): view/print freely in
Excel/Numbers/Sheets, can't edit cells/formulas/layout. Excel's standard
"Protect Sheet" -- a tamper deterrent for normal use, not encryption.

## Known gaps / open items

- Offer's CC-fee model (2.9% + $0.30/tier) has no per-offer field to bind
  to instead -- matches the source sheet's own assumption, shown unlabeled
  in the Financial Summary area. Cosmetic, not yet resolved with Matt.
- Old PDF code (`lib/pdf/offer-pdf.ts`, `lib/pdf/settlement-pdf.ts`'s venue
  export, `lib/pdf-templates/settlement-report/`) is still in the repo,
  disconnected from any button. Not deleted until confirmed stable in
  production.
- `doc-templates-xlsx/reference/extraction.json` (the raw multi-sheet dump)
  is intentionally NOT committed -- 5MB of diagnostic output with no
  forward value now that the field mapping is finalized in each type's
  `manifest.json`.

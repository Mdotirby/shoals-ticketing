import ExcelJS from "exceljs";
import path from "path";
import { readFile } from "fs/promises";
import { fixIndexedColors } from "./fix-indexed-colors";
import { embedLogo } from "./embed-logo";

// ── Manifest schema ─────────────────────────────────────────────────────

type ScalarFieldSpec = {
  cell: string;
  field: string;
  type: "text" | "currency" | "percent" | "number";
  note?: string;
  /**
   * Leave the cell EMPTY when the value is null, instead of printing 0.
   *
   * A numeric cell normally renders 0 for a missing value, which is right
   * almost everywhere — a fee of nothing is nothing. It is wrong for a row
   * that should not be there at all: the offer sheet's CC line sits in a
   * column of deductions, and printing $0.00 in it still invites the reader
   * to subtract something. Opt-in per cell so no other document changes.
   */
  blankWhenNull?: boolean;
};
type RepeatRowField = { col: string; field: string; type: "text" | "currency" | "percent" | "number" };
type RepeatingSection = {
  id: string;
  data_path: string;
  anchor_rows: number[];
  totals_row?: number;
  row_fields: RepeatRowField[];
  example_row_count: number;
  note?: string;
};
type Manifest = {
  type_slug: string;
  source_sheet: string;
  scalar_fields: ScalarFieldSpec[];
  repeating_sections: RepeatingSection[];
  /**
   * Template merges to draw wider than the template has them, keyed by the
   * template's own range ("F20:G20": "F20:L20"), and new merges for value
   * cells that had none. Both in template row numbers; they shift with the
   * rows like every other merge. For value cells whose text outgrew them.
   */
  merge_overrides?: Record<string, string>;
  extra_merges?: string[];
};

// ── Cell address helpers ────────────────────────────────────────────────

function splitAddress(addr: string): { col: string; row: number } {
  const m = /^([A-Z]+)(\d+)$/.exec(addr);
  if (!m) throw new Error(`Invalid cell address: ${addr}`);
  return { col: m[1], row: Number(m[2]) };
}

function parseRange(range: string): { c1: string; r1: number; c2: string; r2: number } {
  const [a, b] = range.split(":");
  const s1 = splitAddress(a);
  const s2 = b ? splitAddress(b) : s1;
  return { c1: s1.col, r1: s1.row, c2: s2.col, r2: s2.row };
}

// ── Value formatting: templates already carry the right numFmt on each
//    data cell (currency/percent), so we just write plain JS values --
//    Excel/Numbers/Sheets render them using the format already baked into
//    the cell's style. Percent cells expect a decimal (0.095, not 9.5).
function formatValue(raw: unknown, type: ScalarFieldSpec["type"]): ExcelJS.CellValue {
  if (raw === undefined || raw === null) return type === "text" ? "" : 0;
  if (type === "text") return String(raw);
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Renders a data-driven .xlsx from an isolated template + manifest.
 *
 * templateDir must contain template.xlsx and manifest.json (see
 * doc-templates-xlsx/templates/<type>/ for the offline-authored source of
 * truth these are copied from).
 *
 * `data` is the flat field map (already computed by the type's adapter --
 * this function does no business-math of its own, purely cell placement).
 */
export type RenderOptions = {
  /**
   * Drop every row from the one whose column-A label is this text to the end
   * of the sheet. The offer workbook's last block is the venue's own numbers
   * ("VENUE POTENTIAL AT SELLOUT — WEST 72 ENT INTERNAL USE ONLY"); the copy
   * that goes to an agent is cut there.
   */
  cutFromLabel?: string;
};

export async function renderXlsxTemplate(
  templateDir: string,
  data: Record<string, unknown>,
  opts: RenderOptions = {},
): Promise<Buffer> {
  const manifest: Manifest = JSON.parse(
    await readFile(path.join(templateDir, "manifest.json"), "utf-8")
  );
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(path.join(templateDir, "template.xlsx"));
  const sheet = workbook.getWorksheet(manifest.source_sheet);
  if (!sheet) throw new Error(`Sheet "${manifest.source_sheet}" not found in template`);

  // 1. Capture every existing merge (in original template row numbers) and
  //    unmerge -- row insertion/deletion below does NOT shift merge
  //    definitions on its own (verified against exceljs directly), so
  //    merges are removed now and reapplied at corrected positions once
  //    all row shifting is done.
  const originalMerges = (sheet.model.merges || []).map(parseRange);
  for (const m of originalMerges) {
    sheet.unMergeCells(`${m.c1}${m.r1}:${m.c2}${m.r2}`);
  }

  // 2. Repeating sections, processed top-to-bottom, each contributing a
  //    shift delta that applies to everything below its own anchor.
  const sections = [...manifest.repeating_sections].sort(
    (a, b) => a.anchor_rows[0] - b.anchor_rows[0]
  );
  const shiftBreakpoints: { originalRow: number; cumulativeShift: number }[] = [];
  let cumulativeShift = 0;

  for (const section of sections) {
    const anchorOriginal = section.anchor_rows[0];
    const anchorRow = anchorOriginal + cumulativeShift;
    const items = (Array.isArray(data[section.data_path]) ? data[section.data_path] : []) as Record<
      string,
      unknown
    >[];
    const exampleCount = section.example_row_count;
    const actualCount = items.length;
    const delta = actualCount - exampleCount;

    if (delta > 0) {
      // More rows than the template stencil has -- clone the last stencil
      // row (style + formatting) `delta` times right after itself.
      sheet.duplicateRow(anchorRow + exampleCount - 1, delta, true);
    } else if (delta < 0) {
      // Fewer rows than the stencil -- drop the extra rows off the end of
      // the block (keep the first `actualCount` stencil rows, remove the
      // rest). If actualCount is 0 this removes the whole block.
      sheet.spliceRows(anchorRow + actualCount, -delta);
    }

    for (let i = 0; i < actualCount; i++) {
      const row = anchorRow + i;
      const item = items[i] || {};
      for (const rf of section.row_fields) {
        const cell = sheet.getCell(`${rf.col}${row}`);
        cell.value = formatValue(item[rf.field], rf.type);
      }
    }

    cumulativeShift += delta;
    shiftBreakpoints.push({ originalRow: anchorOriginal, cumulativeShift });
  }

  function shiftForOriginalRow(originalRow: number): number {
    let shift = 0;
    for (const bp of shiftBreakpoints) {
      if (bp.originalRow < originalRow) shift = bp.cumulativeShift;
    }
    return shift;
  }

  // 3. Reapply merges at their shifted positions.
  //
  // Two template merges can land on the same rows once a section shrinks --
  // a summary block whose label cells are merged collapses onto the block
  // above it when its stencil rows are spliced out. exceljs throws "Cannot
  // merge already merged cells" on the second one, which killed the whole
  // render. Skipping the duplicate keeps the first (topmost) merge, which is
  // the one whose row the shift was computed from.
  const overrides = manifest.merge_overrides ?? {};
  const merges = [
    ...originalMerges.map((m) => {
      const key = `${m.c1}${m.r1}:${m.c2}${m.r2}`;
      return overrides[key] ? parseRange(overrides[key]) : m;
    }),
    ...(manifest.extra_merges ?? []).map(parseRange),
  ];
  const applied = new Set<string>();
  for (const m of merges) {
    const shift = shiftForOriginalRow(m.r1);
    const range = `${m.c1}${m.r1 + shift}:${m.c2}${m.r2 + shift}`;
    if (applied.has(range)) continue;
    try {
      sheet.mergeCells(range);
      applied.add(range);
    } catch {
      // Already merged by an overlapping range -- see above.
    }
  }

  // 4. Scalar fields, positioned at their shifted row.
  for (const field of manifest.scalar_fields) {
    const { col, row } = splitAddress(field.cell);
    const shift = shiftForOriginalRow(row);
    const cell = sheet.getCell(`${col}${row + shift}`);
    const raw = data[field.field];
    cell.value =
      field.blankWhenNull && (raw === null || raw === undefined)
        ? null
        : formatValue(raw, field.type);
  }

  // 4a. Cut the sheet short, for a copy that leaves the building. Merges in
  //     the cut rows go first -- spliceRows doesn't move them -- and blank
  //     rows above the cut go with it, so the sheet doesn't end in a gap.
  if (opts.cutFromLabel) {
    const want = opts.cutFromLabel.trim().toUpperCase();
    let cut = 0;
    sheet.eachRow({ includeEmpty: false }, (row, r) => {
      if (!cut && String(row.getCell(1).value ?? "").trim().toUpperCase() === want) cut = r;
    });
    if (!cut) throw new Error(`cutFromLabel "${opts.cutFromLabel}" not found`);
    const isBlank = (r: number) => {
      let blank = true;
      sheet.getRow(r).eachCell({ includeEmpty: false }, (c) => {
        if (c.value !== null && c.value !== "") blank = false;
      });
      return blank;
    };
    while (cut > 1 && isBlank(cut - 1)) cut--;
    for (const m of (sheet.model.merges || []).map(parseRange)) {
      if (m.r2 >= cut) sheet.unMergeCells(`${m.c1}${m.r1}:${m.c2}${m.r2}`);
    }
    const last = sheet.rowCount;
    if (last >= cut) sheet.spliceRows(cut, last - cut + 1);
  }

  // 4b'. Make every wrapped value fit. The template's text cells wrap, but
  //      at fixed row heights, so anything longer than one line was cut off
  //      at the cell's bottom edge -- a door deal's terms, a merch split, a
  //      long note. Rows only ever grow, and only as far as their longest
  //      cell needs.
  fitRowsToText(sheet);

  // 4b. Vertically center every cell's content. The source design uses
  //     vertical="top" throughout (confirmed against the original file's
  //     own XML -- not something introduced by this pipeline), but Matt
  //     wants cell data centered, so this is a deliberate change, applied
  //     uniformly rather than cell-by-cell.
  sheet.eachRow({ includeEmpty: false }, (row) => {
    row.eachCell({ includeEmpty: false }, (cell) => {
      cell.alignment = { ...cell.alignment, vertical: "middle" };
    });
  });

  // 4c. Logo, computed fresh against this sheet's final column widths --
  //     see embed-logo.ts for why this can't be pre-baked into the
  //     template.
  await embedLogo(sheet);

  // 5. Protect the sheet -- view/print freely, can't edit. No password
  //    (Matt's call): this is Excel's standard tamper deterrent for normal
  //    use, not encryption.
  await sheet.protect("", {
    selectLockedCells: true,
    selectUnlockedCells: true,
    formatCells: false,
    formatColumns: false,
    formatRows: false,
    insertRows: false,
    insertColumns: false,
    deleteRows: false,
    deleteColumns: false,
    sort: false,
    autoFilter: false,
  });

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return fixIndexedColors(Buffer.from(arrayBuffer));
}

// ── Row heights that fit their text ─────────────────────────────────────

/** Excel's default column width, in its own units (about one '0' each). */
const DEFAULT_COL_WIDTH = 8.43;

/** Lines a string needs at `cap` characters per line, wrapping on words. */
function linesFor(text: string, cap: number): number {
  let lines = 0;
  for (const para of text.split(/\r?\n/)) {
    let line = 0;
    lines++;
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const w = word.length;
      if (line === 0) {
        line = w;
        lines += Math.floor(Math.max(0, w - 1) / cap);
        line = w % cap || cap;
      } else if (line + 1 + w <= cap) {
        line += 1 + w;
      } else {
        lines++;
        lines += Math.floor(Math.max(0, w - 1) / cap);
        line = w % cap || cap;
      }
    }
  }
  return Math.max(1, lines);
}

function fitRowsToText(sheet: ExcelJS.Worksheet) {
  const colWidth = (c: number) => sheet.getColumn(c).width ?? DEFAULT_COL_WIDTH;
  // The width a value really has: its whole merge, when it is the top-left.
  const spans = new Map<string, number>();
  for (const m of (sheet.model.merges || []).map(parseRange)) {
    let w = 0;
    for (let c = colIndex(m.c1); c <= colIndex(m.c2); c++) w += colWidth(c);
    spans.set(`${m.c1}${m.r1}`, w);
  }

  sheet.eachRow({ includeEmpty: false }, (row) => {
    let need = 0;
    row.eachCell({ includeEmpty: false }, (cell) => {
      if (typeof cell.value !== "string" || !cell.alignment?.wrapText) return;
      // Every cell of a merge reports the merge's text; only its top-left
      // owns it, measured across the whole merge.
      if (cell.isMerged && cell.master.address !== cell.address) return;
      const width = spans.get(cell.address) ?? colWidth(Number(cell.col));
      const size = Number(cell.font?.size) || 11;
      // Width units are 11pt digits; a smaller font fits proportionally
      // more, and running text averages a little narrower than a digit.
      // Still on the safe side -- a row a little tall beats a word cut off.
      const cap = Math.max(4, Math.floor(width * (11 / size) * 1.05));
      const lines = linesFor(cell.value, cap);
      need = Math.max(need, 6 + lines * size * 1.35);
    });
    if (need > (row.height ?? 15)) row.height = Math.ceil(need * 10) / 10;
  });
}

function colIndex(col: string): number {
  let n = 0;
  for (const ch of col) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}

import ExcelJS from "exceljs";
import path from "path";
import { readFile } from "fs/promises";
import { fixIndexedColors } from "./fix-indexed-colors";
import { embedLogo } from "./embed-logo";

// ── Manifest schema ─────────────────────────────────────────────────────

type ScalarFieldSpec = { cell: string; field: string; type: "text" | "currency" | "percent" | "number"; note?: string };
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
export async function renderXlsxTemplate(
  templateDir: string,
  data: Record<string, unknown>
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
  for (const m of originalMerges) {
    const shift = shiftForOriginalRow(m.r1);
    const r1 = m.r1 + shift;
    const r2 = m.r2 + shift;
    sheet.mergeCells(`${m.c1}${r1}:${m.c2}${r2}`);
  }

  // 4. Scalar fields, positioned at their shifted row.
  for (const field of manifest.scalar_fields) {
    const { col, row } = splitAddress(field.cell);
    const shift = shiftForOriginalRow(row);
    const cell = sheet.getCell(`${col}${row + shift}`);
    cell.value = formatValue(data[field.field], field.type);
  }

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

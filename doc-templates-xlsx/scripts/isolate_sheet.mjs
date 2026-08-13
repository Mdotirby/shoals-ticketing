#!/usr/bin/env node
/**
 * Isolates one sheet from the multi-sheet design workbook into its own
 * single-sheet template.xlsx, ready to become a data-driven template:
 *   - Keeps everything: values, formatting, merges, column widths, row
 *     heights, images.
 *   - Strips every formula, replacing the cell with a plain value (its last
 *     computed result) -- the production render engine writes real,
 *     app-computed values at generation time and must never let Excel's own
 *     recalculation silently override them on open.
 *
 * Usage: node isolate_sheet.mjs <source.xlsx> <sheet-name> <output.xlsx>
 */
import ExcelJS from "exceljs";

const [srcPath, sheetName, outPath] = process.argv.slice(2);
if (!srcPath || !sheetName || !outPath) {
  console.error("Usage: node isolate_sheet.mjs <source.xlsx> <sheet-name> <output.xlsx>");
  process.exit(1);
}

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(srcPath);

const sheet = wb.getWorksheet(sheetName);
if (!sheet) {
  console.error(`Sheet "${sheetName}" not found. Available: ${wb.worksheets.map((s) => s.name).join(", ")}`);
  process.exit(1);
}

let formulaCellsStripped = 0;
sheet.eachRow({ includeEmpty: false }, (row) => {
  row.eachCell({ includeEmpty: false }, (cell) => {
    if (cell.value && typeof cell.value === "object" && "formula" in cell.value) {
      const result = cell.value.result;
      cell.value = result === undefined ? null : result;
      formulaCellsStripped++;
    }
  });
});

// Remove every OTHER sheet from the same workbook, in place -- keeps the
// target sheet's style table, theme, and merge/defined-name indexes intact
// (they're workbook-scoped, so rebuilding a fresh workbook from scratch, as
// an earlier version of this script did, silently drops merges and some
// cells because the style refs no longer point at anything valid).
for (const s of [...wb.worksheets]) {
  if (s.name !== sheetName) wb.removeWorksheet(s.id);
}

await wb.xlsx.writeFile(outPath);
console.log(`Isolated "${sheetName}" -> ${outPath} (stripped ${formulaCellsStripped} formulas)`);

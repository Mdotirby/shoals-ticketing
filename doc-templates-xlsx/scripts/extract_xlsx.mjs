#!/usr/bin/env node
/**
 * Deterministic, no-guessing extraction of a Numbers-exported .xlsx design
 * file: every sheet, every non-empty cell's value/address/number-format/
 * font/fill/border, every merged range, column widths, row heights.
 *
 * This does NOT attempt to infer field mappings -- that's a reasoning step
 * (matching label cells to real Settlement/ArtistOffer/etc. fields via
 * context) done by Claude directly against this dump's output, the same
 * way the PSD pipeline's field list was built by hand, not by a heuristic
 * script. This script's only job is to be a faithful, complete, boring
 * transcript of exactly what's in the workbook.
 *
 * Usage: node extract_xlsx.mjs <path-to-xlsx> [output.json]
 */
import ExcelJS from "exceljs";
import { writeFile } from "node:fs/promises";
import path from "node:path";

const inputPath = process.argv[2];
const outputPath = process.argv[3] || "extraction.json";

if (!inputPath) {
  console.error("Usage: node extract_xlsx.mjs <path-to-xlsx> [output.json]");
  process.exit(1);
}

function colorToHex(colorObj) {
  if (!colorObj) return null;
  if (colorObj.argb) return "#" + colorObj.argb.slice(2); // drop alpha
  if (colorObj.theme !== undefined) return `theme:${colorObj.theme}`;
  return null;
}

function extractCell(cell) {
  const value =
    cell.value && typeof cell.value === "object" && "result" in cell.value
      ? cell.value.result // formula cell: use its cached computed value
      : cell.value && typeof cell.value === "object" && "richText" in cell.value
        ? cell.value.richText.map((r) => r.text).join("")
        : cell.value;

  if (value === null || value === undefined || value === "") return null;

  const font = cell.font || {};
  const fill = cell.fill && cell.fill.fgColor ? colorToHex(cell.fill.fgColor) : null;

  return {
    address: cell.address,
    value,
    type: cell.type, // exceljs ValueType enum (number)
    numFmt: cell.numFmt || null,
    formula: cell.formula || null,
    font: {
      bold: !!font.bold,
      italic: !!font.italic,
      size: font.size || null,
      name: font.name || null,
      color: colorToHex(font.color),
    },
    fill,
    alignment: cell.alignment || null,
  };
}

const workbook = new ExcelJS.Workbook();
await workbook.xlsx.readFile(inputPath);

const result = {
  source_file: path.basename(inputPath),
  sheet_count: workbook.worksheets.length,
  sheets: [],
};

for (const sheet of workbook.worksheets) {
  const cells = [];
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    row.eachCell({ includeEmpty: false }, (cell) => {
      const extracted = extractCell(cell);
      if (extracted) cells.push(extracted);
    });
  });

  const merges = [];
  // exceljs stores merges internally; _merges is the practical way to read them
  if (sheet._merges) {
    for (const key of Object.keys(sheet._merges)) {
      merges.push(sheet._merges[key].shortRange || key);
    }
  }

  const columnWidths = sheet.columns
    ? sheet.columns.map((c, i) => ({ col: i + 1, width: c && c.width ? c.width : null }))
    : [];

  result.sheets.push({
    name: sheet.name,
    dimensions: sheet.dimensions ? sheet.dimensions.toString() : null,
    row_count: sheet.rowCount,
    col_count: sheet.columnCount,
    merges: [...new Set(merges)],
    column_widths: columnWidths.filter((c) => c.width),
    cells,
  });
}

await writeFile(outputPath, JSON.stringify(result, null, 2));
console.log(`Extracted ${result.sheet_count} sheet(s) from ${result.source_file}:`);
for (const s of result.sheets) {
  console.log(`  - "${s.name}": ${s.cells.length} non-empty cells, ${s.merges.length} merged ranges, dims ${s.dimensions}`);
}
console.log(`Written to ${outputPath}`);

import ExcelJS from "exceljs";
import path from "path";
import { readFile } from "fs/promises";

const LOGO_PATH = path.join(process.cwd(), "public/West72_Logos/W72_tech_wordmark_black.png");
const LOGO_ASPECT = 1800 / 524; // native pixel dimensions

/**
 * Embeds the W72 wordmark centered in the header banner (rows/cols given),
 * computed fresh against the sheet's CURRENT column widths and row
 * heights -- not baked into the template ahead of time.
 *
 * Why this has to happen here, at render time, rather than once when the
 * template is authored: every exceljs read+write round-trip (isolate,
 * clear stale cells, this render) subtly perturbs column widths by a
 * fraction of a unit. A position computed during template authoring goes
 * stale by the time the template has been through a few more round-trips
 * -- baking the logo in early was the actual cause of it drifting
 * off-center. Computing it fresh against whatever the FINAL widths turn
 * out to be, right before the buffer is written, eliminates that drift
 * entirely.
 *
 * Uses a twoCellAnchor (tl + br) rather than a oneCellAnchor with an
 * explicit pixel size -- ties the image directly to the grid so the
 * receiving app (Excel/Numbers/Sheets) does its own column-width-to-pixel
 * conversion using its own real metrics, instead of this code guessing at
 * a font's max-digit-width in advance.
 */
export async function embedLogo(
  sheet: ExcelJS.Worksheet,
  { firstCol = 1, lastCol = 12, firstRow = 1, lastRow = 4 } = {}
): Promise<void> {
  const colWidthUnits: number[] = [];
  let totalWidthUnits = 0;
  for (let c = firstCol; c <= lastCol; c++) {
    const w = sheet.getColumn(c).width ?? 8.43;
    colWidthUnits.push(w);
    totalWidthUnits += w;
  }
  // Row heights are in points; width units aren't directly comparable to
  // points, but we only need the ASPECT-RATIO-implied width in the same
  // "width unit" terms as the columns to center it -- so convert points to
  // width units via the same ratio Excel itself uses between the two
  // (1 width unit ~= 7px, 1pt ~= 4/3 px -- see the point-to-unit factor
  // below), then let the twoCellAnchor math work in width-unit space
  // end to end rather than mixing pixel assumptions in from outside.
  const PX_PER_WIDTH_UNIT = 7;
  const PX_PER_POINT = 4 / 3;
  let totalHeightPx = 0;
  const rowHeightsPx: number[] = [];
  for (let r = firstRow; r <= lastRow; r++) {
    const h = (sheet.getRow(r).height ?? 15) * PX_PER_POINT;
    rowHeightsPx.push(h);
    totalHeightPx += h;
  }
  const targetHeightPx = Math.min(totalHeightPx * 0.85, totalHeightPx - 12);
  const targetWidthPx = targetHeightPx * LOGO_ASPECT;
  const targetWidthUnits = targetWidthPx / PX_PER_WIDTH_UNIT;

  const leftMarginUnits = (totalWidthUnits - targetWidthUnits) / 2;
  const topMarginPx = (totalHeightPx - targetHeightPx) / 2;

  function unitOffsetToAnchor(offsetUnits: number, sizesUnits: number[], startIndex: number) {
    let remaining = offsetUnits;
    let idx = startIndex;
    for (const size of sizesUnits) {
      if (remaining < size) return { col: idx, frac: Math.max(0, remaining / size) };
      remaining -= size;
      idx++;
    }
    return { col: idx, frac: 0 };
  }
  function pxOffsetToRowAnchor(offsetPx: number, sizesPx: number[], startIndex: number) {
    let remaining = offsetPx;
    let idx = startIndex;
    for (const size of sizesPx) {
      if (remaining < size) return { row: idx, frac: Math.max(0, remaining / size) };
      remaining -= size;
      idx++;
    }
    return { row: idx, frac: 0 };
  }

  const left = unitOffsetToAnchor(leftMarginUnits, colWidthUnits, firstCol - 1);
  const right = unitOffsetToAnchor(leftMarginUnits + targetWidthUnits, colWidthUnits, firstCol - 1);
  const top = pxOffsetToRowAnchor(topMarginPx, rowHeightsPx, firstRow - 1);
  const bottom = pxOffsetToRowAnchor(topMarginPx + targetHeightPx, rowHeightsPx, firstRow - 1);

  const workbook = sheet.workbook;
  const imageId = workbook.addImage({
    buffer: Buffer.from(await readFile(LOGO_PATH)) as never,
    extension: "png",
  });

  // exceljs's TS types model ImageRange as requiring a full pre-resolved
  // Anchor (nativeCol/nativeColOff/...), but the runtime (see
  // lib/xlsx/xform/drawing/drawing-xform.js: `range.br ? twoCellAnchor :
  // oneCellAnchor`, and lib/doc/anchor.js's `col`/`row` setters) happily
  // accepts plain {col, row} fractional objects for both tl and br and
  // resolves them itself using the sheet's actual column widths / row
  // heights at write time -- confirmed by reading the source, not
  // documented in the .d.ts. Cast through unknown for that gap.
  sheet.addImage(imageId, {
    tl: { col: left.col + left.frac, row: top.row + top.frac },
    br: { col: right.col + right.frac, row: bottom.row + bottom.frac },
    editAs: "oneCell",
  } as unknown as ExcelJS.ImageRange);
}

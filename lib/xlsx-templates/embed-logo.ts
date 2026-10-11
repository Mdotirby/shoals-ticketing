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
  /**
   * Position the logo in EMU, not in fractional columns.
   *
   * exceljs will accept a fractional `col` and convert it, but its Anchor
   * does so with `colWidth = width * 10000` EMU per column (lib/doc/anchor.js).
   * A width unit is about 7px and a pixel is 9,525 EMU, so a width unit is
   * nearer 66,675 EMU — the conversion is out by a factor of about 6.7, and
   * it compresses the offset INSIDE a column to roughly a seventh of where it
   * should be. Asking for 80.6% into column D wrote 12% into column D, which
   * put the logo 34px left of centre on a 1068px sheet and shrank its box
   * from the 274px intended to 328px.
   *
   * So the native anchor is computed here and handed over resolved. Column
   * pixel widths use Excel's own formula rather than width * 7: the two are
   * close but not equal, and "close" is what put the thing off centre.
   */
  const EMU_PER_PX = 9525;
  const MDW = 7; // max digit width of the default font, in pixels

  /** Excel's documented character-width to pixel conversion. */
  const colPx = (width: number) => Math.trunc(((256 * width + Math.trunc(128 / MDW)) / 256) * MDW);

  const colWidthsPx: number[] = [];
  let totalWidthPx = 0;
  for (let c = firstCol; c <= lastCol; c++) {
    const px = colPx(sheet.getColumn(c).width ?? 8.43);
    colWidthsPx.push(px);
    totalWidthPx += px;
  }

  const PX_PER_POINT = 4 / 3;
  const rowHeightsPx: number[] = [];
  let totalHeightPx = 0;
  for (let r = firstRow; r <= lastRow; r++) {
    const px = (sheet.getRow(r).height ?? 15) * PX_PER_POINT;
    rowHeightsPx.push(px);
    totalHeightPx += px;
  }

  // Leave the banner some air, and never let the mark touch its edges.
  const targetHeightPx = Math.min(totalHeightPx * 0.85, totalHeightPx - 12);
  const targetWidthPx = targetHeightPx * LOGO_ASPECT;

  const leftPx = (totalWidthPx - targetWidthPx) / 2;
  const topPx = (totalHeightPx - targetHeightPx) / 2;

  /** A pixel offset across the band to the cell it lands in, plus EMU into it. */
  function anchorAcross(offsetPx: number, sizesPx: number[], startIndex: number) {
    let remaining = offsetPx;
    let idx = startIndex;
    for (const size of sizesPx) {
      if (remaining < size) {
        return { native: idx, off: Math.round(Math.max(0, remaining) * EMU_PER_PX) };
      }
      remaining -= size;
      idx++;
    }
    // Past the last column: pin to its right edge rather than running off.
    return { native: idx - 1, off: Math.round(sizesPx[sizesPx.length - 1] * EMU_PER_PX) };
  }

  const l = anchorAcross(leftPx, colWidthsPx, firstCol - 1);
  const r = anchorAcross(leftPx + targetWidthPx, colWidthsPx, firstCol - 1);
  const t = anchorAcross(topPx, rowHeightsPx, firstRow - 1);
  const b = anchorAcross(topPx + targetHeightPx, rowHeightsPx, firstRow - 1);

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
  // Resolved anchors, so exceljs's own col/row setters never run and cannot
  // re-apply the conversion above.
  sheet.addImage(imageId, {
    tl: { nativeCol: l.native, nativeColOff: l.off, nativeRow: t.native, nativeRowOff: t.off },
    br: { nativeCol: r.native, nativeColOff: r.off, nativeRow: b.native, nativeRowOff: b.off },
    editAs: "oneCell",
  } as unknown as ExcelJS.ImageRange);
}

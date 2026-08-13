import JSZip from "jszip";

// Matt's source design (VENUECORE XCL TEMPLATES/Offer:Settlement
// templates.xlsx) overrides the classic 56-color Excel indexed palette
// with its own custom colors -- e.g. index 10 is a specific gray (used for
// the ticket-table column headers), NOT the standard palette's pure red.
// exceljs silently drops this <colors><indexedColors>...</indexedColors>
// override on every read+write round-trip (confirmed: even reading the
// original file and writing it straight back out with zero edits loses
// it) -- every "indexed color" reference in the workbook then falls back
// to the STANDARD default palette instead of Matt's colors, which is
// exactly why the ticket-audit headers rendered red instead of gray, and
// several "totals" cells rendered as bold blue boxes instead of light
// gray shading.
//
// This patches the custom palette back into a workbook buffer's
// xl/styles.xml after exceljs has finished writing it, restoring the
// original design's actual colors. Call this on every renderXlsxTemplate()
// output -- it's the one place all three document types' generated files
// pass through.
const INDEXED_COLORS_XML =
  '<colors><indexedColors><rgbColor rgb="ff000000"/><rgbColor rgb="ffffffff"/><rgbColor rgb="ffff0000"/><rgbColor rgb="ff00ff00"/><rgbColor rgb="ff0000ff"/><rgbColor rgb="ffffff00"/><rgbColor rgb="ffff00ff"/><rgbColor rgb="ff00ffff"/><rgbColor rgb="ff000000"/><rgbColor rgb="fffefffe"/><rgbColor rgb="ff919191"/><rgbColor rgb="ffa5a5a5"/><rgbColor rgb="ffd5d5d5"/><rgbColor rgb="ff6d6d6d"/><rgbColor rgb="97b41700"/><rgbColor rgb="ffe32400"/></indexedColors></colors>';

export async function fixIndexedColors(xlsxBuffer: Buffer): Promise<Buffer> {
  const zip = await JSZip.loadAsync(xlsxBuffer);
  const stylesPath = "xl/styles.xml";
  const stylesFile = zip.file(stylesPath);
  if (!stylesFile) return xlsxBuffer; // unexpected shape -- don't touch it

  let xml = await stylesFile.async("string");
  if (xml.includes("<colors>")) return xlsxBuffer; // already has one, nothing to do

  // Per the OOXML schema, <colors> is a child of <styleSheet> and must sit
  // after <tableStyles> and before <extLst> (or before </styleSheet> if
  // there's no extLst).
  if (xml.includes("</tableStyles>")) {
    xml = xml.replace("</tableStyles>", `</tableStyles>${INDEXED_COLORS_XML}`);
  } else if (xml.includes("/>", xml.indexOf("<tableStyles"))) {
    // self-closing <tableStyles .../> (the common case -- Matt's file has
    // no custom table styles defined)
    const start = xml.indexOf("<tableStyles");
    const end = xml.indexOf("/>", start) + 2;
    xml = xml.slice(0, end) + INDEXED_COLORS_XML + xml.slice(end);
  } else if (xml.includes("<extLst>")) {
    xml = xml.replace("<extLst>", `${INDEXED_COLORS_XML}<extLst>`);
  } else {
    xml = xml.replace("</styleSheet>", `${INDEXED_COLORS_XML}</styleSheet>`);
  }

  zip.file(stylesPath, xml);
  const patched = await zip.generateAsync({ type: "nodebuffer" });
  return patched;
}

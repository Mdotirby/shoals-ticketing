#!/usr/bin/env node
/**
 * verify.js — pixel-diffs a generated PDF against its source (or against
 * another reference PDF) and reports a percent-difference score, broken
 * down by region so a mismatch says *where* it drifted, not just that it
 * failed.
 *
 * Usage:
 *   node verify.js <original.pdf> <candidate.pdf> [--dpi 150] [--tolerance 1]
 *
 * Rasterizes both PDFs page-by-page via rasterize.py (PyMuPDF — no poppler
 * dependency), diffs each page with pixelmatch, and writes a *-diff.png per
 * page next to the candidate for visual inspection.
 *
 * Exits 0 if every page is within tolerance, 1 otherwise.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { PNG } = require('pngjs');
const pixelmatch = require('pixelmatch');

const ROOT = path.resolve(__dirname, '..');
const PYTHON = path.join(ROOT, '.venv', 'bin', 'python3');
const RASTERIZE = path.join(__dirname, 'rasterize.py');

const GRID = 4; // NxN region grid for drift reporting

function parseArgs(argv) {
  const args = { dpi: 150, tolerance: 1.0, _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dpi') args.dpi = parseInt(argv[++i], 10);
    else if (a === '--tolerance') args.tolerance = parseFloat(argv[++i]);
    else args._.push(a);
  }
  return args;
}

function rasterize(pdfPath, prefix, dpi) {
  const out = execFileSync(PYTHON, [RASTERIZE, pdfPath, prefix, '--dpi', String(dpi)], {
    encoding: 'utf8',
  });
  return out.trim().split('\n').filter(Boolean);
}

function loadPng(p) {
  return PNG.sync.read(fs.readFileSync(p));
}

function regionLabel(col, row, cols, rows) {
  const colNames = cols === 1 ? [''] : ['left', ...Array(Math.max(0, cols - 2)).fill('center'), 'right'];
  const rowNames = rows === 1 ? [''] : ['top', ...Array(Math.max(0, rows - 2)).fill('middle'), 'bottom'];
  const label = [rowNames[row], colNames[col]].filter(Boolean).join('-');
  return label || 'page';
}

function diffPage(originalPngPath, candidatePngPath, diffOutPath) {
  const a = loadPng(originalPngPath);
  const b = loadPng(candidatePngPath);

  const width = Math.min(a.width, b.width);
  const height = Math.min(a.height, b.height);
  const dimMismatch = a.width !== b.width || a.height !== b.height;

  const diff = new PNG({ width, height });
  const diffPixelCount = pixelmatch(
    cropBuffer(a, width, height),
    cropBuffer(b, width, height),
    diff.data,
    width,
    height,
    { threshold: 0.1 }
  );
  fs.writeFileSync(diffOutPath, PNG.sync.write(diff));

  const totalPixels = width * height;
  const percentDiff = (diffPixelCount / totalPixels) * 100;

  // Region breakdown: count diff pixels per grid cell by re-scanning diff.data alpha/color.
  const cellW = Math.ceil(width / GRID);
  const cellH = Math.ceil(height / GRID);
  const cellCounts = Array.from({ length: GRID }, () => Array(GRID).fill(0));
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      // pixelmatch writes bright red-ish/yellow for diffs, but the reliable way
      // is to also compute a manual per-pixel diff against threshold here.
      const ai = idx;
      const ra = a.data[ai], ga = a.data[ai + 1], ba = a.data[ai + 2];
      const rb = b.data[ai], gb = b.data[ai + 1], bb = b.data[ai + 2];
      const delta = Math.abs(ra - rb) + Math.abs(ga - gb) + Math.abs(ba - bb);
      if (delta > 30) {
        const col = Math.min(GRID - 1, Math.floor(x / cellW));
        const row = Math.min(GRID - 1, Math.floor(y / cellH));
        cellCounts[row][col]++;
      }
    }
  }
  const regions = [];
  for (let row = 0; row < GRID; row++) {
    for (let col = 0; col < GRID; col++) {
      const cellPixels = cellW * cellH;
      const pct = (cellCounts[row][col] / cellPixels) * 100;
      if (pct > 0.5) {
        regions.push({ region: regionLabel(col, row, GRID, GRID), percentDiff: round2(pct) });
      }
    }
  }
  regions.sort((x, y) => y.percentDiff - x.percentDiff);

  return { percentDiff: round2(percentDiff), dimMismatch, aSize: [a.width, a.height], bSize: [b.width, b.height], regions, diffOutPath };
}

function cropBuffer(png, width, height) {
  if (png.width === width && png.height === height) return png.data;
  const out = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    png.data.copy(out, y * width * 4, y * png.width * 4, y * png.width * 4 + width * 4);
  }
  return out;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

async function verify(originalPdf, candidatePdf, { dpi = 150, tolerance = 1.0 } = {}) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'doc-verify-'));
  const origPrefix = path.join(tmpDir, 'orig');
  const candPrefix = path.join(tmpDir, 'cand');

  const origPages = rasterize(originalPdf, origPrefix, dpi);
  const candPages = rasterize(candidatePdf, candPrefix, dpi);

  const pageCountMismatch = origPages.length !== candPages.length;
  const pageResults = [];
  const pageCount = Math.min(origPages.length, candPages.length);

  const diffDir = path.dirname(candidatePdf);
  const candBase = path.basename(candidatePdf, path.extname(candidatePdf));

  for (let i = 0; i < pageCount; i++) {
    const diffOutPath = path.join(diffDir, `${candBase}-diff-page${i + 1}.png`);
    const result = diffPage(origPages[i], candPages[i], diffOutPath);
    pageResults.push({ page: i + 1, ...result });
  }

  fs.rmSync(tmpDir, { recursive: true, force: true });

  const maxDiff = pageResults.length ? Math.max(...pageResults.map((p) => p.percentDiff)) : 100;
  const pass = !pageCountMismatch && maxDiff <= tolerance;

  return {
    pass,
    tolerance,
    dpi,
    pageCountMismatch,
    origPageCount: origPages.length,
    candPageCount: candPages.length,
    maxPercentDiff: maxDiff,
    pages: pageResults,
  };
}

function printReport(result) {
  console.log(`\nVerify: ${result.pass ? 'PASS' : 'MISMATCH'} (tolerance ${result.tolerance}%, dpi ${result.dpi})`);
  if (result.pageCountMismatch) {
    console.log(`  ! page count differs: original=${result.origPageCount} candidate=${result.candPageCount}`);
  }
  for (const p of result.pages) {
    const flag = p.percentDiff > result.tolerance ? '!!' : '  ';
    console.log(`${flag} page ${p.page}: ${p.percentDiff}% diff` + (p.dimMismatch ? ` (size mismatch: ${p.aSize.join('x')} vs ${p.bSize.join('x')})` : ''));
    if (p.regions.length) {
      for (const r of p.regions.slice(0, 5)) {
        console.log(`       drift in ${r.region}: ${r.percentDiff}%`);
      }
    }
    console.log(`       diff image: ${path.relative(ROOT, p.diffOutPath)}`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args._.length < 2) {
    console.error('Usage: node verify.js <original.pdf> <candidate.pdf> [--dpi 150] [--tolerance 1]');
    process.exit(1);
  }
  const [originalPdf, candidatePdf] = args._;
  const result = await verify(originalPdf, candidatePdf, { dpi: args.dpi, tolerance: args.tolerance });
  printReport(result);
  process.exit(result.pass ? 0 : 1);
}

if (require.main === module) {
  main();
}

module.exports = { verify };

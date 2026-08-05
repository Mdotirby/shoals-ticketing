#!/usr/bin/env node
/**
 * generate.js — fills a finalized template with new data, renders a pixel-perfect PDF.
 *
 * Usage:
 *   node generate.js <type-slug> <data.json> [output.pdf]
 *
 * <data.json> is a flat object of field_name -> value, keyed to the
 * "field_name" values in templates/<type-slug>/manifest.json. Image fields
 * take a file path (absolute, or relative to the repo root) or a data: URI.
 *
 * Repeating sections (manifest.repeating_sections): a data_path in data.json
 * holding an array drives N rows of a table (e.g. ticket_audit, or an
 * expense list). generate.js never computes the row values itself — every
 * number must already be present in the array items, pre-computed by
 * whatever adapter built data.json (e.g. from a real Settlement object).
 * Row 0 reuses the template's own example row; rows 1..N-1 are cloned from
 * it (same font/size/color/x — only y changes). Everything below a section
 * whose row count differs from the template's single example row is shifted
 * to close/open the resulting gap, cascading through any later sections.
 */
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

const ROOT = path.resolve(__dirname, '..');

function formatValue(value, type) {
  if (value === null || value === undefined || value === '') return '';
  switch (type) {
    case 'currency': {
      const n = typeof value === 'number' ? value : parseFloat(String(value).replace(/[^0-9.-]/g, ''));
      if (Number.isNaN(n)) return String(value);
      const negative = n < 0;
      const abs = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      return negative ? `($${abs})` : `$${abs}`;
    }
    case 'currency_paren': {
      // Always parenthesized regardless of sign -- matches lib/pdf/settlement-pdf.ts's
      // hardcoded `(${fmt(x)})` deduction-line convention (parens mean "this is a
      // deduction", not "this number happens to be negative").
      const n = typeof value === 'number' ? value : parseFloat(String(value).replace(/[^0-9.-]/g, ''));
      if (Number.isNaN(n)) return String(value);
      const abs = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      return `($${abs})`;
    }
    case 'number': {
      const n = typeof value === 'number' ? value : parseFloat(String(value).replace(/[^0-9.-]/g, ''));
      return Number.isNaN(n) ? String(value) : n.toLocaleString('en-US');
    }
    case 'image': {
      const str = String(value);
      if (str.startsWith('data:')) return str;
      const abs = path.isAbsolute(str) ? str : path.join(ROOT, str);
      return 'file://' + abs;
    }
    default:
      return String(value);
  }
}

function escapeHtmlAttrSafe(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Builds the reflow plan: final y-position for every existing field, plus
 * descriptors for newly-needed cloned rows. Pure data -- no DOM here. */
function buildReflowPlan(manifest, data) {
  const sections = (manifest.repeating_sections || []).map((s) => {
    const anchorField = manifest.fields.find((f) => f.run_id === s.anchor_run_id);
    const arr = Array.isArray(data[s.data_path]) ? data[s.data_path] : [];
    const count = arr.length;
    // Elements below this section are positioned assuming example_row_count
    // rows of space (however many the source design actually drew) -- not
    // "1 row", even though template.html only has 1 row physically baked in
    // as the row-0 stencil (the rest were duplicates of the same design).
    const delta = (count - s.example_row_count) * s.row_height_px;
    return { ...s, anchor_y: anchorField.position.y_px, count, delta, arr };
  }).sort((a, b) => a.anchor_y - b.anchor_y);

  // Label and value baselines on the "same" visual row can differ by a few
  // px (per-glyph baseline variance from the source design) -- a strict
  // "is this field's y below the anchor" check can catch one sibling but
  // miss the other if the anchor falls between their two baselines. A small
  // tolerance treats anything within ROW_TOLERANCE_PX of the anchor as part
  // of the same row (i.e. NOT below it, so unaffected by the section's own
  // delta -- consistent with row-0's exclusion), while still reliably
  // catching real downstream content, since real sections are separated by
  // much more than this.
  const ROW_TOLERANCE_PX = 6;
  const shiftFor = (y) =>
    sections.reduce((sum, s) => sum + (s.anchor_y < y + ROW_TOLERANCE_PX ? s.delta : 0), 0);
  // Explicitly exclude the section itself -- with a tolerance wide enough to
  // catch sibling-baseline variance, "s.anchor_y < section.anchor_y + tolerance"
  // would otherwise also be true for s === section (same anchor_y), wrongly
  // including a section's own delta in its own row-0 shift.
  const earlierShiftFor = (section) =>
    sections.reduce((sum, s) => sum + (s.id !== section.id && s.anchor_y < section.anchor_y + ROW_TOLERANCE_PX ? s.delta : 0), 0);

  // Row-0 stencil columns don't all share exactly the same y (a few px of
  // per-glyph baseline variance from the source PSD) -- a plain "is this
  // field's y below the section anchor" check would incorrectly catch a
  // row-0 sibling column and double-shift it into the newly cloned row.
  // Row-0 fields are only ever affected by EARLIER sections, never their own.
  const ownSectionByRunId = {};
  for (const s of sections) {
    for (const rf of s.row_fields) {
      if (rf.run_id) ownSectionByRunId[rf.run_id] = s;
    }
  }

  const finalPositions = {};
  for (const f of manifest.fields) {
    if (!f.position) continue;
    const ownSection = ownSectionByRunId[f.run_id];
    const shift = ownSection ? earlierShiftFor(ownSection) : shiftFor(f.position.y_px);
    if (shift !== 0) finalPositions[f.run_id] = f.position.y_px + shift;
  }

  const hideRunIds = [];
  const row0Updates = {};
  const newRows = [];
  for (const section of sections) {
    if (section.count === 0) {
      for (const rf of section.row_fields) {
        if (rf.run_id) hideRunIds.push(rf.run_id);
      }
      continue;
    }
    for (const rf of section.row_fields) {
      if (rf.run_id) row0Updates[rf.run_id] = formatValue(section.arr[0][rf.key], rf.type);
    }
    const base = earlierShiftFor(section);
    for (let i = 1; i < section.count; i++) {
      const item = section.arr[i];
      for (const rf of section.row_fields) {
        const styleSourceRunId = rf.run_id || section.row_fields.find((x) => x.run_id)?.run_id;
        const sourceField = manifest.fields.find((f) => f.run_id === rf.run_id) ||
          manifest.fields.find((f) => f.run_id === styleSourceRunId);
        newRows.push({
          sectionId: section.id,
          styleSourceRunId,
          x: sourceField.position.x_px,
          y: sourceField.position.y_px + i * section.row_height_px + base,
          text: formatValue(item[rf.key], rf.type),
        });
      }
    }
  }

  return { finalPositions, hideRunIds, row0Updates, newRows, sections };
}

/** Runs inside the page. Applies finalPositions, hides empty-section row-0
 * stencils, and clones+inserts rows 1..N-1. */
/* eslint-disable no-undef */
function applyReflowInBrowser(plan) {
  function setY(el, y) {
    if (el.tagName.toLowerCase() === 'text') el.setAttribute('y', String(y));
    else el.style.top = y + 'px';
  }

  for (const [runId, y] of Object.entries(plan.finalPositions)) {
    const el = document.querySelector(`[data-run-id="${runId}"]`);
    if (el) setY(el, y);
  }

  for (const runId of plan.hideRunIds) {
    const el = document.querySelector(`[data-run-id="${runId}"]`);
    if (el) el.style.display = 'none';
  }

  for (const [runId, text] of Object.entries(plan.row0Updates)) {
    const el = document.querySelector(`[data-run-id="${runId}"]`);
    if (el && el.tagName.toLowerCase() === 'text') el.textContent = text;
  }

  for (const row of plan.newRows) {
    const source = document.querySelector(`[data-run-id="${row.styleSourceRunId}"]`);
    if (!source) continue;
    const clone = source.cloneNode(true);
    clone.removeAttribute('data-run-id');
    setY(clone, row.y);
    if (clone.tagName.toLowerCase() === 'text') clone.textContent = row.text;
    source.parentNode.appendChild(clone);
  }
}
/* eslint-enable no-undef */

async function generate(typeSlug, data, outPath) {
  const templateDir = path.join(ROOT, 'templates', typeSlug);
  const templatePath = path.join(templateDir, 'template.html');
  const manifestPath = path.join(templateDir, 'manifest.json');

  if (!fs.existsSync(templatePath) || !fs.existsSync(manifestPath)) {
    throw new Error(`No template for '${typeSlug}'. Run extract.py + build_template.py first.`);
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (!manifest.finalized) {
    throw new Error(
      `Template '${typeSlug}' is not finalized. Confirm the field map, then run: ` +
      `python3 build_template.py finalize ${typeSlug}`
    );
  }

  // Row-0 repeat stencils are filled by the reflow pass (from data[section][0]),
  // not by flat placeholder substitution -- they have no {{...}} in the HTML.
  const scalarFields = manifest.fields.filter((f) => f.variable && !f.repeat_row0_of);
  const missing = scalarFields.filter((f) => !(f.field_name in data));
  if (missing.length) {
    console.warn('Warning: missing values for fields (left blank): ' + missing.map((f) => f.field_name).join(', '));
  }

  let htmlText = fs.readFileSync(templatePath, 'utf8');
  for (const field of scalarFields) {
    const formatted = escapeHtmlAttrSafe(formatValue(data[field.field_name], field.type));
    const placeholder = new RegExp(`\\{\\{${field.field_name}\\}\\}`, 'g');
    htmlText = htmlText.replace(placeholder, formatted);
  }

  fs.mkdirSync(path.dirname(outPath), { recursive: true });

  const browser = await puppeteer.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const tmpHtmlPath = path.join(templateDir, `__generated_${Date.now()}.html`);
    fs.writeFileSync(tmpHtmlPath, htmlText);
    try {
      await page.goto('file://' + tmpHtmlPath, { waitUntil: 'networkidle0' });
      await page.evaluate(() => document.fonts && document.fonts.ready);

      if (manifest.repeating_sections && manifest.repeating_sections.length) {
        const plan = buildReflowPlan(manifest, data);
        for (const s of plan.sections) {
          if (s.count !== 1) {
            console.log(`  reflow: ${s.id} has ${s.count} row(s) (template had 1) -> shifting content below by ${s.delta}px`);
          }
        }
        await page.evaluate(applyReflowInBrowser, plan);
      }

      // The reflow pass repositions content but the page's own height is
      // still whatever the template started with -- if enough repeating
      // rows got added that content now runs past the original bottom
      // edge, `.doc-page`'s `overflow: hidden` clips it (the footer logo
      // going half-invisible was exactly this, caught with real data that
      // had 14 expense lines + a deduction line vs. the template's
      // baked-in 12/0). Measure actual rendered content extent and grow
      // the page (both the DOM container and the PDF itself) to fit,
      // rather than trusting the static @page size.
      const pageDims = await page.evaluate(() => {
        const docPage = document.querySelector('.doc-page');
        const rect = docPage.getBoundingClientRect();
        let maxBottom = 0;
        // Only actual content -- text/img/shape leaves. The svg.text-layer
        // container carries explicit width/height attributes matching the
        // full ORIGINAL page size regardless of its content, so including
        // it (or any other container) in this scan makes maxBottom always
        // read as at least the original page height, triggering "growth"
        // on every render even when nothing actually overflows.
        docPage.querySelectorAll('text, img, .shape').forEach((el) => {
          const r = el.getBoundingClientRect();
          if (r.bottom > maxBottom) maxBottom = r.bottom;
        });
        return { width: rect.width, originalHeight: rect.height, contentBottom: maxBottom };
      });
      const BOTTOM_PADDING_PX = 25; // matches the original design's whitespace below the footer logo
      const finalHeight = Math.max(pageDims.originalHeight, pageDims.contentBottom + BOTTOM_PADDING_PX);
      if (finalHeight > pageDims.originalHeight) {
        console.log(`  page grew from ${pageDims.originalHeight}px to ${finalHeight}px to fit overflowing content`);
        await page.evaluate(
          (w, h) => {
            document.querySelector('.doc-page').style.height = h + 'px';
            // The @page rule's own size still governs Chrome's print
            // pagination independently of page.pdf()'s width/height params
            // -- content taller than @page's height gets split onto a
            // real second PDF page regardless of what's passed below, so
            // this has to be updated too, not just the DOM element.
            for (const sheet of document.styleSheets) {
              for (const rule of sheet.cssRules) {
                if (rule.type === CSSRule.PAGE_RULE) rule.style.setProperty('size', `${w}px ${h}px`);
              }
            }
          },
          pageDims.width,
          finalHeight
        );
      }

      // width/height as CSS px strings ("816px") alone were silently
      // ignored by Puppeteer -- inches (the unit all of Puppeteer's own
      // custom-page-size examples use) work reliably.
      const widthIn = pageDims.width / 96;
      const heightIn = finalHeight / 96;
      await page.pdf({
        path: outPath,
        printBackground: true,
        width: `${widthIn}in`,
        height: `${heightIn}in`,
        margin: { top: 0, right: 0, bottom: 0, left: 0 },
      });
    } finally {
      fs.unlinkSync(tmpHtmlPath);
    }
  } finally {
    await browser.close();
  }

  return outPath;
}

async function main() {
  const [, , typeSlug, dataPath, outArg] = process.argv;
  if (!typeSlug || !dataPath) {
    console.error('Usage: node generate.js <type-slug> <data.json> [output.pdf]');
    process.exit(1);
  }
  const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  const outPath = outArg
    ? path.resolve(outArg)
    : path.join(ROOT, 'output', `${typeSlug}-${Date.now()}.pdf`);

  const result = await generate(typeSlug, data, outPath);
  console.log(`Generated: ${result}`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err.message || err);
    process.exit(1);
  });
}

module.exports = { generate, formatValue, buildReflowPlan };

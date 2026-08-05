import fs from "fs";
import path from "path";

/**
 * Server-side port of doc-templates/scripts/generate.js (the CLI template
 * renderer used to author/verify templates offline). Same field
 * substitution + repeating-row reflow logic, adapted to:
 *   - render into an in-memory PDF Buffer instead of writing to disk
 *   - inline fonts/images as data: URIs instead of resolving relative
 *     `assets/...` paths via file:// (Vercel functions can't write into
 *     their own bundled directory, only /tmp, so co-locating a filled
 *     HTML file next to its assets folder isn't an option there)
 *   - launch Chromium conditionally: @sparticuz/chromium in production
 *     (Vercel-compatible slim binary), full `puppeteer` locally in dev
 *
 * Keep this in sync with generate.js if the reflow algorithm changes --
 * the two are meant to produce identical output, generate.js is just the
 * offline authoring/verification path (doc-templates/templates/<slug>/
 * manifest.json is built and pixel-diff-tested against real PDFs there
 * before its template.html + manifest.json get copied into
 * lib/pdf-templates/<slug>/ for this module to serve at runtime).
 */

type ManifestField = {
  run_id: string;
  field_name: string | null;
  type: string;
  variable: boolean;
  repeat_row0_of?: string;
  position?: { x_px: number; y_px: number; width_px: number; height_px: number };
};

type RepeatingRowField = { key: string; run_id: string | null; type: string };

type RepeatingSection = {
  id: string;
  data_path: string;
  anchor_run_id: string;
  row_height_px: number;
  row_fields: RepeatingRowField[];
  example_row_count: number;
};

type Manifest = {
  finalized: boolean;
  fields: ManifestField[];
  repeating_sections?: RepeatingSection[];
};

export type TemplateData = Record<string, unknown>;

export function formatValue(value: unknown, type: string): string {
  if (value === null || value === undefined || value === "") return "";
  switch (type) {
    case "currency": {
      const n = typeof value === "number" ? value : parseFloat(String(value).replace(/[^0-9.-]/g, ""));
      if (Number.isNaN(n)) return String(value);
      const negative = n < 0;
      const abs = Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      return negative ? `($${abs})` : `$${abs}`;
    }
    case "currency_paren": {
      const n = typeof value === "number" ? value : parseFloat(String(value).replace(/[^0-9.-]/g, ""));
      if (Number.isNaN(n)) return String(value);
      const abs = Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      return `($${abs})`;
    }
    case "number": {
      const n = typeof value === "number" ? value : parseFloat(String(value).replace(/[^0-9.-]/g, ""));
      return Number.isNaN(n) ? String(value) : n.toLocaleString("en-US");
    }
    default:
      return String(value);
  }
}

function escapeHtmlAttrSafe(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const MIME_BY_EXT: Record<string, string> = {
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
};

/** Replaces every `assets/...` reference in the template with an inlined
 * data: URI, so the rendered HTML is fully self-contained (no file://
 * resolution needed -- required since Vercel functions are read-only
 * outside /tmp). */
function inlineAssets(html: string, templateDir: string): string {
  return html.replace(/assets\/[\w./-]+\.\w+/g, (match) => {
    const ext = path.extname(match).toLowerCase();
    const mime = MIME_BY_EXT[ext];
    if (!mime) return match;
    const filePath = path.join(templateDir, match);
    const buf = fs.readFileSync(filePath);
    return `data:${mime};base64,${buf.toString("base64")}`;
  });
}

type ReflowSection = RepeatingSection & { anchor_y: number; count: number; delta: number; arr: TemplateData[] };

type ReflowPlan = {
  finalPositions: Record<string, number>;
  hideRunIds: string[];
  row0Updates: Record<string, string>;
  newRows: { sectionId: string; styleSourceRunId: string; x: number; y: number; text: string }[];
  sections: ReflowSection[];
};

const ROW_TOLERANCE_PX = 6;

function buildReflowPlan(manifest: Manifest, data: TemplateData): ReflowPlan {
  const sections: ReflowSection[] = (manifest.repeating_sections || [])
    .map((s) => {
      const anchorField = manifest.fields.find((f) => f.run_id === s.anchor_run_id);
      if (!anchorField?.position) throw new Error(`repeating_sections["${s.id}"].anchor_run_id not found in manifest fields`);
      const arr = Array.isArray(data[s.data_path]) ? (data[s.data_path] as TemplateData[]) : [];
      const count = arr.length;
      const delta = (count - s.example_row_count) * s.row_height_px;
      return { ...s, anchor_y: anchorField.position.y_px, count, delta, arr };
    })
    .sort((a, b) => a.anchor_y - b.anchor_y);

  const shiftFor = (y: number) =>
    sections.reduce((sum, s) => sum + (s.anchor_y < y + ROW_TOLERANCE_PX ? s.delta : 0), 0);
  const earlierShiftFor = (section: ReflowSection) =>
    sections.reduce(
      (sum, s) => sum + (s.id !== section.id && s.anchor_y < section.anchor_y + ROW_TOLERANCE_PX ? s.delta : 0),
      0
    );

  const ownSectionByRunId: Record<string, ReflowSection> = {};
  for (const s of sections) {
    for (const rf of s.row_fields) {
      if (rf.run_id) ownSectionByRunId[rf.run_id] = s;
    }
  }

  const finalPositions: Record<string, number> = {};
  for (const f of manifest.fields) {
    if (!f.position) continue;
    const ownSection = ownSectionByRunId[f.run_id];
    const shift = ownSection ? earlierShiftFor(ownSection) : shiftFor(f.position.y_px);
    if (shift !== 0) finalPositions[f.run_id] = f.position.y_px + shift;
  }

  const hideRunIds: string[] = [];
  const row0Updates: Record<string, string> = {};
  const newRows: ReflowPlan["newRows"] = [];

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
        if (!styleSourceRunId) continue;
        const sourceField = manifest.fields.find((f) => f.run_id === (rf.run_id || styleSourceRunId));
        if (!sourceField?.position) continue;
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

/** Runs inside the browser page via page.evaluate. Must be self-contained
 * (no closures over outer scope) -- Puppeteer serializes this function to
 * run in the page's own JS context. */
function applyReflowInBrowser(plan: ReflowPlan) {
  function setY(el: Element, y: number) {
    if (el.tagName.toLowerCase() === "text") el.setAttribute("y", String(y));
    else (el as HTMLElement).style.top = y + "px";
  }

  for (const [runId, y] of Object.entries(plan.finalPositions)) {
    const el = document.querySelector(`[data-run-id="${runId}"]`);
    if (el) setY(el, y);
  }

  for (const runId of plan.hideRunIds) {
    const el = document.querySelector(`[data-run-id="${runId}"]`) as HTMLElement | null;
    if (el) el.style.display = "none";
  }

  for (const [runId, text] of Object.entries(plan.row0Updates)) {
    const el = document.querySelector(`[data-run-id="${runId}"]`);
    if (el && el.tagName.toLowerCase() === "text") el.textContent = text;
  }

  for (const row of plan.newRows) {
    const source = document.querySelector(`[data-run-id="${row.styleSourceRunId}"]`);
    if (!source) continue;
    const clone = source.cloneNode(true) as Element;
    clone.removeAttribute("data-run-id");
    setY(clone, row.y);
    if (clone.tagName.toLowerCase() === "text") clone.textContent = row.text;
    source.parentNode?.appendChild(clone);
  }
}

async function launchBrowser() {
  if (process.env.VERCEL) {
    const chromium = (await import("@sparticuz/chromium")).default;
    const { launch } = await import("puppeteer-core");
    return launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: true,
    });
  }
  // Local dev: full `puppeteer` (devDependency) ships its own Chromium.
  const puppeteer = await import("puppeteer");
  return puppeteer.launch({ headless: true });
}

/** Renders templateDir's template.html + manifest.json, filled with `data`,
 * to a PDF buffer. templateDir must contain template.html, manifest.json,
 * and an assets/ folder (fonts/images referenced by the template). */
export async function renderTemplateToPdf(templateDir: string, data: TemplateData): Promise<Buffer> {
  const templatePath = path.join(templateDir, "template.html");
  const manifestPath = path.join(templateDir, "manifest.json");

  const manifest: Manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  if (!manifest.finalized) {
    throw new Error(`Template at ${templateDir} is not finalized.`);
  }

  const scalarFields = manifest.fields.filter((f) => f.variable && !f.repeat_row0_of);
  let htmlText = fs.readFileSync(templatePath, "utf8");
  for (const field of scalarFields) {
    if (!field.field_name) continue;
    const formatted = escapeHtmlAttrSafe(formatValue(data[field.field_name], field.type));
    const placeholder = new RegExp(`\\{\\{${field.field_name}\\}\\}`, "g");
    htmlText = htmlText.replace(placeholder, formatted);
  }

  htmlText = inlineAssets(htmlText, templateDir);

  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    // "load" (not "networkidle0" -- that's goto()-only) is sufficient here:
    // every font/image is already inlined as a data: URI above, so there's
    // no network activity to wait out.
    await page.setContent(htmlText, { waitUntil: "load" });
    await page.evaluate(() => document.fonts && document.fonts.ready);

    if (manifest.repeating_sections?.length) {
      const plan = buildReflowPlan(manifest, data);
      await page.evaluate(applyReflowInBrowser, plan);
    }

    const pdf = await page.pdf({
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}

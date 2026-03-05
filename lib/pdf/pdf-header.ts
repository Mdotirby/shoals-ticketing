/**
 * Shared PDF Header Utility for all VenueCore exports.
 * Provides consistent branding, venue-specific logos, and layout constants.
 */

// ── Color Constants (RGB tuples) ─────────────────────────────────────
export const GOLD: [number, number, number] = [208, 194, 144];
export const DARK: [number, number, number] = [11, 13, 29];
export const WHITE: [number, number, number] = [255, 255, 255];
export const LIGHT_TEXT: [number, number, number] = [180, 180, 180];
export const MID_GRAY: [number, number, number] = [204, 204, 204];
export const LIGHT_GRAY: [number, number, number] = [245, 245, 240];

// ── Hex color strings (for setFillColor(string) calls) ──────────────
export const GOLD_HEX = "#d0c290";
export const DARK_HEX = "#0b0d1d";
export const WHITE_HEX = "#ffffff";
export const MID_GRAY_HEX = "#cccccc";
export const LIGHT_GRAY_HEX = "#f5f5f0";

// ── Page Layout Constants ────────────────────────────────────────────
export const MARGIN = 14;
export const PAGE_WIDTH = 215.9;  // Letter
export const PAGE_HEIGHT = 279.4;
export const CONTENT_WIDTH = PAGE_WIDTH - (MARGIN * 2);
export const FOOTER_Y = PAGE_HEIGHT - 12;
export const LINE_H = 5;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Doc = any;

// ── Shared Helpers ───────────────────────────────────────────────────

/** Check if content fits on current page; if not, add a new page */
export function ensureSpace(doc: Doc, needed: number, y: number): number {
  if (y + needed > PAGE_HEIGHT - MARGIN - 10) {
    doc.addPage();
    return MARGIN + 5;
  }
  return y;
}

/** Format number as USD currency */
export function fmt(n: number | undefined): string {
  return (n ?? 0).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

/** Sanitize string for use in filenames */
export function sanitize(s: string): string {
  return (s ?? "").replace(/[^a-zA-Z0-9_\- ]/g, "").replace(/\s+/g, "_");
}

/** Convert 24hr time to 12hr format */
export function formatTime12hr(time: string): string {
  if (!time) return time;
  const match = time.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return time;
  let hours = parseInt(match[1]);
  const minutes = match[2];
  const ampm = hours >= 12 ? "PM" : "AM";
  if (hours === 0) hours = 12;
  else if (hours > 12) hours -= 12;
  return `${hours}:${minutes} ${ampm}`;
}

/** Wrap text to fit within maxWidth, returns array of lines */
export function wrapText(doc: Doc, text: string, maxWidth: number): string[] {
  return doc.splitTextToSize(text, maxWidth) as string[];
}

/** Draw wrapped paragraph, returns new y */
export function drawParagraph(doc: Doc, text: string, y: number, opts?: { fontSize?: number; bold?: boolean; indent?: number }): number {
  const fontSize = opts?.fontSize ?? 9;
  const indent = opts?.indent ?? 0;
  doc.setFont("helvetica", opts?.bold ? "bold" : "normal");
  doc.setFontSize(fontSize);
  doc.setTextColor(...DARK);

  const lines = wrapText(doc, text, CONTENT_WIDTH - indent);
  for (const line of lines) {
    y = ensureSpace(doc, LINE_H + 1, y);
    doc.text(line, MARGIN + indent, y);
    y += LINE_H;
  }
  return y;
}

/** Draw a section header bar (dark background, gold text) */
export function drawSectionHeader(doc: Doc, title: string, y: number): number {
  y = ensureSpace(doc, 14, y);
  doc.setFillColor(...DARK);
  doc.rect(MARGIN, y, CONTENT_WIDTH, 8, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...GOLD);
  doc.text(title.toUpperCase(), MARGIN + 3, y + 5.5);
  doc.setTextColor(...DARK);
  return y + 12;
}

/** Draw a compact section header bar (smaller for single-page layouts) */
export function drawCompactSectionHeader(doc: Doc, title: string, y: number, width?: number): number {
  const w = width ?? CONTENT_WIDTH;
  doc.setFillColor(...DARK);
  doc.rect(MARGIN, y, w, 6, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...GOLD);
  doc.text(title.toUpperCase(), MARGIN + 2, y + 4.2);
  doc.setTextColor(...DARK);
  return y + 8;
}

/** Draw label: value row with automatic text wrapping for long values */
export function drawLabelValue(doc: Doc, label: string, value: string, y: number): number {
  const labelX = MARGIN + 3;
  const valueX = MARGIN + 50;
  const maxValueW = CONTENT_WIDTH - 50 - 3; // available width for value text

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const lines: string[] = doc.splitTextToSize(value || "—", maxValueW);
  const totalH = Math.max(7, lines.length * LINE_H + 2);

  y = ensureSpace(doc, totalH, y);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...DARK);
  doc.text(`${label}:`, labelX, y + 4);
  doc.setFont("helvetica", "normal");
  for (let i = 0; i < lines.length; i++) {
    doc.text(lines[i], valueX, y + 4 + i * LINE_H);
  }
  return y + totalH;
}

/** Draw label: value row with custom positions. Long labels are truncated to avoid overlapping the right-aligned value. */
export function drawRow(doc: Doc, label: string, value: string, y: number, opts?: { bold?: boolean; indent?: number; highlight?: boolean }): number {
  y = ensureSpace(doc, 7, y);
  const indent = opts?.indent ?? 0;
  if (opts?.highlight) {
    doc.setFillColor(...GOLD);
    doc.rect(MARGIN, y - 1, CONTENT_WIDTH, 7, "F");
    doc.setTextColor(...DARK);
  }
  doc.setFont("helvetica", opts?.bold ? "bold" : "normal");
  doc.setFontSize(9);
  doc.setTextColor(...DARK);
  // Truncate label to avoid overlapping with value (leave ~50mm for value on right)
  const maxLabelW = CONTENT_WIDTH - indent - 55;
  const truncatedLabel: string = doc.splitTextToSize(label, maxLabelW)[0] || label;
  doc.text(truncatedLabel, MARGIN + 3 + indent, y + 4);
  doc.text(value, MARGIN + CONTENT_WIDTH - 3, y + 4, { align: "right" });
  return y + 7;
}

/** Draw a horizontal divider line */
export function drawDivider(doc: Doc, y: number): number {
  doc.setDrawColor(...MID_GRAY);
  doc.setLineWidth(0.3);
  doc.line(MARGIN, y, MARGIN + CONTENT_WIDTH, y);
  return y + 3;
}

/** Draw numbered clause (for contracts) */
export function drawClause(doc: Doc, num: number, title: string, body: string, y: number): number {
  y = ensureSpace(doc, 18, y);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...DARK);
  y = ensureSpace(doc, 8, y);
  doc.text(`§${num}  ${title.toUpperCase()}`, MARGIN + 3, y);
  y += 6;
  y = drawParagraph(doc, body, y, { fontSize: 9, indent: 3 });
  y += 3;
  return y;
}

/** Draw footer with page numbers on all pages */
export function drawFooter(doc: Doc, documentTitle?: string) {
  const pages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...MID_GRAY);
    const label = documentTitle ? `${documentTitle}  •  ` : "";
    doc.text(`${label}Generated by VenueCore  •  Page ${i} of ${pages}`, PAGE_WIDTH / 2, FOOTER_Y, { align: "center" });
    // Gold bottom accent line
    doc.setDrawColor(...GOLD);
    doc.setLineWidth(1);
    doc.line(0, PAGE_HEIGHT - 3, PAGE_WIDTH, PAGE_HEIGHT - 3);
  }
}

// ── Logo Loading ─────────────────────────────────────────────────────

/**
 * Load an image from a URL and return as a PNG data URL directly.
 * Uses fetch + Blob + FileReader — no canvas conversion.
 */
export async function loadLogoAsDataURL(url: string): Promise<{ dataUrl: string; width: number; height: number } | null> {
  try {
    const resp = await fetch(url, { mode: "cors" }).catch(() => null);
    if (!resp || !resp.ok) return null;

    const blob = await resp.blob();

    // Convert blob to data URL via FileReader
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error("FileReader failed"));
      reader.readAsDataURL(blob);
    });

    // Load into an Image to get natural dimensions for PDF layout
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Image load failed"));
      img.src = dataUrl;
      setTimeout(() => reject(new Error("Image load timeout")), 5000);
    });

    if (img.naturalWidth > 0) {
      return { dataUrl, width: img.naturalWidth, height: img.naturalHeight };
    }
  } catch {
    // Silently fall through to return null
  }
  return null;
}

/**
 * Try to load venue-specific logo, falling back to default VenueCore logo.
 * Accepts an optional direct logoUrl (e.g., from venue.logo_url) and a slug.
 * Tries: logoUrl -> /logos/{slug}/logo.png -> /logos/{slug lowercase}/logo.png -> /logos/default/logo.png
 */
export async function loadVenueLogo(venueSlug?: string, logoUrl?: string | null): Promise<{ dataUrl: string; width: number; height: number } | null> {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const logoUrls: string[] = [];

  // 1. Direct logo URL from venue record
  if (logoUrl) {
    const abs = logoUrl.startsWith("http") ? logoUrl : `${origin}${logoUrl.startsWith("/") ? "" : "/"}${logoUrl}`;
    logoUrls.push(abs);
  }

  // 2. Slug-based paths (try exact case, then lowercase)
  if (venueSlug) {
    logoUrls.push(`${origin}/logos/${venueSlug}/logo.png`);
    const lower = venueSlug.toLowerCase();
    if (lower !== venueSlug) {
      logoUrls.push(`${origin}/logos/${lower}/logo.png`);
    }
  }

  // 3. Default fallback
  logoUrls.push(`${origin}/logos/default/logo.png`);

  for (const url of logoUrls) {
    const result = await loadLogoAsDataURL(url);
    if (result) return result;
  }
  return null;
}

// ── Main Header Function ─────────────────────────────────────────────

export type PdfHeaderOptions = {
  title: string;           // e.g., "Artist Offer", "Ticket Audit", "Rental Contract"
  venueName: string;
  venueAddress?: string;
  venueSlug?: string;      // to load venue-specific logo
  logoUrl?: string | null;  // direct logo URL from venue record
  compact?: boolean;       // compact header for single-page layouts (offers)
  showTitle?: boolean;     // show title below header bar (default: true)
  showBuyerInfo?: boolean; // only true for offers/performance agreements
  buyerInfo?: {
    company?: string;      // promoter company name
    contact?: string;      // buyer/promoter contact name
    phone?: string;        // buyer phone
    email?: string;        // buyer email
    address?: string;      // buyer billing address
  };
};

/**
 * Shared PDF header for all VenueCore exports.
 * Draws: logo (left), venue name + address (right), gold bar, title, optional buyer info.
 * Returns the Y position where content should start.
 */
export async function addPdfHeader(doc: Doc, options: PdfHeaderOptions): Promise<number> {
  const {
    title,
    venueName,
    venueAddress,
    venueSlug,
    logoUrl,
    compact = false,
    showTitle = true,
    showBuyerInfo = false,
    buyerInfo,
  } = options;

  if (compact) {
    return addCompactPdfHeader(doc, options);
  }

  // Calculate header height based on content
  const headerHeight = showBuyerInfo && buyerInfo ? 58 : 42;

  // ── Dark header background ──
  doc.setFillColor(...DARK);
  doc.rect(0, 0, PAGE_WIDTH, headerHeight, "F");

  // ── Gold accent bar ──
  doc.setDrawColor(...GOLD);
  doc.setLineWidth(1.5);
  doc.line(0, headerHeight, PAGE_WIDTH, headerHeight);

  // ── Logo (left, small for file size) ──
  const logo = await loadVenueLogo(venueSlug, logoUrl);
  if (logo) {
    // Scale logo to fit max 20mm height in the header
    const maxLogoH = 20; // mm
    const maxLogoW = 40; // mm
    const pxPerMm = logo.height / maxLogoH;
    let logoW = logo.width / pxPerMm;
    let logoH = maxLogoH;
    if (logoW > maxLogoW) {
      logoH = logoH * (maxLogoW / logoW);
      logoW = maxLogoW;
    }
    const logoY = 4;
    doc.addImage(logo.dataUrl, "PNG", MARGIN, logoY, logoW, logoH);
  }

  // ── Venue name (right-aligned, large) ──
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(...GOLD);
  doc.text(venueName, PAGE_WIDTH - MARGIN, 14, { align: "right" });

  // ── Venue address (right-aligned, below name) ──
  if (venueAddress) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...WHITE);
    doc.text(venueAddress, PAGE_WIDTH - MARGIN, 20, { align: "right" });
  }

  // ── Date (right-aligned) ──
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...LIGHT_TEXT);
  const dateStr = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  doc.text(`Generated: ${dateStr}`, PAGE_WIDTH - MARGIN, venueAddress ? 26 : 20, { align: "right" });

  // ── Buyer/Promoter info block (positioned under logo, left-aligned) ──
  if (showBuyerInfo && buyerInfo) {
    let infoY = 28; // below logo area
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...WHITE);

    if (buyerInfo.company) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.text(buyerInfo.company, MARGIN, infoY);
      doc.setFont("helvetica", "normal");
      infoY += 4;
    }
    if (buyerInfo.contact) {
      doc.text(buyerInfo.contact, MARGIN, infoY);
      infoY += 4;
    }
    if (buyerInfo.address) {
      doc.text(buyerInfo.address, MARGIN, infoY);
      infoY += 4;
    }
    const contactParts: string[] = [];
    if (buyerInfo.phone) contactParts.push(buyerInfo.phone);
    if (buyerInfo.email) contactParts.push(buyerInfo.email);
    if (contactParts.length) {
      doc.text(contactParts.join("  |  "), MARGIN, infoY);
    }
  }

  // ── Document title (below gold bar) ──
  let y = headerHeight + 2;
  if (showTitle) {
    y = headerHeight + 6;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(...DARK);
    doc.text(title.toUpperCase(), MARGIN, y);
    y += 8;
  }

  return y;
}

/**
 * Compact header for single-page PDFs (offers).
 * LEFT side: Logo on top, then buyer company, contact, phone | email
 * RIGHT side: Venue name (large), venue address, generated date
 */
async function addCompactPdfHeader(doc: Doc, options: PdfHeaderOptions): Promise<number> {
  const {
    venueName,
    venueAddress,
    venueSlug,
    logoUrl,
    showBuyerInfo = false,
    buyerInfo,
  } = options;

  const headerHeight = 28;

  // ── Dark header background ──
  doc.setFillColor(...DARK);
  doc.rect(0, 0, PAGE_WIDTH, headerHeight, "F");

  // ── Gold accent bar ──
  doc.setDrawColor(...GOLD);
  doc.setLineWidth(1);
  doc.line(0, headerHeight, PAGE_WIDTH, headerHeight);

  // ── Logo (left, compact) ──
  const logo = await loadVenueLogo(venueSlug, logoUrl);
  let logoBottomY = 4;
  if (logo) {
    const maxLogoH = 12; // mm — compact
    const maxLogoW = 30; // mm
    const pxPerMm = logo.height / maxLogoH;
    let logoW = logo.width / pxPerMm;
    let logoH = maxLogoH;
    if (logoW > maxLogoW) {
      logoH = logoH * (maxLogoW / logoW);
      logoW = maxLogoW;
    }
    doc.addImage(logo.dataUrl, "PNG", MARGIN, 3, logoW, logoH);
    logoBottomY = 3 + logoH + 1;
  }

  // ── LEFT side: Buyer info (below logo) ──
  if (showBuyerInfo && buyerInfo) {
    let infoY = logoBottomY;
    doc.setFontSize(7);
    doc.setTextColor(...WHITE);

    if (buyerInfo.company) {
      doc.setFont("helvetica", "bold");
      doc.text(buyerInfo.company, MARGIN, infoY);
      doc.setFont("helvetica", "normal");
      infoY += 3.5;
    }
    if (buyerInfo.contact) {
      doc.text(buyerInfo.contact, MARGIN, infoY);
      infoY += 3.5;
    }
    if (buyerInfo.address) {
      doc.text(buyerInfo.address, MARGIN, infoY);
      infoY += 3.5;
    }
    const contactParts: string[] = [];
    if (buyerInfo.phone) contactParts.push(buyerInfo.phone);
    if (buyerInfo.email) contactParts.push(buyerInfo.email);
    if (contactParts.length) {
      doc.text(contactParts.join("  |  "), MARGIN, infoY);
    }
  }

  // ── RIGHT side: venue name (large) + address + date ──
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...GOLD);
  doc.text(venueName, PAGE_WIDTH - MARGIN, 10, { align: "right" });

  if (venueAddress) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...WHITE);
    doc.text(venueAddress, PAGE_WIDTH - MARGIN, 15, { align: "right" });
  }

  // Generated date
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(...LIGHT_TEXT);
  const dateStr = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  doc.text(`Generated: ${dateStr}`, PAGE_WIDTH - MARGIN, 20, { align: "right" });

  // No title below the header — saves vertical space
  return headerHeight + 2;
}

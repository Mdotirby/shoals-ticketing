/**
 * Ticket Audit PDF Generator — uses shared header utility.
 * Landscape A4, dark background with gold headers. NO customer data.
 */
import {
  loadVenueLogo,
  GOLD, DARK, WHITE, LIGHT_TEXT, MID_GRAY,
  type Doc,
} from "./pdf-header";

// ── Landscape A4 constants (override portrait defaults for this report) ──
const PAGE_W = 297;
const PAGE_H = 210;
const MARGIN = 12;
const CONTENT_W = PAGE_W - MARGIN * 2;

const LIGHT_ROW: [number, number, number] = [20, 23, 43];
const ALT_ROW: [number, number, number] = [26, 29, 53];

// Column widths (total ~273mm for landscape A4 minus margins)
const COL_WIDTHS = [50, 34, 22, 22, 22, 22, 28, 22, 22, 28];
const COL_LABELS = [
  "Tier Name",
  "Capacity",
  "Qty Sold",
  "% House",
  "Price",
  "Gross Sales",
  "Ticketing Fees",
  "Facility Fees",
  "Tax",
  "Total Revenue",
];

// ── Types ────────────────────────────────────────────────────────────
type TierRow = {
  tier_name: string;
  capacity: number;
  qty_sold: number;
  pct_house: number;
  price: number;
  gross_sales: number;
  ticketing_fees: number;
  facility_fees: number;
  tax_collected: number;
  total_revenue: number;
};

type EventBlock = {
  event_title: string;
  event_date: string;
  venue_name: string;
  tiers: TierRow[];
  subtotal: {
    capacity: number;
    qty_sold: number;
    pct_house: number;
    gross_sales: number;
    ticketing_fees: number;
    facility_fees: number;
    tax_collected: number;
    total_revenue: number;
  };
};

type AuditData = {
  events: EventBlock[];
  grand_total: {
    capacity: number;
    qty_sold: number;
    pct_house: number;
    gross_sales: number;
    ticketing_fees: number;
    facility_fees: number;
    tax_collected: number;
    total_revenue: number;
  };
  venue_name?: string;
  venue_address?: string;
  venue_slug?: string;
};

// ── Helpers ──────────────────────────────────────────────────────────
function fmt(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function pct(n: number): string {
  return `${n.toFixed(1)}%`;
}

function ensureSpaceLandscape(doc: Doc, needed: number, y: number): number {
  if (y + needed > PAGE_H - MARGIN) {
    doc.addPage();
    return MARGIN + 5;
  }
  return y;
}

function colX(colIndex: number): number {
  let x = MARGIN;
  for (let i = 0; i < colIndex; i++) {
    x += COL_WIDTHS[i];
  }
  return x;
}

// ── Main Export ──────────────────────────────────────────────────────
export async function generateTicketAuditPDF(data: AuditData): Promise<ArrayBuffer> {
  const { default: jsPDF } = await import("jspdf");

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4", compress: true });

  // ── Page 1: Header ─────────────────────────────────────────────
  // Custom header for landscape (can't use portrait addPdfHeader directly)
  drawLandscapeHeader(doc, "Ticket Audit Report", data.venue_name, data.venue_address, data.venue_slug);
  let y = 48;

  // ── Column headers ─────────────────────────────────────────────
  y = drawColumnHeaders(doc, y);

  // ── Event blocks ───────────────────────────────────────────────
  for (let ei = 0; ei < data.events.length; ei++) {
    const ev = data.events[ei];

    const neededHeight = 10 + ev.tiers.length * 6 + 8;
    y = ensureSpaceLandscape(doc, neededHeight, y);

    y = drawEventHeader(doc, ev, y);

    for (let ti = 0; ti < ev.tiers.length; ti++) {
      y = ensureSpaceLandscape(doc, 7, y);
      const tier = ev.tiers[ti];
      const isAlt = ti % 2 === 1;
      y = drawTierRow(doc, tier, y, isAlt);
    }

    y = ensureSpaceLandscape(doc, 8, y);
    y = drawSubtotalRow(doc, ev.subtotal, ev.event_title, y);

    y += 3;
  }

  // ── Grand Total ────────────────────────────────────────────────
  y = ensureSpaceLandscape(doc, 14, y);
  y = drawGrandTotal(doc, data.grand_total, y);

  // ── Footer on all pages ────────────────────────────────────────
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    drawLandscapeFooter(doc, p, totalPages);
  }

  return doc.output("arraybuffer");
}

// ── Drawing Functions ────────────────────────────────────────────────

async function drawLandscapeHeader(doc: Doc, title: string, venueName?: string, venueAddress?: string, venueSlug?: string) {
  // Dark header block
  doc.setFillColor(...DARK);
  doc.rect(0, 0, PAGE_W, 40, "F");

  // Gold accent line (draw instead of fill for smaller size)
  doc.setDrawColor(...GOLD);
  doc.setLineWidth(1.5);
  doc.line(0, 40, PAGE_W, 40);

  // Try to load venue logo
  try {
    const logo = await loadVenueLogo(venueSlug);
    if (logo) {
      const maxLogoH = 18;
      const maxLogoW = 36;
      const pxPerMm = logo.height / maxLogoH;
      let logoW = logo.width / pxPerMm;
      let logoH = maxLogoH;
      if (logoW > maxLogoW) {
        logoH = logoH * (maxLogoW / logoW);
        logoW = maxLogoW;
      }
      doc.addImage(logo.dataUrl, "JPEG", MARGIN, 4, logoW, logoH);
    }
  } catch { /* ignore logo errors */ }

  // Venue name (right-aligned)
  if (venueName) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(...GOLD);
    doc.text(venueName, PAGE_W - MARGIN, 14, { align: "right" });
  }
  if (venueAddress) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...WHITE);
    doc.text(venueAddress, PAGE_W - MARGIN, 20, { align: "right" });
  }

  // Title
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(...WHITE);
  doc.text(title, MARGIN, 30);

  // Date + confidential
  doc.setFontSize(8);
  doc.setTextColor(...LIGHT_TEXT);
  const dateStr = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  doc.text(`Generated: ${dateStr}`, MARGIN, 36);

  doc.setTextColor(...GOLD);
  doc.setFontSize(8);
  doc.text("Confidential — No Customer Data", PAGE_W - MARGIN, 36, { align: "right" });
}

function drawColumnHeaders(doc: Doc, y: number): number {
  doc.setFillColor(...DARK);
  doc.rect(MARGIN, y, CONTENT_W, 8, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(...GOLD);

  for (let i = 0; i < COL_LABELS.length; i++) {
    const x = colX(i) + 2;
    doc.text(COL_LABELS[i], x, y + 5.5);
  }

  return y + 10;
}

function drawEventHeader(doc: Doc, ev: EventBlock, y: number): number {
  doc.setFillColor(...GOLD);
  doc.rect(MARGIN, y, CONTENT_W, 7, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...DARK);

  const dateStr = ev.event_date
    ? new Date(ev.event_date).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "";

  doc.text(`${ev.event_title}`, MARGIN + 3, y + 5);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text(`${dateStr}  •  ${ev.venue_name ?? ""}`, PAGE_W - MARGIN - 3, y + 5, { align: "right" });

  return y + 9;
}

function drawTierRow(doc: Doc, tier: TierRow, y: number, alt: boolean): number {
  doc.setFillColor(...(alt ? ALT_ROW : LIGHT_ROW));
  doc.rect(MARGIN, y, CONTENT_W, 6, "F");

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(...WHITE);

  // Truncate tier name to fit within its column width
  const tierNameMaxW = COL_WIDTHS[0] - 4;
  const truncTierName: string = doc.splitTextToSize(tier.tier_name, tierNameMaxW)[0] || tier.tier_name;

  const values = [
    truncTierName,
    String(tier.capacity),
    String(tier.qty_sold),
    pct(tier.pct_house),
    fmt(tier.price),
    fmt(tier.gross_sales),
    fmt(tier.ticketing_fees),
    fmt(tier.facility_fees),
    fmt(tier.tax_collected),
    fmt(tier.total_revenue),
  ];

  for (let i = 0; i < values.length; i++) {
    const x = colX(i) + 2;
    doc.text(values[i], x, y + 4.2);
  }

  return y + 6;
}

function drawSubtotalRow(
  doc: Doc,
  sub: EventBlock["subtotal"],
  eventTitle: string,
  y: number
): number {
  doc.setFillColor(30, 33, 58);
  doc.rect(MARGIN, y, CONTENT_W, 7, "F");

  // Gold left border (line instead of filled rect)
  doc.setDrawColor(...GOLD);
  doc.setLineWidth(2);
  doc.line(MARGIN, y, MARGIN, y + 7);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(...GOLD);

  // Truncate subtotal label to fit within first column
  const subtitleMaxW = COL_WIDTHS[0] - 4;
  const truncSubtitle: string = doc.splitTextToSize(`${eventTitle} — SUBTOTAL`, subtitleMaxW)[0] || `${eventTitle} — SUBTOTAL`;

  const values = [
    truncSubtitle,
    String(sub.capacity),
    String(sub.qty_sold),
    pct(sub.pct_house),
    "",
    fmt(sub.gross_sales),
    fmt(sub.ticketing_fees),
    fmt(sub.facility_fees),
    fmt(sub.tax_collected),
    fmt(sub.total_revenue),
  ];

  for (let i = 0; i < values.length; i++) {
    const x = colX(i) + 2;
    doc.text(values[i], x, y + 4.8);
  }

  return y + 8;
}

function drawGrandTotal(doc: Doc, gt: AuditData["grand_total"], y: number): number {
  // Gold line
  doc.setDrawColor(...GOLD);
  doc.setLineWidth(1);
  doc.line(MARGIN, y, MARGIN + CONTENT_W, y);
  y += 2;

  // Dark background
  doc.setFillColor(...DARK);
  doc.rect(MARGIN, y, CONTENT_W, 9, "F");

  // Gold border
  doc.setDrawColor(...GOLD);
  doc.setLineWidth(0.5);
  doc.rect(MARGIN, y, CONTENT_W, 9, "S");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(...GOLD);

  const values = [
    "GRAND TOTAL",
    String(gt.capacity),
    String(gt.qty_sold),
    pct(gt.pct_house),
    "",
    fmt(gt.gross_sales),
    fmt(gt.ticketing_fees),
    fmt(gt.facility_fees),
    fmt(gt.tax_collected),
    fmt(gt.total_revenue),
  ];

  for (let i = 0; i < values.length; i++) {
    const x = colX(i) + 2;
    doc.text(values[i], x, y + 6.2);
  }

  return y + 12;
}

function drawLandscapeFooter(doc: Doc, page: number, total: number) {
  const y = PAGE_H - 8;

  doc.setDrawColor(...GOLD);
  doc.setLineWidth(0.5);
  doc.line(0, y - 2, PAGE_W, y - 2);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(...MID_GRAY);
  doc.text("VenueCore Ticket Audit — Confidential", MARGIN, y + 3);
  doc.text(`Page ${page} of ${total}`, PAGE_W - MARGIN, y + 3, { align: "right" });
}

/**
 * Ticket Audit PDF Generator
 * Dark background (#0b0d1d) with gold (#d0c290) headers.
 * NO customer data anywhere.
 */

// ── Brand constants ──────────────────────────────────────────────────
const GOLD = "#d0c290";
const DARK = "#0b0d1d";
const WHITE = "#ffffff";
const LIGHT_ROW = "#14172b";
const ALT_ROW = "#1a1d35";
const PAGE_W = 297; // A4 landscape width mm
const PAGE_H = 210; // A4 landscape height mm
const MARGIN = 12;
const CONTENT_W = PAGE_W - MARGIN * 2;

// Column widths (total ~273mm for landscape A4 minus margins)
const COL_WIDTHS = [50, 34, 22, 22, 22, 22, 28, 22, 22, 22, 28];
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
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Doc = any;

// ── Helpers ──────────────────────────────────────────────────────────
function fmt(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function pct(n: number): string {
  return `${n.toFixed(1)}%`;
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.substring(0, 2), 16),
    parseInt(h.substring(2, 4), 16),
    parseInt(h.substring(4, 6), 16),
  ];
}

function ensureSpace(doc: Doc, needed: number, y: number): number {
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

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

  // ── Page 1: Header ─────────────────────────────────────────────
  drawPageHeader(doc, "Ticket Audit Report");
  let y = 48;

  // ── Column headers ─────────────────────────────────────────────
  y = drawColumnHeaders(doc, y);

  // ── Event blocks ───────────────────────────────────────────────
  for (let ei = 0; ei < data.events.length; ei++) {
    const ev = data.events[ei];

    // Check if we need a new page for this event
    const neededHeight = 10 + ev.tiers.length * 6 + 8;
    y = ensureSpace(doc, neededHeight, y);

    // Event title row (gold bg)
    y = drawEventHeader(doc, ev, y);

    // Tier rows
    for (let ti = 0; ti < ev.tiers.length; ti++) {
      y = ensureSpace(doc, 7, y);
      const tier = ev.tiers[ti];
      const isAlt = ti % 2 === 1;
      y = drawTierRow(doc, tier, y, isAlt);
    }

    // Subtotal row
    y = ensureSpace(doc, 8, y);
    y = drawSubtotalRow(doc, ev.subtotal, ev.event_title, y);

    // Spacing between events
    y += 3;
  }

  // ── Grand Total ────────────────────────────────────────────────
  y = ensureSpace(doc, 14, y);
  y = drawGrandTotal(doc, data.grand_total, y);

  // ── Footer on all pages ────────────────────────────────────────
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    drawFooter(doc, p, totalPages);
  }

  return doc.output("arraybuffer");
}

// ── Drawing Functions ────────────────────────────────────────────────

function drawPageHeader(doc: Doc, title: string) {
  // Full dark background
  doc.setFillColor(...hexToRgb(DARK));
  doc.rect(0, 0, PAGE_W, 40, "F");

  // Gold accent line
  doc.setFillColor(...hexToRgb(GOLD));
  doc.rect(0, 40, PAGE_W, 1.5, "F");

  // VenueCore branding
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(...hexToRgb(GOLD));
  doc.text("VENUECORE", MARGIN, 16);

  // Title
  doc.setFont("helvetica", "normal");
  doc.setFontSize(12);
  doc.setTextColor(...hexToRgb(WHITE));
  doc.text(title, MARGIN, 26);

  // Date
  doc.setFontSize(9);
  doc.setTextColor(180, 180, 180);
  const dateStr = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  doc.text(`Generated: ${dateStr}`, MARGIN, 34);

  // Right-aligned subtitle
  doc.setTextColor(...hexToRgb(GOLD));
  doc.setFontSize(9);
  doc.text("Confidential — No Customer Data", PAGE_W - MARGIN, 34, { align: "right" });
}

function drawColumnHeaders(doc: Doc, y: number): number {
  // Header background
  doc.setFillColor(...hexToRgb(DARK));
  doc.rect(MARGIN, y, CONTENT_W, 8, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(...hexToRgb(GOLD));

  const labels = COL_LABELS;
  for (let i = 0; i < labels.length; i++) {
    const x = colX(i) + 2;
    doc.text(labels[i], x, y + 5.5);
  }

  return y + 10;
}

function drawEventHeader(doc: Doc, ev: EventBlock, y: number): number {
  // Gold accent bar for event name
  doc.setFillColor(...hexToRgb(GOLD));
  doc.rect(MARGIN, y, CONTENT_W, 7, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...hexToRgb(DARK));

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
  // Row background
  doc.setFillColor(...hexToRgb(alt ? ALT_ROW : LIGHT_ROW));
  doc.rect(MARGIN, y, CONTENT_W, 6, "F");

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(...hexToRgb(WHITE));

  const values = [
    tier.tier_name,
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
  // Slightly brighter background for subtotal
  doc.setFillColor(30, 33, 58);
  doc.rect(MARGIN, y, CONTENT_W, 7, "F");

  // Gold left border
  doc.setFillColor(...hexToRgb(GOLD));
  doc.rect(MARGIN, y, 2, 7, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(...hexToRgb(GOLD));

  const values = [
    `${eventTitle} — SUBTOTAL`,
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
  // Double gold line
  doc.setFillColor(...hexToRgb(GOLD));
  doc.rect(MARGIN, y, CONTENT_W, 1, "F");
  y += 2;

  // Dark background
  doc.setFillColor(...hexToRgb(DARK));
  doc.rect(MARGIN, y, CONTENT_W, 9, "F");

  // Gold border
  doc.setDrawColor(...hexToRgb(GOLD));
  doc.setLineWidth(0.5);
  doc.rect(MARGIN, y, CONTENT_W, 9, "S");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(...hexToRgb(GOLD));

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

function drawFooter(doc: Doc, page: number, total: number) {
  const y = PAGE_H - 8;

  doc.setFillColor(...hexToRgb(DARK));
  doc.rect(0, y - 2, PAGE_W, 12, "F");

  doc.setFillColor(...hexToRgb(GOLD));
  doc.rect(0, y - 2, PAGE_W, 0.5, "F");

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(150, 150, 150);
  doc.text("VenueCore Ticket Audit — Confidential", MARGIN, y + 3);
  doc.text(`Page ${page} of ${total}`, PAGE_W - MARGIN, y + 3, { align: "right" });
}

/**
 * Invoice PDF Generator — compact layout matching offer-pdf gold standard.
 * Compact header, dark section bars, tight two-column blocks, small fonts.
 */
import {
  addPdfHeader, drawFooter, loadVenueCoreFavicon, ensureSpace,
  MARGIN, PAGE_WIDTH, PAGE_HEIGHT, CONTENT_WIDTH, DARK, GOLD, LIGHT_GRAY, MID_GRAY,
  type Doc,
} from "./pdf-header";

export type InvoiceLineItem = {
  description: string;
  category?: string;
  amount: number;
};

export type InvoicePDFData = {
  invoice_number: string;
  invoice_date: string;
  due_date: string;
  // Client
  client_name: string;
  client_email?: string;
  client_phone?: string;
  client_company?: string;
  client_address?: string;
  // Event
  event_name: string;
  event_date: string;
  // Line items & totals
  line_items: InvoiceLineItem[];
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  total: number;
  amount_paid: number;
  balance_due: number;
  tax_exempt?: boolean;
  // Payment link
  payment_url?: string;
  // Venue
  venue_name: string;
  venue_address?: string;
  venue_slug?: string;
  venue_logo_url?: string | null;
};

// ── Compact layout constants (match offer-pdf) ────────────────────────
const S = 7;
const M = 7.5;
const H = 8;
const RH = 3.8;
const halfW = CONTENT_WIDTH / 2 - 4;
const leftX = MARGIN + 2;
const rightX = MARGIN + halfW + 8;
const rValX = rightX + 28;

function fmt(n: number): string {
  return "$" + Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function secH(doc: Doc, title: string, y: number, width?: number): number {
  const w = width ?? CONTENT_WIDTH;
  y = ensureSpace(doc, 8, y);
  doc.setFillColor(...DARK);
  doc.rect(MARGIN, y, w, 5.5, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(H);
  doc.setTextColor(...GOLD);
  doc.text(title.toUpperCase(), MARGIN + 2, y + 3.8);
  doc.setTextColor(0, 0, 0);
  return y + 8;
}

function lv(
  doc: Doc, label: string, val: string, y: number,
  opts?: { x?: number; valX?: number; maxW?: number; color?: [number, number, number] }
): number {
  const x = opts?.x ?? leftX;
  const valXPos = opts?.valX ?? (x + 28);
  const maxW = opts?.maxW ?? 52;
  const lines: string[] = doc.splitTextToSize(val || "—", maxW);
  const neededH = Math.max(1, lines.length) * RH;
  y = ensureSpace(doc, neededH, y);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(S);
  doc.setTextColor(80, 80, 80);
  doc.text(`${label}:`, x, y);
  doc.setFont("helvetica", opts?.color ? "bold" : "normal");
  doc.setFontSize(M);
  doc.setTextColor(...(opts?.color || [0, 0, 0]));
  for (let i = 0; i < lines.length; i++) doc.text(lines[i], valXPos, y + i * RH);
  doc.setTextColor(0, 0, 0);
  return y + neededH;
}

function moneyRow(doc: Doc, label: string, amount: string, y: number, opts?: { bold?: boolean; highlight?: boolean; indent?: number }): number {
  y = ensureSpace(doc, RH + 1, y);
  if (opts?.highlight) {
    doc.setFillColor(...GOLD);
    doc.rect(MARGIN, y - 2.5, CONTENT_WIDTH, RH + 1.5, "F");
    doc.setTextColor(...DARK);
  } else {
    doc.setTextColor(0, 0, 0);
  }
  doc.setFont("helvetica", opts?.bold || opts?.highlight ? "bold" : "normal");
  doc.setFontSize(M);
  doc.text(label, leftX + (opts?.indent || 0), y);
  doc.text(amount, MARGIN + CONTENT_WIDTH - 2, y, { align: "right" });
  doc.setTextColor(0, 0, 0);
  return y + RH;
}

// ═════════════════════════════════════════════════════════════════════
//  INVOICE PDF EXPORT
// ═════════════════════════════════════════════════════════════════════
export async function exportInvoicePDF(data: InvoicePDFData): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: [PAGE_WIDTH, PAGE_HEIGHT], compress: true }) as Doc;

  const vcIcon = await loadVenueCoreFavicon();

  // ── COMPACT HEADER with client info on left ──
  let y = await addPdfHeader(doc, {
    title: "Invoice",
    venueName: data.venue_name,
    venueAddress: data.venue_address,
    venueSlug: data.venue_slug,
    logoUrl: data.venue_logo_url,
    compact: true,
    showBuyerInfo: true,
    buyerInfo: {
      company: data.client_company,
      contact: data.client_name,
      email: data.client_email,
      phone: data.client_phone,
      address: data.client_address,
    },
  });

  // Invoice meta line
  doc.setFont("helvetica", "normal");
  doc.setFontSize(S);
  doc.setTextColor(100, 100, 100);
  doc.text(
    `Invoice #: ${data.invoice_number}  |  Date: ${data.invoice_date}  |  Due: ${data.due_date}`,
    MARGIN + 2, y
  );
  y += 6;

  // ════════════════════════════════════════════════════════
  //  BILL TO + EVENT — two columns
  // ════════════════════════════════════════════════════════
  y = secH(doc, "Bill To & Event Details", y);
  const infoStartY = y;

  // Left column: Client
  let lY = infoStartY;
  lY = lv(doc, "Client",  data.client_name,    lY);
  if (data.client_company) lY = lv(doc, "Company", data.client_company, lY);
  if (data.client_address) lY = lv(doc, "Address", data.client_address, lY, { maxW: 50 });
  if (data.client_email)   lY = lv(doc, "Email",   data.client_email,   lY);
  if (data.client_phone)   lY = lv(doc, "Phone",   data.client_phone,   lY);

  // Right column: Event + Invoice dates
  let rY = infoStartY;
  rY = lv(doc, "Event",    data.event_name,       rY, { x: rightX, valX: rValX, maxW: 50 });
  rY = lv(doc, "Evt. Date",data.event_date,        rY, { x: rightX, valX: rValX, maxW: 50 });
  rY = lv(doc, "Inv. Date",data.invoice_date,      rY, { x: rightX, valX: rValX, maxW: 50 });
  rY = lv(doc, "Due",      data.due_date,          rY, { x: rightX, valX: rValX, maxW: 50 });

  y = Math.max(lY, rY) + 2;

  // ════════════════════════════════════════════════════════
  //  LINE ITEMS TABLE
  // ════════════════════════════════════════════════════════
  y = secH(doc, "Invoice Items", y);

  // Table header
  y = ensureSpace(doc, 8, y);
  doc.setFillColor(...LIGHT_GRAY);
  doc.rect(MARGIN, y - 1.5, CONTENT_WIDTH, 5, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.5);
  doc.setTextColor(80, 80, 80);
  doc.text("#",        MARGIN + 2,                 y + 2);
  doc.text("DESCRIPTION", MARGIN + 10,             y + 2);
  doc.text("AMOUNT",   MARGIN + CONTENT_WIDTH - 2, y + 2, { align: "right" });
  y += 6;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(M);
  for (let i = 0; i < data.line_items.length; i++) {
    const item = data.line_items[i];
    y = ensureSpace(doc, RH + 1.5, y);
    if (i % 2 === 0) {
      doc.setFillColor(249, 249, 246);
      doc.rect(MARGIN, y - 1, CONTENT_WIDTH, RH + 1.5, "F");
    }
    const ty = y + 2; // vertically center text within the row rect
    doc.setTextColor(0, 0, 0);
    doc.text(`${i + 1}`, MARGIN + 2, ty);
    const desc: string = doc.splitTextToSize(item.description || "—", CONTENT_WIDTH - 30)[0] || "—";
    doc.text(desc, MARGIN + 10, ty);
    doc.text(fmt(item.amount), MARGIN + CONTENT_WIDTH - 2, ty, { align: "right" });
    y += RH + 1.5;
  }
  y += 1;

  // ── Totals ──
  doc.setDrawColor(...MID_GRAY);
  doc.setLineWidth(0.2);
  doc.line(MARGIN + 100, y, MARGIN + CONTENT_WIDTH, y);
  y += 3;

  y = moneyRow(doc, "Subtotal", fmt(data.subtotal), y);
  if (data.tax_exempt) {
    y = moneyRow(doc, "Tax", "Tax Exempt", y, { indent: 4 });
  } else if (data.tax_rate > 0) {
    y = moneyRow(doc, `Tax (${(data.tax_rate * 100).toFixed(2)}%)`, fmt(data.tax_amount), y, { indent: 4 });
  }

  // Total bar
  y = ensureSpace(doc, 8, y);
  doc.setFillColor(...DARK);
  doc.rect(MARGIN, y - 1.5, CONTENT_WIDTH, 6.5, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...GOLD);
  doc.text("TOTAL:", MARGIN + 2, y + 3.5);
  doc.text(fmt(data.total), MARGIN + CONTENT_WIDTH - 2, y + 3.5, { align: "right" });
  y += 10;

  if (data.amount_paid > 0) {
    y = moneyRow(doc, "Amount Paid", fmt(data.amount_paid), y, { indent: 4 });
  }
  if (data.balance_due > 0) {
    y = moneyRow(doc, "BALANCE DUE", fmt(data.balance_due), y, { highlight: true });
  } else {
    y = moneyRow(doc, "Balance Due", "$0.00 — PAID IN FULL", y, { bold: true });
  }
  y += 2;

  // ── Payment instructions ──
  if (data.balance_due > 0) {
    y = ensureSpace(doc, 16, y);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(M);
    doc.setTextColor(60, 60, 60);
    doc.text("Please remit payment by the due date listed above.", leftX, y);
    y += RH + 1;
    if (data.payment_url) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(S);
      doc.setTextColor(80, 80, 80);
      doc.text("Pay online:", leftX, y);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(M);
      doc.setTextColor(0, 102, 204);
      doc.text(data.payment_url, leftX + 22, y);
      y += RH + 1;
    }
    doc.setTextColor(0, 0, 0);
    y += 4;
  }

  // ── Thank you ──
  y = ensureSpace(doc, 10, y);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...GOLD);
  doc.text("Thank you for your business!", PAGE_WIDTH / 2, y, { align: "center" });

  drawFooter(doc, "Invoice", { vcIconDataUrl: vcIcon ?? undefined });

  doc.save(`Invoice-${data.invoice_number}.pdf`);
}

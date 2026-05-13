/**
 * Proposal PDF Generator — compact layout matching offer-pdf gold standard.
 * Compact header, dark section bars, tight two-column blocks, small fonts.
 */
import {
  addPdfHeader, drawFooter, loadVenueCoreFavicon, ensureSpace,
  MARGIN, PAGE_WIDTH, PAGE_HEIGHT, CONTENT_WIDTH, DARK, GOLD, LIGHT_GRAY, MID_GRAY,
  type Doc,
} from "./pdf-header";

export type ProposalLineItem = {
  description: string;
  category?: string;
  amount: number;
};

export type ProposalData = {
  proposal_number: string;
  date: string;
  valid_until: string;
  // Event
  event_name: string;
  event_date: string;
  event_venue: string;
  event_type_label?: string;
  // Client
  client_name: string;
  client_email?: string;
  client_phone?: string;
  client_company?: string;
  // Line items
  line_items: ProposalLineItem[];
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  total: number;
  // Payment terms (optional — shown as its own section when provided)
  deposit_pct?: number;
  deposit_amount?: number;
  deposit_due?: string;
  balance_due_date?: string;
  cancellation_policy?: string;
  // Text
  notes?: string;
  terms?: string;
  // Venue
  venue_name: string;
  venue_address?: string;
  venue_slug?: string;
  venue_logo_url?: string | null;
};

// ── Compact layout constants (match offer-pdf) ────────────────────────
const S = 7;      // small label text
const M = 7.5;    // value / body text
const H = 8;      // section header text
const RH = 3.8;   // row height
const halfW = CONTENT_WIDTH / 2 - 4;
const leftX = MARGIN + 2;
const rightX = MARGIN + halfW + 8;
const rValX = rightX + 28;

function fmt(n: number): string {
  return "$" + Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Full-width dark section header bar */
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

/** Compact label:value pair */
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

/** Right-aligned money row */
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
//  PROPOSAL PDF EXPORT
// ═════════════════════════════════════════════════════════════════════
export async function exportProposalPDF(data: ProposalData): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: [PAGE_WIDTH, PAGE_HEIGHT], compress: true }) as Doc;

  const vcIcon = await loadVenueCoreFavicon();

  // ── COMPACT HEADER (matches offer PDF) ──
  let y = await addPdfHeader(doc, {
    title: "Event Proposal",
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
    },
  });

  // Proposal meta line
  doc.setFont("helvetica", "normal");
  doc.setFontSize(S);
  doc.setTextColor(100, 100, 100);
  doc.text(
    `Proposal #: ${data.proposal_number}  |  Date: ${data.date}  |  Valid Until: ${data.valid_until}`,
    MARGIN + 2, y
  );
  y += 6;

  // ════════════════════════════════════════════════════════
  //  CLIENT + EVENT — two columns
  // ════════════════════════════════════════════════════════
  y = secH(doc, "Client & Event Details", y);
  const infoStartY = y;

  // Left column: Client
  let lY = infoStartY;
  lY = lv(doc, "Client", data.client_name, lY);
  if (data.client_company) lY = lv(doc, "Company", data.client_company, lY);
  if (data.client_email)   lY = lv(doc, "Email",   data.client_email,   lY);
  if (data.client_phone)   lY = lv(doc, "Phone",   data.client_phone,   lY);

  // Right column: Event
  let rY = infoStartY;
  rY = lv(doc, "Event",  data.event_name,              rY, { x: rightX, valX: rValX, maxW: 50 });
  rY = lv(doc, "Date",   data.event_date,              rY, { x: rightX, valX: rValX, maxW: 50 });
  rY = lv(doc, "Venue",  data.event_venue,             rY, { x: rightX, valX: rValX, maxW: 50 });
  if (data.event_type_label)
    rY = lv(doc, "Type", data.event_type_label,        rY, { x: rightX, valX: rValX, maxW: 50 });

  y = Math.max(lY, rY) + 2;

  // ════════════════════════════════════════════════════════
  //  LINE ITEMS TABLE
  // ════════════════════════════════════════════════════════
  y = secH(doc, "Cost Breakdown", y);

  // Table header
  y = ensureSpace(doc, 8, y);
  doc.setFillColor(...LIGHT_GRAY);
  doc.rect(MARGIN, y - 1.5, CONTENT_WIDTH, 5, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.5);
  doc.setTextColor(80, 80, 80);
  doc.text("#",           MARGIN + 2,                  y + 2);
  doc.text("DESCRIPTION", MARGIN + 10,                 y + 2);
  doc.text("CATEGORY",    MARGIN + 120,                y + 2);
  doc.text("AMOUNT",      MARGIN + CONTENT_WIDTH - 2,  y + 2, { align: "right" });
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
    const desc: string = doc.splitTextToSize(item.description || "—", 106)[0] || "—";
    doc.text(desc, MARGIN + 10, ty);
    if (item.category) {
      doc.setTextColor(100, 100, 100);
      doc.text(item.category, MARGIN + 120, ty);
    }
    doc.setTextColor(0, 0, 0);
    doc.text(fmt(item.amount), MARGIN + CONTENT_WIDTH - 2, ty, { align: "right" });
    y += RH + 1.5;
  }
  y += 1;

  // ── Totals block ──
  doc.setDrawColor(...MID_GRAY);
  doc.setLineWidth(0.2);
  doc.line(MARGIN + 100, y, MARGIN + CONTENT_WIDTH, y);
  y += 3;

  y = moneyRow(doc, "Subtotal", fmt(data.subtotal), y);
  if (data.tax_rate > 0) {
    y = moneyRow(doc, `Tax (${(data.tax_rate * 100).toFixed(2)}%)`, fmt(data.tax_amount), y, { indent: 4 });
  }

  // Total highlight bar
  y = ensureSpace(doc, 8, y);
  doc.setFillColor(...DARK);
  doc.rect(MARGIN, y - 1.5, CONTENT_WIDTH, 6.5, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...GOLD);
  doc.text("TOTAL:", MARGIN + 2, y + 3.5);
  doc.text(fmt(data.total), MARGIN + CONTENT_WIDTH - 2, y + 3.5, { align: "right" });
  y += 10;

  // ════════════════════════════════════════════════════════
  //  PAYMENT TERMS — two columns
  // ════════════════════════════════════════════════════════
  const hasPayment = data.deposit_pct || data.deposit_amount || data.deposit_due || data.balance_due_date;
  if (hasPayment) {
    y = secH(doc, "Payment Terms", y);
    const ptStartY = y;

    let plY = ptStartY;
    if (data.deposit_pct && data.deposit_amount)
      plY = lv(doc, "Deposit", `${data.deposit_pct}% — ${fmt(data.deposit_amount)}`, plY);
    if (data.deposit_due)
      plY = lv(doc, "Dep. Due", data.deposit_due, plY);

    let prY = ptStartY;
    if (data.balance_due_date)
      prY = lv(doc, "Bal. Due", data.balance_due_date, prY, { x: rightX, valX: rValX, maxW: 50 });

    y = Math.max(plY, prY) + 2;

    if (data.cancellation_policy) {
      y = ensureSpace(doc, 10, y);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(S);
      doc.setTextColor(80, 80, 80);
      doc.text("Cancellation Policy:", leftX, y);
      y += RH + 1;
      const cancelLines: string[] = doc.splitTextToSize(data.cancellation_policy, CONTENT_WIDTH - 4);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(M);
      doc.setTextColor(0, 0, 0);
      for (const line of cancelLines) {
        y = ensureSpace(doc, RH, y);
        doc.text(line, leftX + 4, y);
        y += RH;
      }
      y += 2;
    }
  }

  // ════════════════════════════════════════════════════════
  //  NOTES
  // ════════════════════════════════════════════════════════
  if (data.notes) {
    y = secH(doc, "Notes", y);
    const noteLines: string[] = doc.splitTextToSize(data.notes, CONTENT_WIDTH - 4);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(M);
    doc.setTextColor(0, 0, 0);
    for (const line of noteLines) {
      y = ensureSpace(doc, RH, y);
      doc.text(line, leftX + 2, y);
      y += RH;
    }
    y += 2;
  }

  // ════════════════════════════════════════════════════════
  //  TERMS & CONDITIONS
  // ════════════════════════════════════════════════════════
  const defaultTerms = [
    "1. This proposal is valid for 30 days from the date of issue.",
    "2. A signed contract and deposit are required to confirm booking.",
    "3. The deposit amount is non-refundable per the cancellation policy.",
    "4. Final payment is due per the schedule outlined above.",
    "5. Additional services or changes may affect the final total.",
  ];
  y = secH(doc, "Terms & Conditions", y);
  const termsLines = data.terms ? data.terms.split("\n") : defaultTerms;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(M);
  doc.setTextColor(60, 60, 60);
  for (const line of termsLines) {
    const wrapped: string[] = doc.splitTextToSize(line, CONTENT_WIDTH - 6);
    for (const wl of wrapped) {
      y = ensureSpace(doc, RH, y);
      doc.text(wl, leftX + 2, y);
      y += RH;
    }
  }
  y += 4;

  // ════════════════════════════════════════════════════════
  //  SIGNATURE LINES
  // ════════════════════════════════════════════════════════
  y = ensureSpace(doc, 28, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(S);
  doc.setTextColor(80, 80, 80);
  doc.setDrawColor(...DARK);
  doc.setLineWidth(0.3);

  const sigW = halfW - 4;
  doc.line(MARGIN, y + 14, MARGIN + sigW, y + 14);
  doc.text("Client Signature", MARGIN, y + 18);
  doc.line(MARGIN, y + 23, MARGIN + sigW, y + 23);
  doc.text("Date", MARGIN, y + 27);

  doc.line(rightX - 2, y + 14, rightX - 2 + sigW, y + 14);
  doc.text("Venue Representative", rightX - 2, y + 18);
  doc.line(rightX - 2, y + 23, rightX - 2 + sigW, y + 23);
  doc.text("Date", rightX - 2, y + 27);

  drawFooter(doc, "Event Proposal", { vcIconDataUrl: vcIcon ?? undefined });

  doc.save(`Proposal-${data.proposal_number}.pdf`);
}

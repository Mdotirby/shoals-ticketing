/**
 * Proposal PDF Generator — uses shared header utility.
 * Professional proposal for private events. HAS buyer info (client contact).
 */
import {
  addPdfHeader, drawFooter, ensureSpace, drawSectionHeader, drawLabelValue,
  drawParagraph, fmt,
  MARGIN, PAGE_WIDTH, PAGE_HEIGHT, CONTENT_WIDTH, DARK, GOLD, MID_GRAY, LIGHT_GRAY,
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
  // Terms
  notes?: string;
  terms?: string;
  // Venue
  venue_name: string;
  venue_address?: string;
  venue_slug?: string;
};

// ═════════════════════════════════════════════════════════════════════
//  PROPOSAL PDF EXPORT
// ═════════════════════════════════════════════════════════════════════
export async function exportProposalPDF(data: ProposalData): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: [PAGE_WIDTH, PAGE_HEIGHT], compress: true });

  // ── HEADER (HAS buyer info — client contact) ──
  let y = await addPdfHeader(doc, {
    title: "Event Proposal",
    venueName: data.venue_name,
    venueAddress: data.venue_address,
    venueSlug: data.venue_slug,
    showBuyerInfo: true,
    buyerInfo: {
      contact: data.client_name,
      company: data.client_company,
      phone: data.client_phone,
      email: data.client_email,
    },
  });

  // Proposal meta info
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...MID_GRAY);
  doc.text(`Proposal #: ${data.proposal_number}  |  Date: ${data.date}  |  Valid Until: ${data.valid_until}`, MARGIN, y);
  y += 6;

  // ── CLIENT INFO ──
  y = drawSectionHeader(doc, "Client Information", y);
  y = drawLabelValue(doc, "Name", data.client_name, y);
  if (data.client_company) y = drawLabelValue(doc, "Company", data.client_company, y);
  if (data.client_email) y = drawLabelValue(doc, "Email", data.client_email, y);
  if (data.client_phone) y = drawLabelValue(doc, "Phone", data.client_phone, y);
  y += 4;

  // ── EVENT DETAILS ──
  y = drawSectionHeader(doc, "Event Details", y);
  y = drawLabelValue(doc, "Event", data.event_name, y);
  y = drawLabelValue(doc, "Date", data.event_date, y);
  y = drawLabelValue(doc, "Venue", data.event_venue, y);
  y += 4;

  // ── COST BREAKDOWN ──
  y = drawSectionHeader(doc, "Cost Breakdown", y);

  // Table header
  y = ensureSpace(doc, 10, y);
  doc.setFillColor(...LIGHT_GRAY);
  doc.rect(MARGIN, y, CONTENT_WIDTH, 7, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...DARK);
  doc.text("#", MARGIN + 3, y + 5);
  doc.text("DESCRIPTION", MARGIN + 12, y + 5);
  doc.text("CATEGORY", MARGIN + 110, y + 5);
  doc.text("AMOUNT", MARGIN + CONTENT_WIDTH - 3, y + 5, { align: "right" });
  y += 9;

  // Line items
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  for (let i = 0; i < data.line_items.length; i++) {
    const item = data.line_items[i];
    y = ensureSpace(doc, 8, y);

    if (i % 2 === 0) {
      doc.setFillColor(249, 249, 246);
      doc.rect(MARGIN, y - 1, CONTENT_WIDTH, 7, "F");
    }

    doc.setTextColor(...DARK);
    doc.text(`${i + 1}`, MARGIN + 3, y + 4);
    // Truncate description to fit before category column
    const descMaxW = 110 - 12 - 3;
    const desc: string = doc.splitTextToSize(item.description || "—", descMaxW)[0] || item.description || "—";
    doc.text(desc, MARGIN + 12, y + 4);
    doc.setTextColor(102, 102, 102);
    doc.text(item.category || "", MARGIN + 110, y + 4);
    doc.setTextColor(...DARK);
    doc.text(fmt(item.amount), MARGIN + CONTENT_WIDTH - 3, y + 4, { align: "right" });
    y += 7;
  }

  // Totals
  y += 2;
  doc.setDrawColor(...MID_GRAY);
  doc.setLineWidth(0.3);
  doc.line(MARGIN + 100, y, MARGIN + CONTENT_WIDTH, y);
  y += 5;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...DARK);
  doc.text("Subtotal:", MARGIN + 110, y);
  doc.text(fmt(data.subtotal), MARGIN + CONTENT_WIDTH - 3, y, { align: "right" });
  y += 6;

  if (data.tax_rate > 0) {
    doc.text(`Tax (${(data.tax_rate * 100).toFixed(2)}%):`, MARGIN + 110, y);
    doc.text(fmt(data.tax_amount), MARGIN + CONTENT_WIDTH - 3, y, { align: "right" });
    y += 6;
  }

  // Total highlight
  y = ensureSpace(doc, 12, y);
  doc.setFillColor(...DARK);
  doc.rect(MARGIN + 100, y - 2, CONTENT_WIDTH - 100, 10, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...GOLD);
  doc.text("TOTAL:", MARGIN + 103, y + 5);
  doc.text(fmt(data.total), MARGIN + CONTENT_WIDTH - 3, y + 5, { align: "right" });
  y += 16;

  // ── NOTES ──
  if (data.notes) {
    y = drawSectionHeader(doc, "Notes", y);
    y = drawParagraph(doc, data.notes, y, { fontSize: 9, indent: 3 });
    y += 6;
  }

  // ── TERMS & CONDITIONS ──
  const defaultTerms = `1. This proposal is valid for 30 days from the date of issue.\n2. A signed contract and deposit are required to confirm booking.\n3. The deposit amount (typically 25-30% of total) is non-refundable.\n4. Final payment is due 7 days before the event date.\n5. Additional services or changes may affect the final total.\n6. Cancellation policy applies as outlined in the rental contract.`;
  y = drawSectionHeader(doc, "Terms & Conditions", y);
  const termsText = data.terms || defaultTerms;
  for (const line of termsText.split("\n")) {
    y = drawParagraph(doc, line, y, { fontSize: 8, indent: 3 });
    y += 1;
  }
  y += 8;

  // ── SIGNATURE LINE ──
  y = ensureSpace(doc, 40, y);
  y += 5;
  doc.setDrawColor(...DARK);
  doc.setLineWidth(0.3);

  // Client signature
  doc.line(MARGIN + 3, y + 20, MARGIN + 80, y + 20);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...DARK);
  doc.text("Client Signature", MARGIN + 3, y + 25);
  doc.text("Date: _______________", MARGIN + 3, y + 31);

  // Venue signature
  doc.line(MARGIN + 100, y + 20, MARGIN + CONTENT_WIDTH - 3, y + 20);
  doc.text("Venue Representative", MARGIN + 100, y + 25);
  doc.text("Date: _______________", MARGIN + 100, y + 31);

  // ── Footer ──
  drawFooter(doc, "Event Proposal");

  const filename = `Proposal-${data.proposal_number}.pdf`;
  doc.save(filename);
}

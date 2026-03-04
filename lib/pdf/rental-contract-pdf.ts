/**
 * Rental Contract PDF Generator — uses shared header utility.
 * Legal-style document with numbered sections. HAS buyer info (client).
 */
import {
  addPdfHeader, drawFooter, ensureSpace, drawSectionHeader,
  drawParagraph, drawClause, fmt,
  MARGIN, PAGE_WIDTH, PAGE_HEIGHT, CONTENT_WIDTH, DARK, GOLD, MID_GRAY, LIGHT_GRAY,
  type Doc,
} from "./pdf-header";

export type RentalContractLineItem = {
  description: string;
  amount: number;
};

export type RentalContractData = {
  contract_number: string;
  date: string;
  // Parties
  venue_name: string;
  venue_address?: string;
  venue_contact?: string;
  venue_phone?: string;
  venue_email?: string;
  venue_slug?: string;
  // Client
  client_name: string;
  client_email?: string;
  client_phone?: string;
  client_company?: string;
  client_address?: string;
  // Event
  event_name: string;
  event_date: string;
  event_time_start?: string;
  event_time_end?: string;
  event_space?: string;
  expected_guests?: number;
  // Pricing
  line_items: RentalContractLineItem[];
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  total: number;
  // Deposit
  deposit_percent: number;
  deposit_amount: number;
  deposit_due_date?: string;
  // Payment schedule
  payment_schedule?: string;
  // Cancellation
  cancellation_policy?: string;
  // Insurance
  insurance_required: boolean;
  insurance_details?: string;
  // Additional terms
  additional_terms?: string;
};

// ═════════════════════════════════════════════════════════════════════
//  RENTAL CONTRACT PDF EXPORT
// ═════════════════════════════════════════════════════════════════════
export async function exportRentalContractPDF(data: RentalContractData): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: [PAGE_WIDTH, PAGE_HEIGHT], compress: true });

  // ── HEADER (HAS buyer info — client) ──
  let y = await addPdfHeader(doc, {
    title: "Rental Contract",
    venueName: data.venue_name,
    venueAddress: data.venue_address,
    venueSlug: data.venue_slug,
    showBuyerInfo: true,
    buyerInfo: {
      agent: data.client_name,
      agency: data.client_company,
      phone: data.client_phone,
      email: data.client_email,
    },
  });

  // Contract meta
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...MID_GRAY);
  doc.text(`Contract #: ${data.contract_number}  |  Date: ${data.date}`, MARGIN, y);
  y += 6;

  // ── PREAMBLE ──
  y = drawParagraph(doc, `This Rental Agreement ("Agreement") is entered into as of ${data.date} by and between:`, y, { fontSize: 9, indent: 0 });
  y += 3;

  // Venue party
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...DARK);
  y = ensureSpace(doc, 7, y);
  doc.text("VENUE (\"Licensor\"):", MARGIN + 3, y);
  doc.setFont("helvetica", "normal");
  doc.text(data.venue_name, MARGIN + 50, y);
  y += 5;
  if (data.venue_address) {
    doc.text(data.venue_address, MARGIN + 50, y);
    y += 5;
  }
  if (data.venue_contact) {
    doc.text(`Contact: ${data.venue_contact}`, MARGIN + 50, y);
    y += 5;
  }
  y += 3;

  // Client party
  doc.setFont("helvetica", "bold");
  y = ensureSpace(doc, 7, y);
  doc.text("CLIENT (\"Licensee\"):", MARGIN + 3, y);
  doc.setFont("helvetica", "normal");
  doc.text(data.client_name, MARGIN + 50, y);
  y += 5;
  if (data.client_company) {
    doc.text(data.client_company, MARGIN + 50, y);
    y += 5;
  }
  if (data.client_address) {
    doc.text(data.client_address, MARGIN + 50, y);
    y += 5;
  }
  if (data.client_email) {
    doc.text(`Email: ${data.client_email}`, MARGIN + 50, y);
    y += 5;
  }
  if (data.client_phone) {
    doc.text(`Phone: ${data.client_phone}`, MARGIN + 50, y);
    y += 5;
  }
  y += 6;

  // ── §1 EVENT DETAILS ──
  let clauseNum = 1;
  const timeRange = [data.event_time_start, data.event_time_end].filter(Boolean).join(" – ") || "TBD";
  y = drawClause(doc, clauseNum++, "Event Details",
    `The Licensor agrees to make available the designated space for the following event:\n` +
    `Event: ${data.event_name}\n` +
    `Date: ${data.event_date}\n` +
    `Time: ${timeRange}\n` +
    `Space: ${data.event_space || "Main Venue"}\n` +
    `Expected Guests: ${data.expected_guests || "TBD"}`,
    y
  );

  // ── §2 RENTAL FEES ──
  y = ensureSpace(doc, 18, y);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...DARK);
  doc.text(`§${clauseNum}  RENTAL FEES`, MARGIN + 3, y);
  clauseNum++;
  y += 8;

  // Table header
  y = ensureSpace(doc, 10, y);
  doc.setFillColor(...LIGHT_GRAY);
  doc.rect(MARGIN, y, CONTENT_WIDTH, 7, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...DARK);
  doc.text("DESCRIPTION", MARGIN + 3, y + 5);
  doc.text("AMOUNT", MARGIN + CONTENT_WIDTH - 3, y + 5, { align: "right" });
  y += 9;

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
    doc.text(item.description, MARGIN + 3, y + 4);
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
  doc.text("Subtotal:", MARGIN + 110, y);
  doc.text(fmt(data.subtotal), MARGIN + CONTENT_WIDTH - 3, y, { align: "right" });
  y += 6;

  if (data.tax_rate > 0) {
    doc.text(`Tax (${(data.tax_rate * 100).toFixed(2)}%):`, MARGIN + 110, y);
    doc.text(fmt(data.tax_amount), MARGIN + CONTENT_WIDTH - 3, y, { align: "right" });
    y += 6;
  }

  y = ensureSpace(doc, 12, y);
  doc.setFillColor(...DARK);
  doc.rect(MARGIN + 100, y - 2, CONTENT_WIDTH - 100, 10, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...GOLD);
  doc.text("TOTAL:", MARGIN + 103, y + 5);
  doc.text(fmt(data.total), MARGIN + CONTENT_WIDTH - 3, y + 5, { align: "right" });
  y += 16;

  // ── §3 DEPOSIT ──
  const depositText = `A non-refundable deposit of ${fmt(data.deposit_amount)} (${data.deposit_percent}% of total) is due upon execution of this Agreement` +
    (data.deposit_due_date ? `, no later than ${data.deposit_due_date}` : "") +
    `. The deposit will be applied toward the total rental fee. Failure to provide the deposit by the due date may result in cancellation of this reservation.`;
  y = drawClause(doc, clauseNum++, "Deposit", depositText, y);

  // ── §4 PAYMENT SCHEDULE ──
  const defaultPaymentSchedule = `The remaining balance of ${fmt(data.total - data.deposit_amount)} is due no later than seven (7) days prior to the event date. Payment may be made via credit card, wire transfer, or check. Late payments may incur a fee of 1.5% per month on the outstanding balance.`;
  y = drawClause(doc, clauseNum++, "Payment Schedule", data.payment_schedule || defaultPaymentSchedule, y);

  // ── §5 CANCELLATION POLICY ──
  const defaultCancellation =
    `Cancellations must be submitted in writing. The following refund schedule applies:\n` +
    `• More than 60 days before event: Full refund minus deposit\n` +
    `• 30–60 days before event: 50% refund of amounts paid (excluding deposit)\n` +
    `• Less than 30 days before event: No refund\n` +
    `The Licensor reserves the right to cancel this Agreement due to force majeure events, in which case a full refund (including deposit) will be issued.`;
  y = drawClause(doc, clauseNum++, "Cancellation Policy", data.cancellation_policy || defaultCancellation, y);

  // ── §6 INSURANCE ──
  const insuranceText = data.insurance_required
    ? (data.insurance_details || `The Licensee shall obtain and maintain general liability insurance with a minimum coverage of $1,000,000 per occurrence, naming the Licensor as an additional insured. Proof of insurance must be provided no later than fourteen (14) days prior to the event.`)
    : `Insurance is not required for this event; however, the Licensee is encouraged to obtain event liability coverage. The Licensor is not responsible for any damage to, or loss of, Licensee's property.`;
  y = drawClause(doc, clauseNum++, "Insurance", insuranceText, y);

  // ── §7 INDEMNIFICATION ──
  y = drawClause(doc, clauseNum++, "Indemnification",
    `The Licensee agrees to indemnify, defend, and hold harmless the Licensor, its officers, employees, and agents from and against any and all claims, damages, losses, and expenses (including reasonable attorney fees) arising out of or resulting from the Licensee's use of the premises, except to the extent caused by the gross negligence or willful misconduct of the Licensor.`,
    y
  );

  // ── §8 USE OF PREMISES ──
  y = drawClause(doc, clauseNum++, "Use of Premises",
    `The Licensee shall use the premises only for the purpose stated in this Agreement. The Licensee shall comply with all applicable laws, regulations, and venue policies. No alterations to the premises are permitted without prior written consent. The premises must be returned to their original condition at the conclusion of the event.`,
    y
  );

  // ── §9 ADDITIONAL TERMS ──
  if (data.additional_terms) {
    y = drawClause(doc, clauseNum++, "Additional Terms", data.additional_terms, y);
  }

  // ── §N GOVERNING LAW ──
  y = drawClause(doc, clauseNum++, "Governing Law",
    `This Agreement shall be governed by and construed in accordance with the laws of the state in which the venue is located. Any disputes arising under this Agreement shall be resolved through binding arbitration in the venue's jurisdiction.`,
    y
  );

  // ── §N+1 ENTIRE AGREEMENT ──
  y = drawClause(doc, clauseNum++, "Entire Agreement",
    `This Agreement constitutes the entire understanding between the parties and supersedes all prior negotiations, representations, or agreements. Any modifications must be made in writing and signed by both parties.`,
    y
  );

  // ── SIGNATURE BLOCK ──
  y = ensureSpace(doc, 55, y);
  y += 5;
  y = drawSectionHeader(doc, "Signatures", y);
  y += 5;

  doc.setDrawColor(...DARK);
  doc.setLineWidth(0.3);

  // Licensor
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...DARK);
  doc.text("LICENSOR (Venue):", MARGIN + 3, y);
  y += 8;
  doc.line(MARGIN + 3, y + 12, MARGIN + 80, y + 12);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text("Signature", MARGIN + 3, y + 17);
  doc.text("Name: " + (data.venue_contact || "___________________"), MARGIN + 3, y + 23);
  doc.text("Date: _______________", MARGIN + 3, y + 29);

  // Licensee
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("LICENSEE (Client):", MARGIN + 100, y - 8);
  doc.line(MARGIN + 100, y + 12, MARGIN + CONTENT_WIDTH - 3, y + 12);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text("Signature", MARGIN + 100, y + 17);
  doc.text("Name: " + (data.client_name || "___________________"), MARGIN + 100, y + 23);
  doc.text("Date: _______________", MARGIN + 100, y + 29);

  // ── Footer ──
  drawFooter(doc, "Rental Contract");

  const filename = `RentalContract-${data.contract_number}.pdf`;
  doc.save(filename);
}

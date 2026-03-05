/**
 * Invoice PDF Generator — uses shared header utility.
 * Professional invoice for private event billing.
 */
import {
  addPdfHeader, drawFooter, ensureSpace, drawSectionHeader, drawLabelValue,
  drawRow, drawDivider, fmt,
  MARGIN, PAGE_WIDTH, PAGE_HEIGHT, CONTENT_WIDTH, DARK, GOLD, MID_GRAY, LIGHT_GRAY,
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
};

// ═════════════════════════════════════════════════════════════════════
//  INVOICE PDF EXPORT
// ═════════════════════════════════════════════════════════════════════
export async function exportInvoicePDF(data: InvoicePDFData): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: [PAGE_WIDTH, PAGE_HEIGHT], compress: true }) as Doc;

  // ── HEADER (with buyer info — client contact) ──
  let y = await addPdfHeader(doc, {
    title: "Invoice",
    venueName: data.venue_name,
    venueAddress: data.venue_address,
    venueSlug: data.venue_slug,
    showBuyerInfo: true,
    buyerInfo: {
      contact: data.client_name,
      company: data.client_company,
      phone: data.client_phone,
      email: data.client_email,
      address: data.client_address,
    },
  });

  // Invoice meta info
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...MID_GRAY);
  doc.text(
    `Invoice #: ${data.invoice_number}  |  Date: ${data.invoice_date}  |  Due: ${data.due_date}`,
    MARGIN, y,
  );
  y += 6;

  // ── BILL TO ──
  y = drawSectionHeader(doc, "Bill To", y);
  y = drawLabelValue(doc, "Name", data.client_name, y);
  if (data.client_company) y = drawLabelValue(doc, "Company", data.client_company, y);
  if (data.client_address) y = drawLabelValue(doc, "Address", data.client_address, y);
  if (data.client_email) y = drawLabelValue(doc, "Email", data.client_email, y);
  if (data.client_phone) y = drawLabelValue(doc, "Phone", data.client_phone, y);
  y += 4;

  // ── EVENT REFERENCE ──
  y = drawSectionHeader(doc, "Event Details", y);
  y = drawLabelValue(doc, "Event", data.event_name, y);
  y = drawLabelValue(doc, "Date", data.event_date, y);
  y += 4;

  // ── LINE ITEMS TABLE ──
  y = drawSectionHeader(doc, "Invoice Items", y);

  // Table header
  y = ensureSpace(doc, 10, y);
  doc.setFillColor(...LIGHT_GRAY);
  doc.rect(MARGIN, y, CONTENT_WIDTH, 7, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...DARK);
  doc.text("#", MARGIN + 3, y + 5);
  doc.text("DESCRIPTION", MARGIN + 12, y + 5);
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
    // Truncate description to fit
    const descMaxW = CONTENT_WIDTH - 12 - 30;
    const desc: string = doc.splitTextToSize(item.description || "—", descMaxW)[0] || item.description || "—";
    doc.text(desc, MARGIN + 12, y + 4);
    doc.text(fmt(item.amount), MARGIN + CONTENT_WIDTH - 3, y + 4, { align: "right" });
    y += 7;
  }

  // ── TOTALS ──
  y += 2;
  doc.setDrawColor(...MID_GRAY);
  doc.setLineWidth(0.3);
  doc.line(MARGIN + 100, y, MARGIN + CONTENT_WIDTH, y);
  y += 5;

  // Subtotal
  y = drawRow(doc, "Subtotal", fmt(data.subtotal), y);

  // Tax
  if (data.tax_exempt) {
    y = drawRow(doc, "Tax", "Tax Exempt", y);
  } else if (data.tax_rate > 0) {
    y = drawRow(doc, `Tax (${(data.tax_rate * 100).toFixed(2)}%)`, fmt(data.tax_amount), y);
  }

  // Total
  y = ensureSpace(doc, 12, y);
  doc.setFillColor(...DARK);
  doc.rect(MARGIN + 100, y - 2, CONTENT_WIDTH - 100, 10, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...GOLD);
  doc.text("TOTAL:", MARGIN + 103, y + 5);
  doc.text(fmt(data.total), MARGIN + CONTENT_WIDTH - 3, y + 5, { align: "right" });
  y += 14;

  // Amount Paid
  if (data.amount_paid > 0) {
    y = drawRow(doc, "Amount Paid", fmt(data.amount_paid), y);
  }

  // Balance Due (highlighted if > 0)
  if (data.balance_due > 0) {
    y = drawRow(doc, "BALANCE DUE", fmt(data.balance_due), y, { bold: true, highlight: true });
  } else {
    y = drawRow(doc, "Balance Due", "$0.00 — PAID IN FULL", y, { bold: true });
  }

  y += 8;

  // ── PAYMENT INSTRUCTIONS ──
  if (data.balance_due > 0) {
    y = drawDivider(doc, y);
    y += 2;
    y = ensureSpace(doc, 20, y);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...DARK);
    doc.text("Payment Instructions", MARGIN + 3, y);
    y += 6;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...DARK);
    doc.text("Please submit payment by the due date listed above.", MARGIN + 3, y);
    y += 5;

    if (data.payment_url) {
      doc.text("Pay online:", MARGIN + 3, y);
      doc.setTextColor(0, 102, 204);
      doc.text(data.payment_url, MARGIN + 28, y);
      doc.setTextColor(...DARK);
      y += 5;
    }

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...MID_GRAY);
    doc.text("For questions about this invoice, please contact the venue directly.", MARGIN + 3, y);
    y += 8;
  }

  // ── THANK YOU ──
  y = ensureSpace(doc, 20, y);
  y = drawDivider(doc, y);
  y += 4;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...GOLD);
  doc.text("Thank you for your business!", PAGE_WIDTH / 2, y, { align: "center" });

  // ── Footer ──
  drawFooter(doc, "Invoice");

  const filename = `Invoice-${data.invoice_number}.pdf`;
  doc.save(filename);
}

/**
 * Offer PDF Generator — uses shared header utility.
 * Properly paginates content so nothing is cut off.
 */
import type { TicketScalingRow, ExpenseItem, VariableExpenseItem } from "../types/offer";
import type { Venue } from "../types/venue";
import {
  addPdfHeader, drawFooter, ensureSpace, drawSectionHeader, drawDivider,
  fmt, sanitize, formatTime12hr,
  MARGIN, PAGE_WIDTH, PAGE_HEIGHT, CONTENT_WIDTH, DARK, GOLD, MID_GRAY,
  type Doc,
} from "./pdf-header";

export type OfferPdfData = {
  // Venue
  venue?: string;
  venue_address?: string;
  venue_contact?: string;
  venue_phone?: string;
  venue_capacity?: number;
  // Agency / Artist
  agency?: string;
  agent_name?: string;
  agent_phone?: string;
  agent_email?: string;
  artist_name?: string;
  event_date?: string;
  num_shows?: number;
  show_length?: string;
  show_time?: string;
  billing?: string;
  // Deal
  guarantee?: number;
  deal_type?: string;
  backend_percentage?: number;
  other_terms?: string;
  radius_distance?: string;
  radius_days_prior?: number;
  radius_days_after?: number;
  production_by?: string;
  deposit_amount?: number;
  deposit_pct?: number;
  deposit_due?: string;
  balance_due?: string;
  merch_split?: string;
  merch_seller?: string;
  comps?: number;
  artist_comps?: number;
  marketing_comps?: number;
  // Ticket scaling
  ticket_scaling?: TicketScalingRow[];
  // Expenses
  fixed_expenses?: ExpenseItem[];
  variable_expenses?: VariableExpenseItem[];
  total_fixed?: number;
  total_variable?: number;
  total_expenses?: number;
  // Revenue
  gross_potential?: number;
  adj_gross?: number;
  tax_rate?: number;
  net_potential?: number;
  splitpoint?: number;
  artist_backend?: number;
  // Offer validity
  offer_valid_days?: number;
};

export async function exportOfferPDF(data: OfferPdfData, venue: Venue | null): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: [PAGE_WIDTH, PAGE_HEIGHT], compress: true });

  const venueSlug = venue?.slug || "";
  const venueName = String(data.venue || venue?.name || "Venue");
  const venueAddr = String(data.venue_address || [venue?.address_street, venue?.address_city, venue?.address_state, venue?.address_zip].filter(Boolean).join(", ") || "");

  // ── HEADER ──
  let y = await addPdfHeader(doc, {
    title: "Artist Offer",
    venueName,
    venueAddress: venueAddr,
    venueSlug,
    showBuyerInfo: true,
    buyerInfo: {
      agency: data.agency,
      agent: data.agent_name,
      phone: data.agent_phone,
      email: data.agent_email,
      artist: data.artist_name,
    },
  });

  // ── Helpers ──
  const labelVal = (label: string, val: string) => {
    y = ensureSpace(doc, 6, y);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(60, 60, 60);
    doc.setFontSize(8);
    doc.text(`${label}:`, MARGIN + 3, y);
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(8.5);
    doc.text(val, MARGIN + 48, y);
    y += 4.5;
  };

  // ── VENUE INFO ──
  if (data.venue || data.venue_address) {
    y = drawSectionHeader(doc, "Venue", y);
    labelVal("Venue", String(data.venue || "—"));
    labelVal("Address", String(data.venue_address || "—"));
    if (data.venue_contact) labelVal("Contact", String(data.venue_contact));
    if (data.venue_phone) labelVal("Phone", String(data.venue_phone));
    if (data.venue_capacity) labelVal("Capacity", String(data.venue_capacity));
    y += 2;
  }

  // ── AGENCY / ARTIST ──
  y = drawSectionHeader(doc, "Agency / Artist", y);
  labelVal("Agency", String(data.agency || "—"));
  labelVal("Agent", String(data.agent_name || "—"));
  labelVal("Phone", String(data.agent_phone || "—"));
  labelVal("Email", String(data.agent_email || "—"));
  labelVal("Artist", String(data.artist_name || "—"));
  labelVal("Date", data.event_date ? new Date(String(data.event_date).slice(0, 10) + "T12:00:00").toLocaleDateString() : "TBD");
  labelVal("Shows", `${data.num_shows || 1}  |  Length: ${data.show_length || "—"}  |  Time: ${formatTime12hr(String(data.show_time || ""))}`);
  labelVal("Billing", String(data.billing || "—"));
  y += 2;

  // ── DEAL ──
  y = drawSectionHeader(doc, "Deal", y);
  labelVal("Guarantee", `$${Number(data.guarantee || 0).toLocaleString()}`);
  labelVal("Type", String(data.deal_type || "FLAT"));
  labelVal("Backend", `${data.backend_percentage || 0}%`);
  labelVal("Other Terms", String(data.other_terms || "—"));
  labelVal("Radius", `${data.radius_distance || "—"} mi  |  ${data.radius_days_prior || "—"} days prior  |  ${data.radius_days_after || "—"} days after`);
  labelVal("Production", String(data.production_by || "—"));
  labelVal("Deposit", `$${Number(data.deposit_amount || 0).toLocaleString()} (${data.deposit_pct || 0}%)  |  Due: ${data.deposit_due || "—"}`);
  labelVal("Balance", String(data.balance_due || "Day of Show"));
  labelVal("Merch", `${data.merch_split || "—"}  |  Sells: ${data.merch_seller || "—"}`);
  labelVal("Total Comps", String(data.comps || 0));
  labelVal("Artist Comps", String(data.artist_comps || 0));
  labelVal("Marketing Comps", String(data.marketing_comps || 0));
  y += 2;

  // ── TICKET SCALING ──
  const scaling = (data.ticket_scaling || []) as TicketScalingRow[];
  if (scaling.length > 0) {
    y = drawSectionHeader(doc, "Ticket Scaling", y);
    // Column headers
    y = ensureSpace(doc, 8, y);
    doc.setTextColor(80, 80, 80);
    doc.setFontSize(6.5);
    doc.setFont("helvetica", "bold");
    const cols = [MARGIN + 3, MARGIN + 32, MARGIN + 48, MARGIN + 62, MARGIN + 78, MARGIN + 98, MARGIN + 118, MARGIN + 138, MARGIN + 158, MARGIN + CONTENT_WIDTH - 3];
    const headers = ["Scaling", "# Seats", "Comps", "Kills", "Sellable", "Net Price", "Fac. Fee", "Tkt Fee", "Price", "Gross"];
    headers.forEach((h, i) => doc.text(h, cols[i], y));
    y += 4;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(0, 0, 0);
    for (const r of scaling) {
      y = ensureSpace(doc, 5, y);
      const facFee = r.facility_fee || 0;
      const tktFee = r.price - (r.net_price || 0) - facFee;
      const values = [
        r.name, String(r.seats), String(r.comps), String(r.kills), String(r.sellable_cap),
        `$${(r.net_price || 0).toFixed(2)}`, `$${facFee.toFixed(2)}`, `$${(tktFee > 0 ? tktFee : 0).toFixed(2)}`,
        `$${r.price?.toFixed(2)}`, `$${(r.sellable_cap * r.price).toLocaleString()}`
      ];
      values.forEach((v, i) => doc.text(v, cols[i], y));
      y += 4;
    }
    y += 2;
  }

  // ── EXPENSES (two columns) ──
  y = drawSectionHeader(doc, "Expenses", y);
  const fe = (data.fixed_expenses || []) as ExpenseItem[];
  const ve = (data.variable_expenses || []) as VariableExpenseItem[];
  const startExpY = y;

  // Fixed (left column)
  doc.setTextColor(80, 80, 80);
  doc.setFontSize(6.5);
  doc.setFont("helvetica", "bold");
  doc.text("Fixed Expenses", MARGIN + 3, y);
  doc.text("Est.", MARGIN + 55, y);
  y += 4;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(0, 0, 0);
  for (const e of fe) {
    if (e.amount > 0) {
      y = ensureSpace(doc, 4, y);
      doc.text(e.name, MARGIN + 3, y);
      doc.text(`$${e.amount.toFixed(2)}`, MARGIN + 55, y);
      y += 3.5;
    }
  }
  doc.setFont("helvetica", "bold");
  doc.text("Fixed Total", MARGIN + 3, y);
  doc.text(`$${Number(data.total_fixed || 0).toFixed(2)}`, MARGIN + 55, y);
  doc.setFont("helvetica", "normal");
  const fixedEndY = y + 5;

  // Variable (right column)
  y = startExpY;
  const rightCol = MARGIN + CONTENT_WIDTH / 2 + 5;
  doc.setTextColor(80, 80, 80);
  doc.setFontSize(6.5);
  doc.setFont("helvetica", "bold");
  doc.text("Variable Expenses", rightCol, y);
  doc.text("Rate", rightCol + 50, y);
  doc.text("$", rightCol + 65, y);
  y += 4;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(0, 0, 0);
  for (const e of ve) {
    if (e.amount > 0) {
      y = ensureSpace(doc, 4, y);
      doc.text(e.name, rightCol, y);
      doc.text(`${(e.rate * 100).toFixed(2)}%`, rightCol + 50, y);
      doc.text(`$${e.amount.toFixed(2)}`, rightCol + 65, y);
      y += 3.5;
    }
  }
  doc.setFont("helvetica", "bold");
  doc.text("Variable Total", rightCol, y);
  doc.text(`$${Number(data.total_variable || 0).toFixed(2)}`, rightCol + 65, y);
  doc.setFont("helvetica", "normal");

  y = Math.max(fixedEndY, y + 5) + 2;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text(`Total Expenses:  $${Number(data.total_expenses || 0).toLocaleString()}`, MARGIN + 3, y);
  doc.setFont("helvetica", "normal");
  y += 6;

  // ── REVENUE BREAKDOWN ──
  y = drawSectionHeader(doc, "Revenue Breakdown", y);
  const totalSellable = scaling.reduce((s: number, r: TicketScalingRow) => s + (r.sellable_cap || 0), 0);
  const pdfFacilityFee = scaling.length > 0 ? (scaling[0] as TicketScalingRow).facility_fee || 0 : 0;
  const pdfTicketingFee = scaling.length > 0 ? ((scaling[0] as TicketScalingRow).price - (scaling[0] as TicketScalingRow).net_price - pdfFacilityFee) : 0;
  const totalFacilityFeeRevenue = totalSellable * pdfFacilityFee;
  const totalTicketingFeeRevenue = totalSellable * pdfTicketingFee;

  labelVal("Facility Fee (per ticket)", `$${pdfFacilityFee.toFixed(2)}`);
  labelVal("Total Facility Fee Revenue", `$${totalFacilityFeeRevenue.toLocaleString("en-US", { minimumFractionDigits: 2 })}`);
  labelVal("Ticketing Fee (per ticket)", `$${pdfTicketingFee.toFixed(2)}`);
  labelVal("Total Ticketing Fee Revenue", `$${totalTicketingFeeRevenue.toLocaleString("en-US", { minimumFractionDigits: 2 })}`);
  labelVal("Combined Fee Revenue", `$${(totalFacilityFeeRevenue + totalTicketingFeeRevenue).toLocaleString("en-US", { minimumFractionDigits: 2 })}`);
  y += 2;

  // ── POTENTIAL AT SELLOUT ──
  y = drawSectionHeader(doc, "Potential at Sellout", y);
  labelVal("Gross Potential", `$${Number(data.gross_potential || 0).toLocaleString()}`);
  labelVal("Adj. Gross", `$${Number(data.adj_gross || 0).toLocaleString()}`);
  const taxPct = Number(data.tax_rate || 0) * 100;
  labelVal(`Tax (${taxPct.toFixed(1)}%)`, `$${(Number(data.adj_gross || 0) * Number(data.tax_rate || 0)).toFixed(2)}`);
  labelVal("Net Potential", `$${Number(data.net_potential || 0).toLocaleString()}`);
  labelVal("Total Expenses", `$${Number(data.total_expenses || 0).toLocaleString()}`);
  if (data.deal_type !== "FLAT") labelVal("Splitpoint", `$${Number(data.splitpoint || 0).toLocaleString()}`);
  y += 2;

  // ── ARTIST POTENTIAL ──
  y = drawSectionHeader(doc, "Artist Potential at Sellout", y);
  labelVal("Guarantee", `$${Number(data.guarantee || 0).toLocaleString()}`);
  if (data.deal_type !== "FLAT") labelVal("Backend", `$${Number(data.artist_backend || 0).toLocaleString()}`);
  y += 5;

  // ── FOOTER ──
  y = ensureSpace(doc, 10, y);
  doc.setFontSize(7);
  doc.setTextColor(120, 120, 120);
  doc.text(`Offer Good for ${data.offer_valid_days || 14} days from Today     ${new Date().toLocaleDateString()}`, MARGIN + 3, y);

  drawFooter(doc, "Artist Offer");

  // Save
  const dateStr = data.event_date
    ? new Date(String(data.event_date).slice(0, 10) + "T12:00:00").toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" }).replace(/\//g, ".")
    : "TBD";
  const city = venue?.address_city || "City";
  const state = venue?.address_state || "ST";
  doc.save(`${sanitize(String(data.artist_name || "Offer"))}.${dateStr}.${city},${state}.pdf`);
}

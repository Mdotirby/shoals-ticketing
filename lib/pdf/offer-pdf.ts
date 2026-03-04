/**
 * Offer PDF Generator — compact single-page layout.
 * Uses shared header utility with compact mode.
 */
import type { TicketScalingRow, ExpenseItem, VariableExpenseItem } from "../types/offer";
import type { Venue } from "../types/venue";
import {
  addPdfHeader, drawFooter, drawCompactSectionHeader,
  sanitize, formatTime12hr,
  MARGIN, PAGE_WIDTH, PAGE_HEIGHT, CONTENT_WIDTH, DARK, GOLD, MID_GRAY, LIGHT_GRAY,
  type Doc,
} from "./pdf-header";

export type OfferPdfData = {
  // Venue (event venue, not promoter)
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
  const venueName = String(venue?.name || data.venue || "Venue");
  const venueAddr = String(
    [venue?.address_street, venue?.address_city, venue?.address_state, venue?.address_zip]
      .filter(Boolean).join(", ") || data.venue_address || ""
  );

  // ── COMPACT HEADER (promoter/buyer info, NOT agent info) ──
  let y = await addPdfHeader(doc, {
    title: "Artist Offer",
    venueName,
    venueAddress: venueAddr,
    venueSlug,
    logoUrl: venue?.logo_url,
    compact: true,
    showTitle: false,
    showBuyerInfo: true,
    buyerInfo: {
      company: venue?.name || String(data.venue || ""),
      contact: venue?.buyer_name || data.venue_contact || undefined,
      phone: venue?.buyer_phone || data.venue_phone || undefined,
      email: venue?.buyer_email || undefined,
    },
  });

  // ── Compact label:value helper ──
  const LABEL_FONT = 7;
  const VALUE_FONT = 7.5;
  const ROW_H = 3.8;

  const labelVal = (label: string, val: string, x: number, yPos: number, labelW: number = 38): number => {
    doc.setFont("helvetica", "normal");
    doc.setTextColor(80, 80, 80);
    doc.setFontSize(LABEL_FONT);
    doc.text(`${label}:`, x, yPos);
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(VALUE_FONT);
    doc.text(val, x + labelW, yPos);
    return yPos + ROW_H;
  };

  // ── Full-width label:value (for single-column sections) ──
  const labelValFull = (label: string, val: string): void => {
    doc.setFont("helvetica", "normal");
    doc.setTextColor(80, 80, 80);
    doc.setFontSize(LABEL_FONT);
    doc.text(`${label}:`, MARGIN + 2, y);
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(VALUE_FONT);
    doc.text(val, MARGIN + 38, y);
    y += ROW_H;
  };

  const halfW = CONTENT_WIDTH / 2 - 2;
  const leftX = MARGIN + 2;
  const rightX = MARGIN + halfW + 4;

  // ════════════════════════════════════════════════════════
  //  VENUE + AGENCY/ARTIST — side by side
  // ════════════════════════════════════════════════════════
  // Left: Venue header
  y = drawCompactSectionHeader(doc, "Venue", y, halfW);
  // Right: Agency/Artist header (at same Y)
  const savedY = y;
  doc.setFillColor(...DARK);
  doc.rect(rightX - 2, y - 8, halfW, 6, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...GOLD);
  doc.text("AGENCY / ARTIST", rightX, y - 3.8);
  doc.setTextColor(...DARK);

  // Left column: Venue info
  let leftY = y;
  leftY = labelVal("Venue", String(data.venue || "—"), leftX, leftY, 32);
  leftY = labelVal("Address", String(data.venue_address || "—"), leftX, leftY, 32);
  if (data.venue_contact) leftY = labelVal("Contact", String(data.venue_contact), leftX, leftY, 32);
  if (data.venue_phone) leftY = labelVal("Phone", String(data.venue_phone), leftX, leftY, 32);
  if (data.venue_capacity) leftY = labelVal("Capacity", String(data.venue_capacity), leftX, leftY, 32);

  // Right column: Agency/Artist info
  let rightY = savedY;
  rightY = labelVal("Artist", String(data.artist_name || "—"), rightX, rightY, 28);
  rightY = labelVal("Agency", String(data.agency || "—"), rightX, rightY, 28);
  rightY = labelVal("Agent", String(data.agent_name || "—"), rightX, rightY, 28);
  rightY = labelVal("Phone", String(data.agent_phone || "—"), rightX, rightY, 28);
  rightY = labelVal("Email", String(data.agent_email || "—"), rightX, rightY, 28);
  const dateStr = data.event_date
    ? new Date(String(data.event_date).slice(0, 10) + "T12:00:00").toLocaleDateString()
    : "TBD";
  rightY = labelVal("Date", dateStr, rightX, rightY, 28);
  rightY = labelVal("Shows", `${data.num_shows || 1} | ${data.show_length || "—"} | ${formatTime12hr(String(data.show_time || ""))}`, rightX, rightY, 28);
  rightY = labelVal("Billing", String(data.billing || "—"), rightX, rightY, 28);

  y = Math.max(leftY, rightY) + 2;

  // ════════════════════════════════════════════════════════
  //  DEAL — two sub-columns
  // ════════════════════════════════════════════════════════
  y = drawCompactSectionHeader(doc, "Deal", y);

  // Left sub-column
  let dealLeftY = y;
  dealLeftY = labelVal("Guarantee", `$${Number(data.guarantee || 0).toLocaleString()}`, leftX, dealLeftY, 34);
  dealLeftY = labelVal("Deal Type", String(data.deal_type || "FLAT"), leftX, dealLeftY, 34);
  dealLeftY = labelVal("Backend", `${data.backend_percentage || 0}%`, leftX, dealLeftY, 34);
  dealLeftY = labelVal("Radius", `${data.radius_distance || "—"} mi | ${data.radius_days_prior || "—"}d prior | ${data.radius_days_after || "—"}d after`, leftX, dealLeftY, 34);
  dealLeftY = labelVal("Production", String(data.production_by || "—"), leftX, dealLeftY, 34);
  dealLeftY = labelVal("Other", String(data.other_terms || "—"), leftX, dealLeftY, 34);

  // Right sub-column
  let dealRightY = y;
  dealRightY = labelVal("Deposit", `$${Number(data.deposit_amount || 0).toLocaleString()} (${data.deposit_pct || 0}%) | Due: ${data.deposit_due || "—"}`, rightX, dealRightY, 28);
  dealRightY = labelVal("Balance", String(data.balance_due || "Day of Show"), rightX, dealRightY, 28);
  dealRightY = labelVal("Merch", `${data.merch_split || "—"} | Sells: ${data.merch_seller || "—"}`, rightX, dealRightY, 28);
  dealRightY = labelVal("Total Comps", String(data.comps || 0), rightX, dealRightY, 28);
  dealRightY = labelVal("Artist Comps", String(data.artist_comps || 0), rightX, dealRightY, 28);
  dealRightY = labelVal("Mktg Comps", String(data.marketing_comps || 0), rightX, dealRightY, 28);

  y = Math.max(dealLeftY, dealRightY) + 2;

  // ════════════════════════════════════════════════════════
  //  TICKET SCALING — compact table
  // ════════════════════════════════════════════════════════
  const scaling = (data.ticket_scaling || []) as TicketScalingRow[];
  if (scaling.length > 0) {
    y = drawCompactSectionHeader(doc, "Ticket Scaling", y);

    // Column positions
    const tCols = [
      MARGIN + 2,    // Tier name
      MARGIN + 26,   // Seats
      MARGIN + 40,   // Comps
      MARGIN + 52,   // Kills
      MARGIN + 64,   // Sellable
      MARGIN + 80,   // Net Price
      MARGIN + 98,   // Fac. Fee
      MARGIN + 116,  // Tkt Fee
      MARGIN + 134,  // Price
      MARGIN + 152,  // Gross
    ];
    const tHeaders = ["Tier", "Seats", "Comps", "Kills", "Sell", "Net $", "Fac Fee", "Tkt Fee", "Price", "Gross"];

    // Header row with background
    doc.setFillColor(...LIGHT_GRAY);
    doc.rect(MARGIN, y - 1.5, CONTENT_WIDTH, 4, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6);
    doc.setTextColor(80, 80, 80);
    tHeaders.forEach((h, i) => doc.text(h, tCols[i], y + 1));
    y += 4;

    // Data rows
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(0, 0, 0);
    for (const r of scaling) {
      const facFee = r.facility_fee || 0;
      const tktFee = r.price - (r.net_price || 0) - facFee;
      const values = [
        r.name, String(r.seats), String(r.comps), String(r.kills), String(r.sellable_cap),
        `$${(r.net_price || 0).toFixed(2)}`, `$${facFee.toFixed(2)}`, `$${(tktFee > 0 ? tktFee : 0).toFixed(2)}`,
        `$${r.price?.toFixed(2)}`, `$${(r.sellable_cap * r.price).toLocaleString()}`
      ];
      values.forEach((v, i) => doc.text(v, tCols[i], y));
      y += 3.5;
    }
    y += 1;
  }

  // ════════════════════════════════════════════════════════
  //  EXPENSES — two columns (fixed left, variable right)
  // ════════════════════════════════════════════════════════
  y = drawCompactSectionHeader(doc, "Expenses", y);
  const fe = (data.fixed_expenses || []) as ExpenseItem[];
  const ve = (data.variable_expenses || []) as VariableExpenseItem[];
  const expStartY = y;

  // ── Fixed Expenses (left column) ──
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6);
  doc.setTextColor(80, 80, 80);
  doc.text("FIXED", leftX, y);
  doc.text("Est.", leftX + 52, y);
  let fixY = y + 3;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(0, 0, 0);
  for (const e of fe) {
    if (e.amount > 0) {
      doc.text(e.name, leftX, fixY);
      doc.text(`$${e.amount.toFixed(0)}`, leftX + 52, fixY);
      fixY += 3;
    }
  }
  doc.setFont("helvetica", "bold");
  doc.text("Fixed Total", leftX, fixY);
  doc.text(`$${Number(data.total_fixed || 0).toLocaleString()}`, leftX + 52, fixY);
  fixY += 3;

  // ── Variable Expenses (right column) ──
  let varY = expStartY;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6);
  doc.setTextColor(80, 80, 80);
  doc.text("VARIABLE", rightX, varY);
  doc.text("Rate", rightX + 45, varY);
  doc.text("$", rightX + 60, varY);
  varY += 3;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(0, 0, 0);
  for (const e of ve) {
    if (e.amount > 0) {
      doc.text(e.name, rightX, varY);
      doc.text(`${(e.rate * 100).toFixed(2)}%`, rightX + 45, varY);
      doc.text(`$${e.amount.toFixed(0)}`, rightX + 60, varY);
      varY += 3;
    }
  }
  doc.setFont("helvetica", "bold");
  doc.text("Variable Total", rightX, varY);
  doc.text(`$${Number(data.total_variable || 0).toLocaleString()}`, rightX + 60, varY);
  varY += 3;

  y = Math.max(fixY, varY) + 1;

  // Total expenses bar
  doc.setFillColor(...GOLD);
  doc.rect(MARGIN, y - 1, CONTENT_WIDTH, 5, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...DARK);
  doc.text(`Total Expenses:  $${Number(data.total_expenses || 0).toLocaleString()}`, MARGIN + 3, y + 2.5);
  y += 7;

  // ════════════════════════════════════════════════════════
  //  REVENUE BREAKDOWN + POTENTIAL AT SELLOUT — side by side
  // ════════════════════════════════════════════════════════

  // Left: Revenue Breakdown header
  y = drawCompactSectionHeader(doc, "Revenue Breakdown", y, halfW);
  const revSavedY = y;
  // Right: Potential at Sellout header
  doc.setFillColor(...DARK);
  doc.rect(rightX - 2, y - 8, halfW, 6, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...GOLD);
  doc.text("POTENTIAL AT SELLOUT", rightX, y - 3.8);
  doc.setTextColor(...DARK);

  // Left: Revenue Breakdown
  const totalSellable = scaling.reduce((s: number, r: TicketScalingRow) => s + (r.sellable_cap || 0), 0);
  const pdfFacilityFee = scaling.length > 0 ? (scaling[0] as TicketScalingRow).facility_fee || 0 : 0;
  const pdfTicketingFee = scaling.length > 0 ? ((scaling[0] as TicketScalingRow).price - (scaling[0] as TicketScalingRow).net_price - pdfFacilityFee) : 0;
  const totalFacilityFeeRevenue = totalSellable * pdfFacilityFee;
  const totalTicketingFeeRevenue = totalSellable * pdfTicketingFee;

  let revY = y;
  revY = labelVal("Fac Fee/tkt", `$${pdfFacilityFee.toFixed(2)}`, leftX, revY, 36);
  revY = labelVal("Total Fac Fee", `$${totalFacilityFeeRevenue.toLocaleString("en-US", { minimumFractionDigits: 2 })}`, leftX, revY, 36);
  revY = labelVal("Tkt Fee/tkt", `$${pdfTicketingFee.toFixed(2)}`, leftX, revY, 36);
  revY = labelVal("Total Tkt Fee", `$${totalTicketingFeeRevenue.toLocaleString("en-US", { minimumFractionDigits: 2 })}`, leftX, revY, 36);
  revY = labelVal("Combined Fees", `$${(totalFacilityFeeRevenue + totalTicketingFeeRevenue).toLocaleString("en-US", { minimumFractionDigits: 2 })}`, leftX, revY, 36);

  // Right: Potential at Sellout
  let potY = revSavedY;
  potY = labelVal("Gross Potential", `$${Number(data.gross_potential || 0).toLocaleString()}`, rightX, potY, 36);
  potY = labelVal("Adj. Gross", `$${Number(data.adj_gross || 0).toLocaleString()}`, rightX, potY, 36);
  const taxPct = Number(data.tax_rate || 0) * 100;
  potY = labelVal(`Tax (${taxPct.toFixed(1)}%)`, `$${(Number(data.adj_gross || 0) * Number(data.tax_rate || 0)).toFixed(2)}`, rightX, potY, 36);
  potY = labelVal("Net Potential", `$${Number(data.net_potential || 0).toLocaleString()}`, rightX, potY, 36);
  potY = labelVal("Total Expenses", `$${Number(data.total_expenses || 0).toLocaleString()}`, rightX, potY, 36);
  if (data.deal_type !== "FLAT") {
    potY = labelVal("Splitpoint", `$${Number(data.splitpoint || 0).toLocaleString()}`, rightX, potY, 36);
  }

  y = Math.max(revY, potY) + 2;

  // ════════════════════════════════════════════════════════
  //  ARTIST POTENTIAL AT SELLOUT — compact
  // ════════════════════════════════════════════════════════
  y = drawCompactSectionHeader(doc, "Artist Potential at Sellout", y);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(...DARK);
  doc.text(`Guarantee: $${Number(data.guarantee || 0).toLocaleString()}`, leftX, y);
  if (data.deal_type !== "FLAT") {
    doc.text(`Backend (${data.deal_type}): $${Number(data.artist_backend || 0).toLocaleString()}`, rightX, y);
  }
  y += 5;

  // ════════════════════════════════════════════════════════
  //  FOOTER — offer validity
  // ════════════════════════════════════════════════════════
  doc.setDrawColor(...MID_GRAY);
  doc.setLineWidth(0.2);
  doc.line(MARGIN, y, MARGIN + CONTENT_WIDTH, y);
  y += 3;
  doc.setFontSize(6.5);
  doc.setTextColor(120, 120, 120);
  doc.text(
    `Offer valid for ${data.offer_valid_days || 14} days from ${new Date().toLocaleDateString()}`,
    MARGIN + 2, y
  );

  drawFooter(doc, "Artist Offer");

  // Save
  const fileDateStr = data.event_date
    ? new Date(String(data.event_date).slice(0, 10) + "T12:00:00").toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" }).replace(/\//g, ".")
    : "TBD";
  const city = venue?.address_city || "City";
  const state = venue?.address_state || "ST";
  doc.save(`${sanitize(String(data.artist_name || "Offer"))}.${fileDateStr}.${city},${state}.pdf`);
}

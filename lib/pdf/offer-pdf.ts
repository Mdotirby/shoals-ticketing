/**
 * Offer PDF Generator — original multi-page full-width layout.
 * Each section gets its own full-width dark header bar.
 * Uses ensureSpace() for automatic page breaks.
 */
import type { TicketScalingRow, ExpenseItem, VariableExpenseItem } from "../types/offer";
import type { Venue } from "../types/venue";
import {
  addPdfHeader, drawFooter, drawSectionHeader, ensureSpace,
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
  const venueName = String(data.venue || venue?.name || "Venue");
  const venueAddr = String(
    data.venue_address || [venue?.address_street, venue?.address_city, venue?.address_state, venue?.address_zip]
      .filter(Boolean).join(", ") || ""
  );

  // ── HEADER (keep existing compact header) ──
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

  // ── Font constants (readable multi-page sizes) ──
  const LABEL_FONT = 9;
  const VALUE_FONT = 10;
  const ROW_H = 5.5;

  // Label-value positions (full-width single column)
  const labelX = MARGIN + 3;
  const valueX = MARGIN + 50;
  const maxValueW = CONTENT_WIDTH - 50 - 3;

  /**
   * Draw a label:value row at full width with text wrapping.
   * Returns the new Y position.
   */
  const labelVal = (label: string, val: string, yPos: number): number => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(VALUE_FONT);
    const lines: string[] = doc.splitTextToSize(val || "—", maxValueW);
    const totalH = Math.max(ROW_H, lines.length * ROW_H);
    yPos = ensureSpace(doc, totalH + 1, yPos);

    // Label
    doc.setFont("helvetica", "bold");
    doc.setFontSize(LABEL_FONT);
    doc.setTextColor(80, 80, 80);
    doc.text(`${label}:`, labelX, yPos);

    // Value
    doc.setFont("helvetica", "normal");
    doc.setFontSize(VALUE_FONT);
    doc.setTextColor(0, 0, 0);
    for (let i = 0; i < lines.length; i++) {
      doc.text(lines[i], valueX, yPos + i * ROW_H);
    }
    return yPos + totalH;
  };

  // ════════════════════════════════════════════════════════
  //  VENUE — full-width section
  // ════════════════════════════════════════════════════════
  y = drawSectionHeader(doc, "Venue", y);
  y = labelVal("Venue", String(data.venue || "—"), y);
  y = labelVal("Address", String(data.venue_address || "—"), y);
  if (data.venue_contact) y = labelVal("Contact", String(data.venue_contact), y);
  if (data.venue_phone) y = labelVal("Phone", String(data.venue_phone), y);
  if (data.venue_capacity) y = labelVal("Capacity", String(data.venue_capacity), y);
  y += 2;

  // ════════════════════════════════════════════════════════
  //  AGENCY / ARTIST — full-width section
  // ════════════════════════════════════════════════════════
  y = drawSectionHeader(doc, "Agency / Artist", y);
  y = labelVal("Artist", String(data.artist_name || "—"), y);
  y = labelVal("Agency", String(data.agency || "—"), y);
  y = labelVal("Agent", String(data.agent_name || "—"), y);
  y = labelVal("Phone", String(data.agent_phone || "—"), y);
  y = labelVal("Email", String(data.agent_email || "—"), y);
  const dateStr = data.event_date
    ? new Date(String(data.event_date).slice(0, 10) + "T12:00:00").toLocaleDateString()
    : "TBD";
  y = labelVal("Date", dateStr, y);
  y = labelVal("# of Shows", String(data.num_shows || 1), y);
  y = labelVal("Show Length", String(data.show_length || "—"), y);
  y = labelVal("Show Time", formatTime12hr(String(data.show_time || "")) || "—", y);
  y = labelVal("Billing", String(data.billing || "—"), y);
  y += 2;

  // ════════════════════════════════════════════════════════
  //  DEAL — full-width section, single column
  // ════════════════════════════════════════════════════════
  y = drawSectionHeader(doc, "Deal", y);
  y = labelVal("Guarantee", `$${Number(data.guarantee || 0).toLocaleString()}`, y);
  y = labelVal("Deal Type", String(data.deal_type || "FLAT"), y);
  y = labelVal("Backend %", `${data.backend_percentage || 0}%`, y);
  y = labelVal("Radius", `${data.radius_distance || "—"} miles  |  ${data.radius_days_prior || "—"} days prior  |  ${data.radius_days_after || "—"} days after`, y);
  y = labelVal("Production By", String(data.production_by || "—"), y);
  y = labelVal("Other Terms", String(data.other_terms || "—"), y);
  y = labelVal("Deposit", `$${Number(data.deposit_amount || 0).toLocaleString()} (${data.deposit_pct || 0}%)`, y);
  y = labelVal("Deposit Due", String(data.deposit_due || "—"), y);
  y = labelVal("Balance Due", String(data.balance_due || "Day of Show"), y);
  y = labelVal("Merch Split", String(data.merch_split || "—"), y);
  y = labelVal("Merch Seller", String(data.merch_seller || "—"), y);
  y = labelVal("Total Comps", String(data.comps || 0), y);
  y = labelVal("Artist Comps", String(data.artist_comps || 0), y);
  y = labelVal("Marketing Comps", String(data.marketing_comps || 0), y);
  y += 2;

  // ════════════════════════════════════════════════════════
  //  TICKET SCALING — full-width table
  // ════════════════════════════════════════════════════════
  const scaling = (data.ticket_scaling || []) as TicketScalingRow[];
  if (scaling.length > 0) {
    y = drawSectionHeader(doc, "Ticket Scaling", y);

    // Column positions across full width
    const tCols = [
      MARGIN + 2,    // Tier name
      MARGIN + 38,   // Seats
      MARGIN + 54,   // Comps
      MARGIN + 68,   // Kills
      MARGIN + 82,   // Sellable
      MARGIN + 100,  // Net Price
      MARGIN + 118,  // Fac. Fee
      MARGIN + 136,  // Tkt Fee
      MARGIN + 152,  // Price
      MARGIN + 168,  // Gross
    ];
    const tHeaders = ["Scaling", "# Seats", "Comps", "Kills", "Sellable", "Net Price", "Fac. Fee", "Tkt Fee", "Price", "Gross"];

    // Header row with background
    y = ensureSpace(doc, 10, y);
    doc.setFillColor(...LIGHT_GRAY);
    doc.rect(MARGIN, y - 2, CONTENT_WIDTH, 6, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(80, 80, 80);
    tHeaders.forEach((h, i) => doc.text(h, tCols[i], y + 2));
    y += 7;

    // Data rows
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(0, 0, 0);
    const tierMaxW = tCols[1] - tCols[0] - 2;
    for (const r of scaling) {
      y = ensureSpace(doc, ROW_H + 1, y);
      const facFee = r.facility_fee || 0;
      const tktFee = r.price - (r.net_price || 0) - facFee;
      const tierName = doc.splitTextToSize(r.name, tierMaxW)[0] || r.name;
      const values = [
        tierName, String(r.seats), String(r.comps), String(r.kills), String(r.sellable_cap),
        `$${(r.net_price || 0).toFixed(2)}`, `$${facFee.toFixed(2)}`, `$${(tktFee > 0 ? tktFee : 0).toFixed(2)}`,
        `$${r.price?.toFixed(2)}`, `$${(r.sellable_cap * r.price).toLocaleString()}`
      ];
      values.forEach((v, i) => doc.text(v, tCols[i], y));
      y += ROW_H;
    }
    y += 3;
  }

  // ════════════════════════════════════════════════════════
  //  EXPENSES — two columns (fixed left, variable right)
  // ════════════════════════════════════════════════════════
  y = drawSectionHeader(doc, "Expenses", y);
  const fe = (data.fixed_expenses || []) as ExpenseItem[];
  const ve = (data.variable_expenses || []) as VariableExpenseItem[];

  const halfW = CONTENT_WIDTH / 2 - 2;
  const leftX = MARGIN + 2;
  const rightX = MARGIN + halfW + 6;
  const expStartY = y;

  // ── Fixed Expenses (left column) ──
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(80, 80, 80);
  doc.text("FIXED EXPENSES", leftX, y);
  doc.text("Est.", leftX + 68, y);
  let fixY = y + ROW_H;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(0, 0, 0);
  for (const e of fe) {
    if (e.amount > 0) {
      fixY = ensureSpace(doc, ROW_H + 1, fixY);
      const name = doc.splitTextToSize(e.name, 64)[0] || e.name;
      doc.text(name, leftX, fixY);
      doc.text(`$${e.amount.toLocaleString()}`, leftX + 68, fixY);
      fixY += ROW_H;
    }
  }
  fixY += 1;
  doc.setFont("helvetica", "bold");
  doc.text("Fixed Total", leftX, fixY);
  doc.text(`$${Number(data.total_fixed || 0).toLocaleString()}`, leftX + 68, fixY);
  fixY += ROW_H;

  // ── Variable Expenses (right column) ──
  let varY = expStartY;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(80, 80, 80);
  doc.text("VARIABLE EXPENSES", rightX, varY);
  doc.text("Rate", rightX + 55, varY);
  doc.text("$", rightX + 72, varY);
  varY += ROW_H;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(0, 0, 0);
  for (const e of ve) {
    if (e.amount > 0) {
      varY = ensureSpace(doc, ROW_H + 1, varY);
      const name = doc.splitTextToSize(e.name, 52)[0] || e.name;
      doc.text(name, rightX, varY);
      doc.text(`${(e.rate * 100).toFixed(2)}%`, rightX + 55, varY);
      doc.text(`$${e.amount.toLocaleString()}`, rightX + 72, varY);
      varY += ROW_H;
    }
  }
  varY += 1;
  doc.setFont("helvetica", "bold");
  doc.text("Variable Total", rightX, varY);
  doc.text(`$${Number(data.total_variable || 0).toLocaleString()}`, rightX + 72, varY);
  varY += ROW_H;

  // Next section after taller expenses column
  y = Math.max(fixY, varY) + 3;

  // Total expenses highlight bar
  y = ensureSpace(doc, 10, y);
  doc.setFillColor(...GOLD);
  doc.rect(MARGIN, y - 1, CONTENT_WIDTH, 8, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...DARK);
  doc.text(`Total Expenses:  $${Number(data.total_expenses || 0).toLocaleString()}`, MARGIN + 4, y + 4.5);
  y += 12;

  // ════════════════════════════════════════════════════════
  //  REVENUE BREAKDOWN — full-width section
  // ════════════════════════════════════════════════════════
  y = drawSectionHeader(doc, "Revenue Breakdown", y);
  const totalSellable = scaling.reduce((s: number, r: TicketScalingRow) => s + (r.sellable_cap || 0), 0);
  const pdfFacilityFee = scaling.length > 0 ? (scaling[0] as TicketScalingRow).facility_fee || 0 : 0;
  const pdfTicketingFee = scaling.length > 0 ? ((scaling[0] as TicketScalingRow).price - (scaling[0] as TicketScalingRow).net_price - pdfFacilityFee) : 0;
  const totalFacilityFeeRevenue = totalSellable * pdfFacilityFee;
  const totalTicketingFeeRevenue = totalSellable * pdfTicketingFee;

  y = labelVal("Facility Fee / Ticket", `$${pdfFacilityFee.toFixed(2)}`, y);
  y = labelVal("Total Facility Fee Revenue", `$${totalFacilityFeeRevenue.toLocaleString("en-US", { minimumFractionDigits: 2 })}`, y);
  y = labelVal("Ticketing Fee / Ticket", `$${pdfTicketingFee.toFixed(2)}`, y);
  y = labelVal("Total Ticketing Fee Revenue", `$${totalTicketingFeeRevenue.toLocaleString("en-US", { minimumFractionDigits: 2 })}`, y);
  y = labelVal("Combined Fee Revenue", `$${(totalFacilityFeeRevenue + totalTicketingFeeRevenue).toLocaleString("en-US", { minimumFractionDigits: 2 })}`, y);
  y += 2;

  // ════════════════════════════════════════════════════════
  //  POTENTIAL AT SELLOUT — full-width section
  // ════════════════════════════════════════════════════════
  y = drawSectionHeader(doc, "Potential at Sellout", y);
  y = labelVal("Gross Potential", `$${Number(data.gross_potential || 0).toLocaleString()}`, y);
  y = labelVal("Adjusted Gross", `$${Number(data.adj_gross || 0).toLocaleString()}`, y);
  const taxPct = Number(data.tax_rate || 0) * 100;
  y = labelVal(`Tax (${taxPct.toFixed(1)}%)`, `$${(Number(data.adj_gross || 0) * Number(data.tax_rate || 0)).toFixed(2)}`, y);
  y = labelVal("Net Potential", `$${Number(data.net_potential || 0).toLocaleString()}`, y);
  y = labelVal("Total Expenses", `$${Number(data.total_expenses || 0).toLocaleString()}`, y);
  if (data.deal_type !== "FLAT") {
    y = labelVal("Splitpoint", `$${Number(data.splitpoint || 0).toLocaleString()}`, y);
  }
  y += 2;

  // ════════════════════════════════════════════════════════
  //  ARTIST POTENTIAL AT SELLOUT — full-width section
  // ════════════════════════════════════════════════════════
  y = drawSectionHeader(doc, "Artist Potential at Sellout", y);

  const guarantee = Number(data.guarantee || 0);
  const splitpoint = Number(data.splitpoint || 0);
  const backendPct = Number(data.backend_percentage || 0) / 100;
  const dealType = String(data.deal_type || "FLAT").toUpperCase();

  y = labelVal("Guarantee", `$${guarantee.toLocaleString()}`, y);

  if (dealType === "VS") {
    const backendVS = splitpoint * backendPct;
    const walkout = guarantee + backendVS;
    y = labelVal("Backend (VS)", `$${backendVS.toLocaleString("en-US", { minimumFractionDigits: 2 })}`, y);
    y = labelVal("Total Potential Walkout", `$${walkout.toLocaleString("en-US", { minimumFractionDigits: 2 })}`, y);
  } else if (dealType === "PLUS") {
    const backendPlus = splitpoint * backendPct;
    const walkout = guarantee + backendPlus;
    y = labelVal("Backend (PLUS)", `$${backendPlus.toLocaleString("en-US", { minimumFractionDigits: 2 })}`, y);
    y = labelVal("Total Potential Walkout", `$${walkout.toLocaleString("en-US", { minimumFractionDigits: 2 })}`, y);
  } else {
    // FLAT — no backend
    y = labelVal("Total Potential Walkout", `$${guarantee.toLocaleString("en-US", { minimumFractionDigits: 2 })}`, y);
  }
  y += 4;

  // ════════════════════════════════════════════════════════
  //  OFFER VALIDITY — ensure it's visible (not cut off)
  // ════════════════════════════════════════════════════════
  y = ensureSpace(doc, 14, y);
  doc.setDrawColor(...MID_GRAY);
  doc.setLineWidth(0.3);
  doc.line(MARGIN, y, MARGIN + CONTENT_WIDTH, y);
  y += 5;
  doc.setFont("helvetica", "italic");
  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  doc.text(
    `Offer valid for ${data.offer_valid_days || 14} days from today: ${new Date().toLocaleDateString()}`,
    MARGIN + 3, y
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

/**
 * Settlement PDF Generator — uses shared header utility.
 * Both Artist and Venue settlement exports.
 *
 * The PDF reflects exactly what the settlement page shows:
 *   • Ticket Audit (per-tier sold/comps/gross with comps EXCLUDED from gross)
 *   • Fee & Tax breakdown — Ticketing, Facility, CC, Tax — each as its own
 *     line item with per-ticket × ticket-count detail
 *   • Settlement calculation — deal-type-aware (FLAT / VS / PLUS / DOOR)
 *   • Venue P&L (venue PDF only)
 */
import type { Settlement, SettlementExpense, SettlementDeposit } from "../types/settlement";
import type { Venue } from "../types/venue";
import {
  addPdfHeader, drawFooter, ensureSpace, drawSectionHeader, drawRow, drawDivider,
  fmt, sanitize,
  MARGIN, PAGE_WIDTH, PAGE_HEIGHT, CONTENT_WIDTH, DARK, WHITE, LIGHT_GRAY,
  type Doc,
} from "./pdf-header";

// ── Types ────────────────────────────────────────────────────────────
type VenueInfo = {
  name: string;
  slug?: string;
  address_street?: string | null;
  address_city?: string | null;
  address_state?: string | null;
  address_zip?: string | null;
  buyer_phone?: string | null;
  buyer_email?: string | null;
};

type ExpenseRow = { name: string; category: string; actual_amount: number };
type DepositRow = { type: string; amount: number; date?: string; notes?: string };

function venueAddress(v: VenueInfo): string {
  return [v.address_street, v.address_city, v.address_state, v.address_zip].filter(Boolean).join(", ");
}

function drawSignatureLines(doc: Doc, y: number): number {
  y = ensureSpace(doc, 50, y);
  y = drawSectionHeader(doc, "Signatures", y);
  y += 5;

  const lineW = (CONTENT_WIDTH - 10) / 2;
  doc.setDrawColor(...DARK);
  doc.setLineWidth(0.4);

  // Left: Artist / Agent
  doc.line(MARGIN, y + 15, MARGIN + lineW, y + 15);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...DARK);
  doc.text("Artist / Agent", MARGIN, y + 20);
  doc.line(MARGIN, y + 32, MARGIN + lineW, y + 32);
  doc.text("Date", MARGIN, y + 37);

  // Right: Buyer / Promoter
  const rx = MARGIN + lineW + 10;
  doc.line(rx, y + 15, rx + lineW, y + 15);
  doc.text("Buyer / Promoter", rx, y + 20);
  doc.line(rx, y + 32, rx + lineW, y + 32);
  doc.text("Date", rx, y + 37);

  return y + 42;
}

// ── Ticket Audit Table ───────────────────────────────────────────────
function drawTicketAuditTable(doc: Doc, rows: Settlement["ticket_audit"], y: number): number {
  y = drawSectionHeader(doc, "Ticket Audit", y);
  const cols = ["Tier", "Cap", "Sold", "Comps", "% House", "Price", "Gross"];
  const colX = [
    MARGIN + 3, MARGIN + 50, MARGIN + 70, MARGIN + 90,
    MARGIN + 115, MARGIN + 140, MARGIN + CONTENT_WIDTH - 3,
  ];

  // Header row
  y = ensureSpace(doc, 8, y);
  doc.setFillColor(...LIGHT_GRAY);
  doc.rect(MARGIN, y, CONTENT_WIDTH, 7, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...DARK);
  cols.forEach((c, i) => {
    const align = i >= 1 ? "right" : undefined;
    doc.text(c, colX[i], y + 5, align ? { align } : undefined);
  });
  y += 8;

  // Data rows
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  let totalCap = 0, totalSold = 0, totalComps = 0, totalGross = 0;
  const tierNameMaxW = colX[1] - colX[0] - 5;

  for (const r of rows) {
    y = ensureSpace(doc, 7, y);
    const tierName: string = doc.splitTextToSize(r.tier, tierNameMaxW)[0] || r.tier;
    const pctHouse = r.capacity > 0 ? (r.sold / r.capacity) * 100 : 0;
    doc.text(tierName, colX[0], y + 4);
    doc.text(String(r.capacity), colX[1], y + 4, { align: "right" });
    doc.text(String(r.sold), colX[2], y + 4, { align: "right" });
    doc.text(String(r.comps), colX[3], y + 4, { align: "right" });
    doc.text(`${pctHouse.toFixed(1)}%`, colX[4], y + 4, { align: "right" });
    doc.text(fmt(r.price), colX[5], y + 4, { align: "right" });
    doc.text(fmt(r.gross), colX[6], y + 4, { align: "right" });
    totalCap += r.capacity;
    totalSold += r.sold;
    totalComps += r.comps;
    totalGross += r.gross;
    y += 6;
  }

  // Totals row
  y = ensureSpace(doc, 8, y);
  doc.setFillColor(...DARK);
  doc.rect(MARGIN, y, CONTENT_WIDTH, 7, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...WHITE);
  doc.text("TOTAL", colX[0], y + 5);
  doc.text(String(totalCap), colX[1], y + 5, { align: "right" });
  doc.text(String(totalSold), colX[2], y + 5, { align: "right" });
  doc.text(String(totalComps), colX[3], y + 5, { align: "right" });
  const overallPct = totalCap > 0 ? ((totalSold / totalCap) * 100).toFixed(1) + "%" : "—";
  doc.text(overallPct, colX[4], y + 5, { align: "right" });
  doc.text("", colX[5], y + 5);
  doc.text(fmt(totalGross), colX[6], y + 5, { align: "right" });
  doc.setTextColor(...DARK);

  y += 10;

  // Comps note
  if (totalComps > 0) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(7);
    doc.setTextColor(...DARK);
    doc.text(
      `* ${totalComps} comp ticket${totalComps === 1 ? "" : "s"} listed for inventory only — NOT included in gross.`,
      MARGIN + 3,
      y
    );
    y += 5;
  }

  return y + 2;
}

// ── Fee & Tax Breakdown ──────────────────────────────────────────────
function drawFeeTaxBreakdown(doc: Doc, s: Settlement, y: number): number {
  y = drawSectionHeader(doc, "Fees & Tax Collected", y);

  const ticketsSold = s.tickets_sold_count || 0;
  const tfPer = s.ticketing_fee_per_ticket || 0;
  const ffPer = s.facility_fee_per_ticket || 0;
  const ccPer = ticketsSold > 0 ? (s.cc_fees || 0) / ticketsSold : 0;

  const ticketLabel = `${ticketsSold} ticket${ticketsSold === 1 ? "" : "s"}`;

  y = drawRow(
    doc,
    `Ticketing Service Fee  (${fmt(tfPer)} × ${ticketLabel})`,
    fmt(s.ticketing_fees || 0),
    y,
    { indent: 4 }
  );
  if ((s.facility_fees || 0) > 0 || ffPer > 0) {
    y = drawRow(
      doc,
      `Facility Fee  (${fmt(ffPer)} × ${ticketLabel})`,
      fmt(s.facility_fees || 0),
      y,
      { indent: 4 }
    );
  }
  y = drawRow(
    doc,
    `CC / Processing Fee  (~${fmt(ccPer)} / ticket)`,
    fmt(s.cc_fees || 0),
    y,
    { indent: 4 }
  );
  const taxRatePct = ((s.tax_rate || 0) * 100).toFixed(2);
  const taxLabel =
    s.tax_method === "divisor"
      ? `Tax  (${taxRatePct}% — divided out of gross)`
      : `Tax  (${taxRatePct}% — added on top)`;
  y = drawRow(doc, taxLabel, fmt(s.taxes || 0), y, { indent: 4 });

  y = drawDivider(doc, y);
  const totalCollected =
    (s.ticketing_fees || 0) +
    (s.facility_fees || 0) +
    (s.cc_fees || 0) +
    (s.taxes || 0);
  y = drawRow(doc, "Total Fees + Tax Collected", fmt(totalCollected), y, { bold: true });
  y += 3;

  return y;
}

// ── Financial Summary ────────────────────────────────────────────────
//   Math chain (top-down):
//     Total Gross Receipts (face value)
//       − Ticketing Service Fees
//       − Facility Fees
//     = Adj. Gross
//       − Tax
//     = Net Receipts
//   CC fees + Total Customer Paid are shown below as reconciliation only.
function drawFinancialSummary(doc: Doc, s: Settlement, y: number): number {
  y = drawSectionHeader(doc, "Financial Summary", y);
  const ticketsSold = s.tickets_sold_count || 0;
  const totalCustomerPaid =
    (s.total_gross || 0) +
    (s.ticketing_fees || 0) +
    (s.facility_fees || 0) +
    (s.cc_fees || 0) +
    (s.taxes || 0);
  const taxRatePct = ((s.tax_rate || 0) * 100).toFixed(2);
  const taxMethodLabel =
    s.tax_method === "divisor" ? "divided out" : "added on top";

  y = drawRow(doc, "Tickets Sold (paying)", String(ticketsSold), y);
  y = drawRow(doc, "Total Gross Receipts (face value)", fmt(s.total_gross || 0), y, { bold: true });
  y = drawRow(doc, "− Ticketing Service Fees", `(${fmt(s.ticketing_fees || 0)})`, y, { indent: 4 });
  y = drawRow(doc, "− Facility Fees", `(${fmt(s.facility_fees || 0)})`, y, { indent: 4 });
  y = drawDivider(doc, y);
  y = drawRow(doc, "= Adj. Gross", fmt(s.adj_gross || 0), y, { bold: true });
  y = drawRow(
    doc,
    `− Tax (${taxRatePct}%, ${taxMethodLabel})`,
    `(${fmt(s.taxes || 0)})`,
    y,
    { indent: 4 }
  );
  y = drawDivider(doc, y);
  y = drawRow(doc, "= NET RECEIPTS", fmt(s.net_receipts || 0), y, { bold: true, highlight: true });
  y += 4;

  // Reconciliation — informational only, NOT part of the artist split.
  y = drawRow(doc, "(Reconciliation — informational)", "", y, { indent: 4 });
  y = drawRow(doc, "Total Customer Paid (incl. all fees + tax)", fmt(totalCustomerPaid), y, { indent: 8 });
  y = drawRow(doc, "CC / Processing Fees paid to Stripe", fmt(s.cc_fees || 0), y, { indent: 8 });
  if (ticketsSold > 0) {
    const perTicket = (s.total_gross || 0) / ticketsSold;
    y = drawRow(doc, "Avg. gross / ticket sold", fmt(perTicket), y, { indent: 8 });
  }
  y += 3;
  return y;
}

// ═════════════════════════════════════════════════════════════════════
//  ARTIST SETTLEMENT PDF
// ═════════════════════════════════════════════════════════════════════
export async function exportArtistSettlementPDF(
  settlement: Settlement,
  venue: Venue | VenueInfo,
  expenses: (SettlementExpense | ExpenseRow)[],
  deposits: (SettlementDeposit | DepositRow)[]
): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: [PAGE_WIDTH, PAGE_HEIGHT], compress: true });

  const v: VenueInfo = {
    name: venue.name,
    slug: (venue as Venue).slug ?? undefined,
    address_street: venue.address_street ?? undefined,
    address_city: venue.address_city ?? undefined,
    address_state: venue.address_state ?? undefined,
    address_zip: venue.address_zip ?? undefined,
    buyer_phone: (venue as Venue).buyer_phone ?? undefined,
    buyer_email: (venue as Venue).buyer_email ?? undefined,
  };

  const eventTitle = settlement.event_title ?? settlement.artist_name ?? "Event";
  const eventDate = settlement.event_date
    ? new Date(settlement.event_date).toLocaleDateString("en-US", {
        weekday: "short", month: "long", day: "numeric", year: "numeric",
      })
    : new Date().toLocaleDateString();

  // ── HEADER ──
  let y = await addPdfHeader(doc, {
    title: `Artist Settlement — ${eventTitle}`,
    venueName: v.name,
    venueAddress: venueAddress(v),
    venueSlug: v.slug,
    showBuyerInfo: false,
  });

  // ── Deal Terms ──
  y = drawSectionHeader(doc, "Deal Terms", y);
  y = drawRow(doc, "Artist", settlement.artist_name ?? "—", y, { bold: true });
  y = drawRow(doc, "Event Date", eventDate, y);
  y = drawRow(doc, "Deal Type", settlement.deal_type ?? "—", y);
  y = drawRow(doc, "Guarantee", fmt(settlement.guarantee), y);
  y = drawRow(
    doc,
    "Backend %",
    `${(Number(settlement.backend_percentage) * 100).toFixed(2)}%`,
    y
  );
  if (settlement.bonus_structure && Object.keys(settlement.bonus_structure).length > 0) {
    const bonusTxt =
      typeof settlement.bonus_structure === "string"
        ? settlement.bonus_structure
        : JSON.stringify(settlement.bonus_structure);
    y = drawRow(doc, "Bonus Structure", bonusTxt, y);
  }
  if (settlement.radius_clause) {
    y = drawRow(doc, "Radius Clause", settlement.radius_clause, y);
  }
  y += 3;

  // ── Ticket Audit ──
  y = drawTicketAuditTable(doc, settlement.ticket_audit ?? [], y);

  // ── Fee & Tax Breakdown ──
  y = drawFeeTaxBreakdown(doc, settlement, y);

  // ── Financial Summary ──
  y = drawFinancialSummary(doc, settlement, y);

  // ── Expenses ──
  y = drawSectionHeader(doc, "Expenses", y);
  let expTotal = 0;
  for (const e of expenses) {
    const amt = "actual_amount" in e ? e.actual_amount : 0;
    y = drawRow(doc, `${e.name} (${e.category})`, fmt(amt), y, { indent: 4 });
    expTotal += amt;
  }
  if (expenses.length === 0) {
    y = drawRow(doc, "No expenses recorded.", "", y, { indent: 4 });
  }
  y = drawDivider(doc, y);
  y = drawRow(doc, "Total Expenses", fmt(expTotal), y, { bold: true });
  y += 3;

  // ── Settlement Calculation ──
  y = drawSectionHeader(doc, "Settlement Calculation", y);
  y = drawRow(doc, "Net Receipts", fmt(settlement.net_receipts), y);
  y = drawRow(doc, "Less: Total Expenses", `(${fmt(settlement.total_expenses)})`, y, { indent: 4 });
  y = drawDivider(doc, y);
  y = drawRow(doc, "Splitpoint", fmt(settlement.splitpoint), y, { bold: true });

  const dealType = settlement.deal_type ?? "FLAT";
  if (dealType === "VS" || dealType === "PLUS" || dealType === "DOOR") {
    const pct = (Number(settlement.backend_percentage) * 100).toFixed(2);
    const baseLabel =
      dealType === "DOOR" ? "Net Receipts" : "Splitpoint";
    y = drawRow(
      doc,
      `Artist Backend (${pct}% of ${baseLabel})`,
      fmt(settlement.artist_backend),
      y,
      { indent: 4 }
    );
  }
  if (dealType !== "DOOR") {
    y = drawRow(doc, "Artist Guarantee", fmt(settlement.guarantee), y);
  }
  y = drawDivider(doc, y);
  y = drawRow(doc, "ARTIST TOTAL", fmt(settlement.artist_total), y, { bold: true, highlight: true });
  y += 2;
  y = drawRow(doc, "Less: Deposits Paid", `(${fmt(settlement.deposit_paid)})`, y, { indent: 4 });
  y = drawRow(doc, "Less: Cash Advances", `(${fmt(settlement.cash_advance)})`, y, { indent: 4 });
  y = drawDivider(doc, y);
  y = drawRow(doc, "BALANCE DUE TO ARTIST", fmt(settlement.balance_due), y, { bold: true, highlight: true });
  y += 8;

  // ── Deposits detail ──
  if (deposits.length > 0) {
    y = drawSectionHeader(doc, "Deposits & Advances", y);
    for (const d of deposits) {
      const label = `${d.type}${d.date ? ` (${d.date})` : ""}${d.notes ? ` — ${d.notes}` : ""}`;
      y = drawRow(doc, label, fmt(d.amount), y, { indent: 4 });
    }
    y += 5;
  }

  // ── Signatures ──
  y = drawSignatureLines(doc, y);

  drawFooter(doc, "Artist Settlement");

  const filename = `${sanitize(settlement.artist_name ?? "Artist")}-${sanitize(eventDate)}-${sanitize(venue.name)}-Artist_Settlement.pdf`;
  doc.save(filename);
}

// ═════════════════════════════════════════════════════════════════════
//  VENUE SETTLEMENT PDF
// ═════════════════════════════════════════════════════════════════════
export async function exportVenueSettlementPDF(
  settlement: Settlement,
  venue: Venue | VenueInfo,
  expenses: (SettlementExpense | ExpenseRow)[],
  deposits: (SettlementDeposit | DepositRow)[]
): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: [PAGE_WIDTH, PAGE_HEIGHT], compress: true });

  const v: VenueInfo = {
    name: venue.name,
    slug: (venue as Venue).slug ?? undefined,
    address_street: venue.address_street ?? undefined,
    address_city: venue.address_city ?? undefined,
    address_state: venue.address_state ?? undefined,
    address_zip: venue.address_zip ?? undefined,
    buyer_phone: (venue as Venue).buyer_phone ?? undefined,
    buyer_email: (venue as Venue).buyer_email ?? undefined,
  };

  const eventTitle = settlement.event_title ?? settlement.artist_name ?? "Event";
  const eventDate = settlement.event_date
    ? new Date(settlement.event_date).toLocaleDateString("en-US", {
        weekday: "short", month: "long", day: "numeric", year: "numeric",
      })
    : new Date().toLocaleDateString();

  let y = await addPdfHeader(doc, {
    title: `Venue Settlement — ${eventTitle}`,
    venueName: v.name,
    venueAddress: venueAddress(v),
    venueSlug: v.slug,
    showBuyerInfo: false,
  });

  // Deal Terms
  y = drawSectionHeader(doc, "Deal Terms", y);
  y = drawRow(doc, "Artist", settlement.artist_name ?? "—", y, { bold: true });
  y = drawRow(doc, "Event Date", eventDate, y);
  y = drawRow(doc, "Deal Type", settlement.deal_type ?? "—", y);
  y = drawRow(doc, "Guarantee", fmt(settlement.guarantee), y);
  y = drawRow(
    doc,
    "Backend %",
    `${(Number(settlement.backend_percentage) * 100).toFixed(2)}%`,
    y
  );
  if (settlement.bonus_structure && Object.keys(settlement.bonus_structure).length > 0) {
    const bonusTxt =
      typeof settlement.bonus_structure === "string"
        ? settlement.bonus_structure
        : JSON.stringify(settlement.bonus_structure);
    y = drawRow(doc, "Bonus Structure", bonusTxt, y);
  }
  if (settlement.radius_clause) {
    y = drawRow(doc, "Radius Clause", settlement.radius_clause, y);
  }
  y += 3;

  // Ticket Audit
  y = drawTicketAuditTable(doc, settlement.ticket_audit ?? [], y);

  // Fee & Tax Breakdown
  y = drawFeeTaxBreakdown(doc, settlement, y);

  // Financial Summary
  y = drawFinancialSummary(doc, settlement, y);

  // Expenses
  y = drawSectionHeader(doc, "Expenses", y);
  let expTotal = 0;
  for (const e of expenses) {
    const amt = "actual_amount" in e ? e.actual_amount : 0;
    y = drawRow(doc, `${e.name} (${e.category})`, fmt(amt), y, { indent: 4 });
    expTotal += amt;
  }
  if (expenses.length === 0) {
    y = drawRow(doc, "No expenses recorded.", "", y, { indent: 4 });
  }
  y = drawDivider(doc, y);
  y = drawRow(doc, "Total Expenses", fmt(expTotal), y, { bold: true });
  y += 3;

  // Settlement Calculation
  y = drawSectionHeader(doc, "Settlement Calculation", y);
  y = drawRow(doc, "Net Receipts", fmt(settlement.net_receipts), y);
  y = drawRow(doc, "Less: Total Expenses", `(${fmt(settlement.total_expenses)})`, y, { indent: 4 });
  y = drawDivider(doc, y);
  y = drawRow(doc, "Splitpoint", fmt(settlement.splitpoint), y, { bold: true });

  const dealType = settlement.deal_type ?? "FLAT";
  if (dealType === "VS" || dealType === "PLUS" || dealType === "DOOR") {
    const pct = (Number(settlement.backend_percentage) * 100).toFixed(2);
    const baseLabel = dealType === "DOOR" ? "Net Receipts" : "Splitpoint";
    y = drawRow(
      doc,
      `Artist Backend (${pct}% of ${baseLabel})`,
      fmt(settlement.artist_backend),
      y,
      { indent: 4 }
    );
  }
  if (dealType !== "DOOR") {
    y = drawRow(doc, "Artist Guarantee", fmt(settlement.guarantee), y);
  }
  y = drawDivider(doc, y);
  y = drawRow(doc, "ARTIST TOTAL", fmt(settlement.artist_total), y, { bold: true, highlight: true });
  y += 2;
  y = drawRow(doc, "Less: Deposits Paid", `(${fmt(settlement.deposit_paid)})`, y, { indent: 4 });
  y = drawRow(doc, "Less: Cash Advances", `(${fmt(settlement.cash_advance)})`, y, { indent: 4 });
  y = drawDivider(doc, y);
  y = drawRow(doc, "BALANCE DUE TO ARTIST", fmt(settlement.balance_due), y, { bold: true, highlight: true });
  y += 8;

  // Deposits detail
  if (deposits.length > 0) {
    y = drawSectionHeader(doc, "Deposits & Advances", y);
    for (const d of deposits) {
      const label = `${d.type}${d.date ? ` (${d.date})` : ""}${d.notes ? ` — ${d.notes}` : ""}`;
      y = drawRow(doc, label, fmt(d.amount), y, { indent: 4 });
    }
    y += 5;
  }

  // Ancillary Revenue
  y = drawSectionHeader(doc, "Ancillary Revenue", y);
  const ancillaryItems: [string, number][] = [
    ["Bar Revenue", settlement.bar_revenue ?? 0],
    ["Concessions", settlement.concessions_revenue ?? 0],
    ["Merch Commission", settlement.merch_commission ?? 0],
    ["Ticketing Rebate", settlement.ticketing_rebate ?? 0],
    ["Parking", settlement.parking_revenue ?? 0],
    ["Sponsorship", settlement.sponsorship_revenue ?? 0],
  ];
  let totalAncillary = 0;
  for (const [label, amt] of ancillaryItems) {
    if (amt > 0) {
      y = drawRow(doc, label, fmt(amt), y, { indent: 4 });
      totalAncillary += amt;
    }
  }
  if (settlement.other_ancillary?.length) {
    for (const item of settlement.other_ancillary) {
      if (item.amount > 0) {
        y = drawRow(doc, item.name || "Other", fmt(item.amount), y, { indent: 4 });
        totalAncillary += item.amount;
      }
    }
  }
  if (totalAncillary === 0) {
    y = drawRow(doc, "No ancillary revenue recorded.", "", y, { indent: 4 });
  }
  y = drawDivider(doc, y);
  y = drawRow(doc, "Total Ancillary Revenue", fmt(totalAncillary), y, { bold: true });
  y += 5;

  // Venue P&L
  y = drawSectionHeader(doc, "Venue Profit & Loss", y);
  const venueTotalRevenue =
    settlement.venue_total_revenue ?? (settlement.net_receipts + totalAncillary);
  const venueTotalCosts = settlement.total_expenses + settlement.artist_total;
  const venueNetProfit =
    settlement.venue_net_profit ?? (venueTotalRevenue - venueTotalCosts);

  y = drawRow(doc, "Total Revenue (Net Receipts + Ancillary)", fmt(venueTotalRevenue), y, { bold: true });
  y = drawRow(doc, "Net Receipts", fmt(settlement.net_receipts), y, { indent: 8 });
  y = drawRow(doc, "Total Ancillary", fmt(totalAncillary), y, { indent: 8 });
  y += 2;
  y = drawRow(doc, "Total Costs (Expenses + Artist Total)", fmt(venueTotalCosts), y, { bold: true });
  y = drawRow(doc, "Total Expenses", fmt(settlement.total_expenses), y, { indent: 8 });
  y = drawRow(doc, "Artist Total", fmt(settlement.artist_total), y, { indent: 8 });
  y = drawDivider(doc, y);
  y = drawRow(doc, "VENUE NET PROFIT", fmt(venueNetProfit), y, { bold: true, highlight: true });
  y += 8;

  // Signatures
  y = drawSignatureLines(doc, y);

  drawFooter(doc, "Venue Settlement");

  const filename = `${sanitize(eventTitle)}-${sanitize(eventDate)}-Venue_Settlement.pdf`;
  doc.save(filename);
}

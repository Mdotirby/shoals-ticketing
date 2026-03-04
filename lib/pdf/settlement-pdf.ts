/**
 * Settlement PDF Generator — uses shared header utility.
 * Both Artist and Venue settlement exports. NO buyer info in header.
 */
import type { Settlement, SettlementExpense, SettlementDeposit } from "../types/settlement";
import type { Venue } from "../types/venue";
import {
  addPdfHeader, drawFooter, ensureSpace, drawSectionHeader, drawRow, drawDivider,
  fmt, sanitize,
  MARGIN, PAGE_WIDTH, PAGE_HEIGHT, CONTENT_WIDTH, DARK, GOLD, WHITE, MID_GRAY, LIGHT_GRAY,
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
  const cols = ["Tier", "Cap", "Sold", "Comps", "Price", "Facility Fee", "Gross"];
  const colX = [MARGIN + 3, MARGIN + 42, MARGIN + 60, MARGIN + 78, MARGIN + 98, MARGIN + 125, MARGIN + CONTENT_WIDTH - 3];

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
  const tierNameMaxW = colX[1] - colX[0] - 5; // max width for tier name before next column

  for (const r of rows) {
    y = ensureSpace(doc, 7, y);
    const tierName: string = doc.splitTextToSize(r.tier, tierNameMaxW)[0] || r.tier;
    doc.text(tierName, colX[0], y + 4);
    doc.text(String(r.capacity), colX[1], y + 4, { align: "right" });
    doc.text(String(r.sold), colX[2], y + 4, { align: "right" });
    doc.text(String(r.comps), colX[3], y + 4, { align: "right" });
    doc.text(fmt(r.price), colX[4], y + 4, { align: "right" });
    doc.text(fmt(r.facility_fee), colX[5], y + 4, { align: "right" });
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
  doc.text("", colX[4], y + 5);
  doc.text("", colX[5], y + 5);
  doc.text(fmt(totalGross), colX[6], y + 5, { align: "right" });
  doc.setTextColor(...DARK);

  return y + 12;
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

  const eventTitle = settlement.artist_name ?? "Event";
  const eventDate = (settlement as unknown as { event_date?: string }).event_date ?? new Date().toLocaleDateString();

  // ── HEADER (NO buyer info for settlements) ──
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
  y = drawRow(doc, "Guarantee", fmt(settlement.guarantee), y);
  y = drawRow(doc, "Deal Type", settlement.deal_type ?? "—", y);
  y = drawRow(doc, "Backend %", `${settlement.backend_percentage}%`, y);
  if (settlement.bonus_structure) {
    y = drawRow(doc, "Bonus Structure", JSON.stringify(settlement.bonus_structure), y);
  }
  if (settlement.radius_clause) {
    y = drawRow(doc, "Radius Clause", settlement.radius_clause, y);
  }
  y += 3;

  // ── Ticket Audit ──
  y = drawTicketAuditTable(doc, settlement.ticket_audit ?? [], y);

  // ── Financial Summary ──
  y = drawSectionHeader(doc, "Financial Summary", y);
  y = drawRow(doc, "Total Gross Receipts", fmt(settlement.total_gross), y, { bold: true });
  y = drawRow(doc, "Less: Ticketing Fees", `(${fmt(settlement.ticketing_fees)})`, y, { indent: 4 });
  y = drawRow(doc, "Less: Facility Fees", `(${fmt(settlement.facility_fees)})`, y, { indent: 4 });
  y = drawDivider(doc, y);
  y = drawRow(doc, "Adj. Gross Receipts", fmt(settlement.adj_gross), y, { bold: true });
  y = drawRow(doc, `Less: Taxes (${settlement.tax_rate}%)`, `(${fmt(settlement.taxes)})`, y, { indent: 4 });
  y = drawDivider(doc, y);
  y = drawRow(doc, "Net Receipts", fmt(settlement.net_receipts), y, { bold: true });
  y += 3;

  // ── Expenses ──
  y = drawSectionHeader(doc, "Expenses", y);
  let expTotal = 0;
  for (const e of expenses) {
    const amt = "actual_amount" in e ? e.actual_amount : 0;
    y = drawRow(doc, `${e.name} (${e.category})`, fmt(amt), y, { indent: 4 });
    expTotal += amt;
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

  if (settlement.deal_type === "VS" || settlement.deal_type === "PLUS") {
    y = drawRow(doc, `Artist Backend (${settlement.backend_percentage}%)`, fmt(settlement.artist_backend), y, { indent: 4 });
  }
  y = drawRow(doc, "Artist Guarantee", fmt(settlement.guarantee), y);
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

  // Footer
  drawFooter(doc, "Artist Settlement");

  // Save
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

  const eventTitle = settlement.artist_name ?? "Event";
  const eventDate = (settlement as unknown as { event_date?: string }).event_date ?? new Date().toLocaleDateString();

  // ── HEADER (NO buyer info for settlements) ──
  let y = await addPdfHeader(doc, {
    title: `Venue Settlement — ${eventTitle}`,
    venueName: v.name,
    venueAddress: venueAddress(v),
    venueSlug: v.slug,
    showBuyerInfo: false,
  });

  // ── Deal Terms ──
  y = drawSectionHeader(doc, "Deal Terms", y);
  y = drawRow(doc, "Artist", settlement.artist_name ?? "—", y, { bold: true });
  y = drawRow(doc, "Event Date", eventDate, y);
  y = drawRow(doc, "Guarantee", fmt(settlement.guarantee), y);
  y = drawRow(doc, "Deal Type", settlement.deal_type ?? "—", y);
  y = drawRow(doc, "Backend %", `${settlement.backend_percentage}%`, y);
  if (settlement.bonus_structure) {
    y = drawRow(doc, "Bonus Structure", JSON.stringify(settlement.bonus_structure), y);
  }
  if (settlement.radius_clause) {
    y = drawRow(doc, "Radius Clause", settlement.radius_clause, y);
  }
  y += 3;

  // ── Ticket Audit ──
  y = drawTicketAuditTable(doc, settlement.ticket_audit ?? [], y);

  // ── Financial Summary ──
  y = drawSectionHeader(doc, "Financial Summary", y);
  y = drawRow(doc, "Total Gross Receipts", fmt(settlement.total_gross), y, { bold: true });
  y = drawRow(doc, "Less: Ticketing Fees", `(${fmt(settlement.ticketing_fees)})`, y, { indent: 4 });
  y = drawRow(doc, "Less: Facility Fees", `(${fmt(settlement.facility_fees)})`, y, { indent: 4 });
  y = drawDivider(doc, y);
  y = drawRow(doc, "Adj. Gross Receipts", fmt(settlement.adj_gross), y, { bold: true });
  y = drawRow(doc, `Less: Taxes (${settlement.tax_rate}%)`, `(${fmt(settlement.taxes)})`, y, { indent: 4 });
  y = drawDivider(doc, y);
  y = drawRow(doc, "Net Receipts", fmt(settlement.net_receipts), y, { bold: true });
  y += 3;

  // ── Expenses ──
  y = drawSectionHeader(doc, "Expenses", y);
  let expTotal = 0;
  for (const e of expenses) {
    const amt = "actual_amount" in e ? e.actual_amount : 0;
    y = drawRow(doc, `${e.name} (${e.category})`, fmt(amt), y, { indent: 4 });
    expTotal += amt;
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

  if (settlement.deal_type === "VS" || settlement.deal_type === "PLUS") {
    y = drawRow(doc, `Artist Backend (${settlement.backend_percentage}%)`, fmt(settlement.artist_backend), y, { indent: 4 });
  }
  y = drawRow(doc, "Artist Guarantee", fmt(settlement.guarantee), y);
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

  // ── Ancillary Revenue ──
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
      y = drawRow(doc, item.name, fmt(item.amount), y, { indent: 4 });
      totalAncillary += item.amount;
    }
  }
  y = drawDivider(doc, y);
  y = drawRow(doc, "Total Ancillary Revenue", fmt(totalAncillary), y, { bold: true });
  y += 5;

  // ── Venue P&L ──
  y = drawSectionHeader(doc, "Venue Profit & Loss", y);
  const venueTotalRevenue = settlement.venue_total_revenue ?? (settlement.net_receipts + totalAncillary);
  const venueTotalCosts = settlement.total_expenses + settlement.artist_total;
  const venueNetProfit = settlement.venue_net_profit ?? (venueTotalRevenue - venueTotalCosts);

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

  // ── Signatures ──
  y = drawSignatureLines(doc, y);

  // Footer
  drawFooter(doc, "Venue Settlement");

  // Save
  const filename = `${sanitize(eventTitle)}-${sanitize(eventDate)}-Venue_Settlement.pdf`;
  doc.save(filename);
}

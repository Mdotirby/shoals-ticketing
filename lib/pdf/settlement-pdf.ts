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
//
// Columns: Tier, Cap, Sold, Comps, %H, Price, Svc, Fac, Tax, CC,
//          Gross Receipts (= price + svc + fac + tax + cc per tier).
function drawTicketAuditTable(
  doc: Doc,
  rows: Settlement["ticket_audit"],
  taxRate: number,
  taxMethod: "multiplier" | "divisor",
  ccFees: number,
  y: number
): number {
  y = drawSectionHeader(doc, "Ticket Audit", y);
  const cols = ["Tier", "Cap", "Sold", "Cmp", "%H", "Price", "Svc", "Fac", "Tax", "CC", "Gross Receipts"];
  const colCount = cols.length;
  const tierColW = 32;
  const remaining = CONTENT_WIDTH - tierColW;
  const numColW = remaining / (colCount - 1);
  const colX: number[] = [MARGIN + 3];
  for (let i = 1; i < colCount; i++) {
    colX.push(MARGIN + tierColW + numColW * i - 2);
  }

  // Header
  y = ensureSpace(doc, 8, y);
  doc.setFillColor(...LIGHT_GRAY);
  doc.rect(MARGIN, y, CONTENT_WIDTH, 7, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.5);
  doc.setTextColor(...DARK);
  cols.forEach((c, i) => {
    const align = i >= 1 ? "right" : undefined;
    doc.text(c, colX[i], y + 5, align ? { align } : undefined);
  });
  y += 8;

  // Total sold (for CC apportionment)
  const totalSoldAll = rows.reduce((s, r) => s + r.sold, 0) || 1;

  // Data rows
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  let tCap = 0,
    tSold = 0,
    tComps = 0,
    tSvc = 0,
    tFac = 0,
    tTax = 0,
    tCc = 0,
    tGross = 0;
  const tierNameMaxW = tierColW - 3;

  for (const r of rows) {
    y = ensureSpace(doc, 7, y);
    const tierName: string = doc.splitTextToSize(r.tier, tierNameMaxW)[0] || r.tier;
    const pctH = r.capacity > 0 ? (r.sold / r.capacity) * 100 : 0;
    const svc = (r.ticketing_fee || 0) * r.sold;
    const fac = (r.facility_fee || 0) * r.sold;
    const tax =
      taxMethod === "divisor" && taxRate > 0
        ? r.gross - r.gross / (1 + taxRate)
        : r.gross * taxRate;
    const ccShare = ccFees * (r.sold / totalSoldAll);
    const grossReceipts = r.gross + svc + fac + tax + ccShare;

    doc.text(tierName, colX[0], y + 4);
    doc.text(String(r.capacity), colX[1], y + 4, { align: "right" });
    doc.text(String(r.sold), colX[2], y + 4, { align: "right" });
    doc.text(String(r.comps), colX[3], y + 4, { align: "right" });
    doc.text(`${pctH.toFixed(1)}%`, colX[4], y + 4, { align: "right" });
    doc.text(fmt(r.price), colX[5], y + 4, { align: "right" });
    doc.text(fmt(svc), colX[6], y + 4, { align: "right" });
    doc.text(fmt(fac), colX[7], y + 4, { align: "right" });
    doc.text(fmt(tax), colX[8], y + 4, { align: "right" });
    doc.text(fmt(ccShare), colX[9], y + 4, { align: "right" });
    doc.text(fmt(grossReceipts), colX[10], y + 4, { align: "right" });

    tCap += r.capacity;
    tSold += r.sold;
    tComps += r.comps;
    tSvc += svc;
    tFac += fac;
    tTax += tax;
    tCc += ccShare;
    tGross += grossReceipts;
    y += 6;
  }

  // Total row
  y = ensureSpace(doc, 8, y);
  doc.setFillColor(...DARK);
  doc.rect(MARGIN, y, CONTENT_WIDTH, 7, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.5);
  doc.setTextColor(...WHITE);
  doc.text("TOTAL", colX[0], y + 5);
  doc.text(String(tCap), colX[1], y + 5, { align: "right" });
  doc.text(String(tSold), colX[2], y + 5, { align: "right" });
  doc.text(String(tComps), colX[3], y + 5, { align: "right" });
  const overallPct = tCap > 0 ? ((tSold / tCap) * 100).toFixed(1) + "%" : "—";
  doc.text(overallPct, colX[4], y + 5, { align: "right" });
  doc.text("", colX[5], y + 5);
  doc.text(fmt(tSvc), colX[6], y + 5, { align: "right" });
  doc.text(fmt(tFac), colX[7], y + 5, { align: "right" });
  doc.text(fmt(tTax), colX[8], y + 5, { align: "right" });
  doc.text(fmt(tCc), colX[9], y + 5, { align: "right" });
  doc.text(fmt(tGross), colX[10], y + 5, { align: "right" });
  doc.setTextColor(...DARK);
  y += 10;

  // Comps note
  if (tComps > 0) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(7);
    doc.setTextColor(...DARK);
    doc.text(
      `* ${tComps} comp ticket${tComps === 1 ? "" : "s"} listed for inventory only — NOT included in any totals.`,
      MARGIN + 3,
      y
    );
    y += 5;
  }

  return y + 2;
}

// ── Merch Settlement ─────────────────────────────────────────────────
function drawMerchSection(doc: Doc, s: Settlement, y: number): {
  y: number;
  ownedToVenue: number;
  artistPaidSellerFee: number;
  venuePaidSellerFee: number;
  venuePaidTax: number;
} {
  const items = Array.isArray(s.merch_items) ? s.merch_items : [];
  const sellerFee = Number(s.merch_seller_fee) || 0;
  const sellerPayer = s.merch_seller_fee_payer ?? "venue";
  const artistPaidSellerFee = sellerPayer === "artist" ? sellerFee : 0;
  const venuePaidSellerFee = sellerPayer === "venue" ? sellerFee : 0;
  const venueShare = Number(s.merch_venue_share) || 0;
  const totalTax = Number(s.merch_total_tax) || 0;
  const taxPayer = s.merch_tax_payer ?? "artist";
  const venuePaidTax = taxPayer === "venue" ? totalTax : 0;
  const discounts = Number(s.merch_discounts) || 0;

  // If there are no items AND no deal terms, skip the section entirely.
  if (
    items.length === 0 &&
    venueShare === 0 &&
    sellerFee === 0 &&
    !s.merch_split_venue_pct
  ) {
    return { y, ownedToVenue: 0, artistPaidSellerFee, venuePaidSellerFee, venuePaidTax };
  }

  y = drawSectionHeader(doc, "Merch Settlement", y);

  if (items.length > 0) {
    // Item table
    const cols = ["Item", "Units", "Unit $", "Gross"];
    const colX = [
      MARGIN + 3,
      MARGIN + 90,
      MARGIN + 120,
      MARGIN + CONTENT_WIDTH - 3,
    ];
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

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    let total = 0;
    for (const item of items) {
      y = ensureSpace(doc, 7, y);
      const name = doc.splitTextToSize(item.name || "—", colX[1] - colX[0] - 5)[0] || item.name || "—";
      doc.text(name, colX[0], y + 4);
      doc.text(String(item.units_sold || 0), colX[1], y + 4, { align: "right" });
      doc.text(fmt(Number(item.unit_price) || 0), colX[2], y + 4, { align: "right" });
      doc.text(fmt(Number(item.gross) || 0), colX[3], y + 4, { align: "right" });
      total += Number(item.gross) || 0;
      y += 6;
    }

    // Total row
    y = ensureSpace(doc, 8, y);
    doc.setFillColor(...DARK);
    doc.rect(MARGIN, y, CONTENT_WIDTH, 7, "F");
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...WHITE);
    doc.text("TOTAL GROSS MERCH", colX[0], y + 5);
    doc.text(fmt(total), colX[3], y + 5, { align: "right" });
    doc.setTextColor(...DARK);
    y += 10;
  }

  // Deal terms + math walk
  const splitPct = ((s.merch_split_venue_pct || 0) * 100).toFixed(1);
  const taxPct = ((s.merch_tax_rate || 0) * 100).toFixed(2);
  const taxLabel =
    s.merch_tax_method === "divisor" ? "divided out" : "added on top";

  y = drawRow(doc, "Total Gross Merch", fmt(s.merch_total_gross || 0), y, { bold: true });
  if (discounts > 0) {
    y = drawRow(doc, "− Discounts / Free Merch", `(${fmt(discounts)})`, y, { indent: 4 });
    y = drawRow(
      doc,
      "= Net (pre-tax base)",
      fmt((s.merch_total_gross || 0) - discounts),
      y
    );
  }
  y = drawRow(doc, `− Sales Tax (${taxPct}%, ${taxLabel})`, `(${fmt(s.merch_total_tax || 0)})`, y, { indent: 4 });
  y = drawDivider(doc, y);
  y = drawRow(doc, "= Net Merch Sales", fmt(s.merch_total_net || 0), y, { bold: true });
  y = drawRow(doc, `Venue Share (${splitPct}% of net)`, fmt(venueShare), y, { indent: 4 });
  y = drawRow(doc, "Artist Share", fmt(s.merch_artist_share || 0), y, { indent: 4 });
  if (sellerFee > 0) {
    y = drawRow(
      doc,
      `Merch Seller Fee (paid by ${sellerPayer})`,
      fmt(sellerFee),
      y,
      { indent: 4 }
    );
  }
  if (totalTax > 0) {
    y = drawRow(
      doc,
      `Sales Tax (${taxPayer === "venue" ? "venue pays — artist reimburses" : "artist retains — files separately"})`,
      fmt(totalTax),
      y,
      { indent: 4 }
    );
  }
  y = drawDivider(doc, y);
  const ownedToVenue = venueShare + artistPaidSellerFee + venuePaidTax;
  y = drawRow(doc, "Owed to Venue from Artist", fmt(ownedToVenue), y, { bold: true, highlight: true });
  y += 4;
  return { y, ownedToVenue, artistPaidSellerFee, venuePaidSellerFee, venuePaidTax };
}

// ── Financial Summary ────────────────────────────────────────────────
//   Single walk: Gross Receipts → minus pass-throughs → Net Receipts.
//   Net Receipts is the artist split base.
function drawFinancialSummary(doc: Doc, s: Settlement, y: number): number {
  y = drawSectionHeader(doc, "Financial Summary", y);
  const ticketsSold = s.tickets_sold_count || 0;
  const grossReceipts =
    (s.total_gross || 0) +
    (s.ticketing_fees || 0) +
    (s.facility_fees || 0) +
    (s.cc_fees || 0) +
    (s.taxes || 0);
  const taxRatePct = ((s.tax_rate || 0) * 100).toFixed(2);
  const taxMethodLabel =
    s.tax_method === "divisor" ? "divided out" : "added on top";

  y = drawRow(doc, "Tickets Sold (paying)", String(ticketsSold), y);
  y = drawRow(doc, "Total Gross Receipts", fmt(grossReceipts), y, { bold: true, highlight: true });
  y = drawRow(doc, "− Service Fees Collected", `(${fmt(s.ticketing_fees || 0)})`, y, { indent: 4 });
  y = drawRow(doc, "− Facility Fees Collected", `(${fmt(s.facility_fees || 0)})`, y, { indent: 4 });
  y = drawRow(
    doc,
    `− Tax Collected (${taxRatePct}%, ${taxMethodLabel})`,
    `(${fmt(s.taxes || 0)})`,
    y,
    { indent: 4 }
  );
  y = drawRow(doc, "− CC / Processing Fees", `(${fmt(s.cc_fees || 0)})`, y, { indent: 4 });
  y = drawDivider(doc, y);
  y = drawRow(doc, "= NET RECEIPTS (artist split base)", fmt(s.net_receipts || 0), y, { bold: true, highlight: true });
  y += 4;

  doc.setFont("helvetica", "italic");
  doc.setFontSize(7);
  doc.setTextColor(...DARK);
  doc.text(
    "Service / Facility / Tax / CC fees are pass-throughs — collected from the customer and remitted out.",
    MARGIN + 3,
    y
  );
  y += 4;
  doc.text(
    "The artist deal is calculated on Net Receipts.",
    MARGIN + 3,
    y
  );
  y += 5;
  return y + 2;
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
  y = drawTicketAuditTable(
    doc,
    settlement.ticket_audit ?? [],
    settlement.tax_rate ?? 0,
    (settlement.tax_method as "multiplier" | "divisor") ?? "multiplier",
    settlement.cc_fees ?? 0,
    y
  );

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

  // ── Merch Settlement ──
  const merchResult = drawMerchSection(doc, settlement, y);
  y = merchResult.y;

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
  if ((settlement.merch_venue_share || 0) > 0) {
    y = drawRow(
      doc,
      "Less: Venue Merch Share",
      `(${fmt(settlement.merch_venue_share || 0)})`,
      y,
      { indent: 4 }
    );
  }
  if (merchResult.artistPaidSellerFee > 0) {
    y = drawRow(
      doc,
      "Less: Merch Seller Fee (artist-paid)",
      `(${fmt(merchResult.artistPaidSellerFee)})`,
      y,
      { indent: 4 }
    );
  }
  if (merchResult.venuePaidTax > 0) {
    y = drawRow(
      doc,
      "Less: Merch Tax (venue paying — artist reimburses)",
      `(${fmt(merchResult.venuePaidTax)})`,
      y,
      { indent: 4 }
    );
  }
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
  y = drawTicketAuditTable(
    doc,
    settlement.ticket_audit ?? [],
    settlement.tax_rate ?? 0,
    (settlement.tax_method as "multiplier" | "divisor") ?? "multiplier",
    settlement.cc_fees ?? 0,
    y
  );

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

  // Merch Settlement
  const merchResult = drawMerchSection(doc, settlement, y);
  y = merchResult.y;

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
  if ((settlement.merch_venue_share || 0) > 0) {
    y = drawRow(
      doc,
      "Less: Venue Merch Share",
      `(${fmt(settlement.merch_venue_share || 0)})`,
      y,
      { indent: 4 }
    );
  }
  if (merchResult.artistPaidSellerFee > 0) {
    y = drawRow(
      doc,
      "Less: Merch Seller Fee (artist-paid)",
      `(${fmt(merchResult.artistPaidSellerFee)})`,
      y,
      { indent: 4 }
    );
  }
  if (merchResult.venuePaidTax > 0) {
    y = drawRow(
      doc,
      "Less: Merch Tax (venue paying — artist reimburses)",
      `(${fmt(merchResult.venuePaidTax)})`,
      y,
      { indent: 4 }
    );
  }
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
  // If merch_items exist, the merch venue share is reported in the dedicated
  // Merch Settlement section above (and rolled into the P&L below) — skip the
  // legacy single-number "Merch Commission" line to avoid double-counting.
  const merchHasItems =
    Array.isArray(settlement.merch_items) && settlement.merch_items.length > 0;
  const legacyMerchCommission = merchHasItems
    ? 0
    : settlement.merch_commission ?? 0;
  const ancillaryItems: [string, number][] = [
    ["Bar Revenue", settlement.bar_revenue ?? 0],
    ["Concessions", settlement.concessions_revenue ?? 0],
    ["Merch Commission (legacy)", legacyMerchCommission],
    ["Merch Venue Share", settlement.merch_venue_share ?? 0],
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
  const venueTotalCosts =
    settlement.total_expenses +
    settlement.artist_total +
    merchResult.venuePaidSellerFee;
  const venueNetProfit =
    settlement.venue_net_profit ?? (venueTotalRevenue - venueTotalCosts);

  y = drawRow(doc, "Total Revenue (Net Receipts + Ancillary)", fmt(venueTotalRevenue), y, { bold: true });
  y = drawRow(doc, "Net Receipts", fmt(settlement.net_receipts), y, { indent: 8 });
  y = drawRow(doc, "Total Ancillary (incl. merch venue share)", fmt(totalAncillary), y, { indent: 8 });
  if ((settlement.merch_venue_share || 0) > 0) {
    y = drawRow(doc, "  ↳ Merch Venue Share", fmt(settlement.merch_venue_share || 0), y, { indent: 12 });
  }
  y += 2;
  y = drawRow(doc, "Total Costs (Expenses + Artist Total + Merch Seller Fee)", fmt(venueTotalCosts), y, { bold: true });
  y = drawRow(doc, "Total Expenses", fmt(settlement.total_expenses), y, { indent: 8 });
  y = drawRow(doc, "Artist Total", fmt(settlement.artist_total), y, { indent: 8 });
  if (merchResult.venuePaidSellerFee > 0) {
    y = drawRow(doc, "Merch Seller Fee (venue-paid)", fmt(merchResult.venuePaidSellerFee), y, { indent: 8 });
  }
  y = drawDivider(doc, y);
  y = drawRow(doc, "VENUE NET PROFIT", fmt(venueNetProfit), y, { bold: true, highlight: true });
  y += 8;

  // Signatures
  y = drawSignatureLines(doc, y);

  drawFooter(doc, "Venue Settlement");

  const filename = `${sanitize(eventTitle)}-${sanitize(eventDate)}-Venue_Settlement.pdf`;
  doc.save(filename);
}

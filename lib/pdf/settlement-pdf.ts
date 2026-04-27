/**
 * Settlement PDF Generator — compact one-page layout matching offer PDF style.
 * Uses small fonts, two-column sections, and dark section header bars.
 */
import type { Settlement, SettlementExpense, SettlementDeposit } from "../types/settlement";
import type { Venue } from "../types/venue";
import {
  addPdfHeader, drawFooter, ensureSpace,
  sanitize,
  MARGIN, PAGE_WIDTH, PAGE_HEIGHT, CONTENT_WIDTH, DARK, GOLD, LIGHT_GRAY,
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

const fmt = (n: number) =>
  "$" + Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Compact font constants — match offer-pdf.ts
const S = 7;      // small text
const M = 7.5;    // medium text
const H = 8;      // section header text
const RH = 3.8;   // row height
const halfW = CONTENT_WIDTH / 2 - 4;
const leftX = MARGIN + 2;
const rightX = MARGIN + halfW + 8;
const rValX = rightX + 30;

// ─────────────────────────────────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────────────────────────────────

/** Full-width section header bar */
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

/** Half-width left section header */
function secHLeft(doc: Doc, title: string, y: number): number {
  doc.setFillColor(...DARK);
  doc.rect(MARGIN, y, halfW + 2, 5.5, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(H);
  doc.setTextColor(...GOLD);
  doc.text(title.toUpperCase(), MARGIN + 2, y + 3.8);
  doc.setTextColor(0, 0, 0);
  return y + 8;
}

/** Half-width right section header */
function secHRight(doc: Doc, title: string, y: number): number {
  doc.setFillColor(...DARK);
  doc.rect(rightX - 4, y, halfW + 5, 5.5, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(H);
  doc.setTextColor(...GOLD);
  doc.text(title.toUpperCase(), rightX - 2, y + 3.8);
  doc.setTextColor(0, 0, 0);
  return y + 8;
}

/** Compact label:value pair */
function lv(
  doc: Doc,
  label: string,
  val: string,
  y: number,
  opts?: { x?: number; valX?: number; maxW?: number; color?: [number, number, number]; bold?: boolean }
): number {
  const x = opts?.x ?? leftX;
  const valXPos = opts?.valX ?? (x + 28);
  const maxW = opts?.maxW ?? 52;
  const lines = doc.splitTextToSize(val || "—", maxW);
  const neededHeight = Math.max(1, lines.length) * RH;
  y = ensureSpace(doc, neededHeight, y);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(S);
  doc.setTextColor(80, 80, 80);
  doc.text(`${label}:`, x, y);
  doc.setFont("helvetica", opts?.bold || opts?.color ? "bold" : "normal");
  doc.setFontSize(M);
  doc.setTextColor(...(opts?.color || [0, 0, 0]));
  for (let i = 0; i < lines.length; i++) {
    doc.text(lines[i], valXPos, y + i * RH);
  }
  doc.setTextColor(0, 0, 0);
  return y + neededHeight;
}

/** Tight money row — label left, $ right, full width */
function moneyRow(doc: Doc, label: string, amount: string, y: number, opts?: { bold?: boolean; indent?: number; highlight?: boolean }): number {
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
  const xLabel = leftX + (opts?.indent || 0);
  doc.text(label, xLabel, y);
  doc.text(amount, MARGIN + CONTENT_WIDTH - 2, y, { align: "right" });
  doc.setTextColor(0, 0, 0);
  return y + RH;
}

// ─────────────────────────────────────────────────────────────────────
//  TICKET AUDIT TABLE
// ─────────────────────────────────────────────────────────────────────
function drawTicketAudit(
  doc: Doc,
  rows: Settlement["ticket_audit"],
  taxRate: number,
  taxMethod: "multiplier" | "divisor",
  ccFees: number,
  y: number
): number {
  y = secH(doc, "Ticket Audit", y);
  const cols = ["Tier", "Cap", "Sold", "Cmp", "%H", "Price", "Svc", "Fac", "Tax", "CC", "Gross"];
  const tierColW = 32;
  const remaining = CONTENT_WIDTH - tierColW;
  const numColW = remaining / (cols.length - 1);
  const colX: number[] = [MARGIN + 2];
  for (let i = 1; i < cols.length; i++) colX.push(MARGIN + tierColW + numColW * i - 2);

  // Header
  doc.setFillColor(...LIGHT_GRAY);
  doc.rect(MARGIN, y - 1.5, CONTENT_WIDTH, 4.5, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.5);
  doc.setTextColor(80, 80, 80);
  cols.forEach((c, i) => doc.text(c, colX[i], y + 1.5, i >= 1 ? { align: "right" } : undefined));
  y += 5;

  const totalSoldAll = rows.reduce((s, r) => s + r.sold, 0) || 1;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(0, 0, 0);
  let tCap = 0, tSold = 0, tComps = 0, tSvc = 0, tFac = 0, tTax = 0, tCc = 0, tGross = 0;

  for (const r of rows) {
    y = ensureSpace(doc, RH + 1, y);
    const tierName = doc.splitTextToSize(r.tier, tierColW - 3)[0] || r.tier;
    const pctH = r.capacity > 0 ? (r.sold / r.capacity) * 100 : 0;
    const svc = (r.ticketing_fee || 0) * r.sold;
    const fac = (r.facility_fee || 0) * r.sold;
    const tax = taxMethod === "divisor" && taxRate > 0
      ? r.gross - r.gross / (1 + taxRate)
      : r.gross * taxRate;
    const cc = ccFees * (r.sold / totalSoldAll);
    const gross = r.gross + svc + fac + tax + cc;

    doc.text(tierName, colX[0], y);
    doc.text(String(r.capacity), colX[1], y, { align: "right" });
    doc.text(String(r.sold), colX[2], y, { align: "right" });
    doc.text(String(r.comps), colX[3], y, { align: "right" });
    doc.text(`${pctH.toFixed(1)}%`, colX[4], y, { align: "right" });
    doc.text(fmt(r.price), colX[5], y, { align: "right" });
    doc.text(fmt(svc), colX[6], y, { align: "right" });
    doc.text(fmt(fac), colX[7], y, { align: "right" });
    doc.text(fmt(tax), colX[8], y, { align: "right" });
    doc.text(fmt(cc), colX[9], y, { align: "right" });
    doc.text(fmt(gross), colX[10], y, { align: "right" });

    tCap += r.capacity;
    tSold += r.sold;
    tComps += r.comps;
    tSvc += svc;
    tFac += fac;
    tTax += tax;
    tCc += cc;
    tGross += gross;
    y += RH;
  }

  // Total row
  y = ensureSpace(doc, RH + 1, y);
  doc.setFillColor(...DARK);
  doc.rect(MARGIN, y - 2.5, CONTENT_WIDTH, RH + 1.5, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(...GOLD);
  doc.text("TOTAL", colX[0], y);
  doc.text(String(tCap), colX[1], y, { align: "right" });
  doc.text(String(tSold), colX[2], y, { align: "right" });
  doc.text(String(tComps), colX[3], y, { align: "right" });
  doc.text(tCap > 0 ? `${((tSold / tCap) * 100).toFixed(1)}%` : "—", colX[4], y, { align: "right" });
  doc.text("", colX[5], y);
  doc.text(fmt(tSvc), colX[6], y, { align: "right" });
  doc.text(fmt(tFac), colX[7], y, { align: "right" });
  doc.text(fmt(tTax), colX[8], y, { align: "right" });
  doc.text(fmt(tCc), colX[9], y, { align: "right" });
  doc.text(fmt(tGross), colX[10], y, { align: "right" });
  doc.setTextColor(0, 0, 0);
  y += RH + 1;

  if (tComps > 0) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(6.5);
    doc.setTextColor(80, 80, 80);
    doc.text(
      `* ${tComps} comp ticket${tComps === 1 ? "" : "s"} listed for inventory only — NOT in totals.`,
      MARGIN + 2, y
    );
    y += RH;
  }
  return y + 1;
}

// ─────────────────────────────────────────────────────────────────────
//  EVENT + ARTIST + DEAL TERMS (two-column block)
// ─────────────────────────────────────────────────────────────────────
function drawDealTerms(doc: Doc, s: Settlement, eventDateLabel: string, y: number): number {
  y = secH(doc, "Deal Terms", y);
  const startY = y;

  // Left column
  let lY = startY;
  lY = lv(doc, "Artist", s.artist_name ?? "—", lY);
  lY = lv(doc, "Event", s.event_title ?? "—", lY);
  lY = lv(doc, "Date", eventDateLabel, lY);
  lY = lv(doc, "Deal Type", s.deal_type ?? "FLAT", lY);

  // Right column
  let rY = startY;
  rY = lv(doc, "Guarantee", fmt(s.guarantee), rY, { x: rightX, valX: rValX });
  const backendPct = (Number(s.backend_percentage) * 100).toFixed(2);
  rY = lv(doc, "Backend %", `${backendPct}%`, rY, { x: rightX, valX: rValX });
  if (s.radius_clause) {
    rY = lv(doc, "Radius", String(s.radius_clause), rY, { x: rightX, valX: rValX, maxW: 50 });
  }

  return Math.max(lY, rY) + 1;
}

// ─────────────────────────────────────────────────────────────────────
//  FINANCIAL SUMMARY (full width, single walk)
// ─────────────────────────────────────────────────────────────────────
function drawFinancialSummary(doc: Doc, s: Settlement, y: number): number {
  const grossReceipts =
    (s.total_gross || 0) + (s.ticketing_fees || 0) + (s.facility_fees || 0) +
    (s.cc_fees || 0) + (s.taxes || 0);
  const taxPct = ((s.tax_rate || 0) * 100).toFixed(2);
  const taxLabel = s.tax_method === "divisor" ? "divided out" : "added on top";

  y = secH(doc, "Financial Summary", y);
  y = moneyRow(doc, `Tickets Sold (paying): ${s.tickets_sold_count || 0}`, "", y);
  y = moneyRow(doc, "Gross Receipts", fmt(grossReceipts), y, { bold: true });
  y = moneyRow(doc, "Service Fees", `(${fmt(s.ticketing_fees || 0)})`, y, { indent: 4 });
  y = moneyRow(doc, "Facility Fees", `(${fmt(s.facility_fees || 0)})`, y, { indent: 4 });
  y = moneyRow(doc, `Tax (${taxPct}%, ${taxLabel})`, `(${fmt(s.taxes || 0)})`, y, { indent: 4 });
  y = moneyRow(doc, "CC / Processing Fees", `(${fmt(s.cc_fees || 0)})`, y, { indent: 4 });
  y = moneyRow(doc, "Net Receipts", fmt(s.net_receipts || 0), y, { highlight: true });
  return y + 1;
}

// ─────────────────────────────────────────────────────────────────────
//  EXPENSES (full width)
// ─────────────────────────────────────────────────────────────────────
function drawExpenses(doc: Doc, expenses: (SettlementExpense | ExpenseRow)[], y: number): number {
  y = secH(doc, "Expenses", y);
  let total = 0;
  if (expenses.length === 0) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(M);
    doc.setTextColor(120, 120, 120);
    doc.text("No expenses recorded.", leftX, y);
    return y + RH + 1;
  }
  for (const e of expenses) {
    const amt = "actual_amount" in e ? Number(e.actual_amount) || 0 : 0;
    y = moneyRow(doc, `${e.name}`, fmt(amt), y, { indent: 2 });
    total += amt;
  }
  y = moneyRow(doc, "Total Expenses", fmt(total), y, { bold: true });
  return y + 1;
}

// ─────────────────────────────────────────────────────────────────────
//  MERCH SETTLEMENT (compact — only if has data)
// ─────────────────────────────────────────────────────────────────────
function drawMerchSection(doc: Doc, s: Settlement, y: number): {
  y: number;
  artistPaidSellerFee: number;
  venuePaidTax: number;
  venuePaidSellerFee: number;
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

  if (items.length === 0 && venueShare === 0 && sellerFee === 0 && !s.merch_split_venue_pct) {
    return { y, artistPaidSellerFee, venuePaidTax, venuePaidSellerFee };
  }

  y = secH(doc, "Merch Settlement", y);
  // Items table — only if items exist
  if (items.length > 0) {
    const cols = ["Item", "Units", "Unit $", "Gross"];
    const colXs = [leftX, MARGIN + 80, MARGIN + 110, MARGIN + CONTENT_WIDTH - 2];
    doc.setFillColor(...LIGHT_GRAY);
    doc.rect(MARGIN, y - 1.5, CONTENT_WIDTH, 4.5, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    doc.setTextColor(80, 80, 80);
    cols.forEach((c, i) => doc.text(c, colXs[i], y + 1.5, i >= 1 ? { align: "right" } : undefined));
    y += 5;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(0, 0, 0);
    for (const item of items) {
      y = ensureSpace(doc, RH + 1, y);
      const name = doc.splitTextToSize(item.name || "—", 76)[0] || item.name || "—";
      doc.text(name, colXs[0], y);
      doc.text(String(item.units_sold || 0), colXs[1], y, { align: "right" });
      doc.text(fmt(Number(item.unit_price) || 0), colXs[2], y, { align: "right" });
      doc.text(fmt(Number(item.gross) || 0), colXs[3], y, { align: "right" });
      y += RH;
    }
  }

  // Math walk (compact)
  const splitPct = ((s.merch_split_venue_pct || 0) * 100).toFixed(1);
  const taxPct = ((s.merch_tax_rate || 0) * 100).toFixed(2);
  const taxLabel = s.merch_tax_method === "divisor" ? "divided out" : "added on top";

  y = moneyRow(doc, "Gross Merch", fmt(s.merch_total_gross || 0), y, { bold: true });
  if (discounts > 0) y = moneyRow(doc, "Less: Discounts / Free Merch", `(${fmt(discounts)})`, y, { indent: 4 });
  y = moneyRow(doc, `Sales Tax (${taxPct}%, ${taxLabel})`, `(${fmt(totalTax)})`, y, { indent: 4 });
  y = moneyRow(doc, "Net Merch Sales", fmt(s.merch_total_net || 0), y, { bold: true });
  y = moneyRow(doc, `Venue Take (${splitPct}% of net)`, fmt(venueShare), y, { indent: 4 });
  y = moneyRow(doc, "Artist Take", fmt(s.merch_artist_share || 0), y, { indent: 4 });
  if (sellerFee > 0) {
    y = moneyRow(doc, `Merch Seller Fee (paid by ${sellerPayer})`, fmt(sellerFee), y, { indent: 4 });
  }
  if (totalTax > 0) {
    const label = taxPayer === "venue" ? "Sales Tax (venue pays - artist reimburses)" : "Sales Tax (artist retains)";
    y = moneyRow(doc, label, fmt(totalTax), y, { indent: 4 });
  }
  const owedToVenue = venueShare + artistPaidSellerFee + venuePaidTax;
  y = moneyRow(doc, "Owed to Venue from Artist", fmt(owedToVenue), y, { highlight: true });
  return { y: y + 1, artistPaidSellerFee, venuePaidTax, venuePaidSellerFee };
}

// ─────────────────────────────────────────────────────────────────────
//  SETTLEMENT CALCULATION
// ─────────────────────────────────────────────────────────────────────
function drawSettlementCalc(
  doc: Doc,
  s: Settlement,
  artistPaidMerchSellerFee: number,
  venuePaidMerchTax: number,
  y: number
): number {
  y = secH(doc, "Artist Settlement", y);
  const dealType = (s.deal_type ?? "FLAT").toUpperCase();
  const pct = (Number(s.backend_percentage) * 100).toFixed(2);
  const netAfterExpenses = (s.net_receipts || 0) - (s.total_expenses || 0);

  y = moneyRow(doc, "Net Receipts", fmt(s.net_receipts), y);
  y = moneyRow(doc, "Less: Total Expenses", `(${fmt(s.total_expenses)})`, y, { indent: 4 });

  if (dealType === "VS" || dealType === "PLUS") {
    y = moneyRow(doc, "Backend Threshold", `(${fmt(s.guarantee || 0)})`, y, { indent: 4 });
    y = moneyRow(doc, "Backend Lift", fmt(netAfterExpenses - (s.guarantee || 0)), y, { bold: true });
    y = moneyRow(doc, `Artist Backend (${pct}% of overage)`, fmt(s.artist_backend), y, { indent: 4 });
    y = moneyRow(doc, "Artist Guarantee", fmt(s.guarantee), y, { indent: 4 });
  } else if (dealType === "DOOR") {
    y = moneyRow(doc, "Net After Expenses", fmt(netAfterExpenses), y, { bold: true });
    y = moneyRow(doc, `Artist Backend (${pct}% of net)`, fmt(s.artist_backend), y, { indent: 4 });
  } else {
    // FLAT / CO_PROMOTE
    y = moneyRow(doc, "Artist Guarantee", fmt(s.guarantee), y, { indent: 4 });
  }
  y = moneyRow(doc, "ARTIST WALKOUT", fmt(s.artist_total), y, { bold: true });

  // Deductions to balance due
  if ((s.deposit_paid || 0) > 0)
    y = moneyRow(doc, "Deposits Paid", `(${fmt(s.deposit_paid)})`, y, { indent: 4 });
  if ((s.cash_advance || 0) > 0)
    y = moneyRow(doc, "Cash Advances", `(${fmt(s.cash_advance)})`, y, { indent: 4 });
  if ((s.merch_venue_share || 0) > 0)
    y = moneyRow(doc, "Venue Merch Take", `(${fmt(s.merch_venue_share || 0)})`, y, { indent: 4 });
  if (artistPaidMerchSellerFee > 0)
    y = moneyRow(doc, "Merch Seller Fee (paid by artist)", `(${fmt(artistPaidMerchSellerFee)})`, y, { indent: 4 });
  if (venuePaidMerchTax > 0)
    y = moneyRow(doc, "Merch Sales Tax (venue covers)", `(${fmt(venuePaidMerchTax)})`, y, { indent: 4 });

  y = moneyRow(doc, "BALANCE DUE TO ARTIST", fmt(s.balance_due), y, { highlight: true });
  return y + 1;
}

// ─────────────────────────────────────────────────────────────────────
//  SIGNATURE LINES (compact)
// ─────────────────────────────────────────────────────────────────────
function drawSignatures(doc: Doc, y: number): number {
  y = ensureSpace(doc, 22, y);
  y = secH(doc, "Signatures", y);
  const lineW = (CONTENT_WIDTH - 10) / 2;

  doc.setDrawColor(...DARK);
  doc.setLineWidth(0.3);

  // Left: Artist / Agent
  doc.line(MARGIN, y + 8, MARGIN + lineW, y + 8);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(S);
  doc.setTextColor(80, 80, 80);
  doc.text("Tour Manager / Aritst Rep.", MARGIN, y + 12);
  doc.line(MARGIN, y + 17, MARGIN + lineW, y + 17);
  doc.text("Date", MARGIN, y + 21);

  // Right: Buyer / Promoter
  const rx = MARGIN + lineW + 10;
  doc.line(rx, y + 8, rx + lineW, y + 8);
  doc.text("Buyer / Promoter", rx, y + 12);
  doc.line(rx, y + 17, rx + lineW, y + 17);
  doc.text("Date", rx, y + 21);

  doc.setTextColor(0, 0, 0);
  return y + 24;
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
  };

  const eventTitle = settlement.event_title ?? settlement.artist_name ?? "Event";
  const eventDateLabel = settlement.event_date
    ? new Date(String(settlement.event_date).slice(0, 10) + "T12:00:00").toLocaleDateString("en-US", {
        weekday: "short", month: "short", day: "numeric", year: "numeric",
      })
    : "TBD";

  // Header (compact, no buyer info on settlements)
  let y = await addPdfHeader(doc, {
    title: `Artist Settlement — ${eventTitle}`,
    venueName: v.name,
    venueAddress: venueAddress(v),
    venueSlug: v.slug,
    showBuyerInfo: false,
    compact: true,
  });

  y = drawDealTerms(doc, settlement, eventDateLabel, y);
  y = drawTicketAudit(
    doc,
    settlement.ticket_audit ?? [],
    settlement.tax_rate ?? 0,
    (settlement.tax_method as "multiplier" | "divisor") ?? "multiplier",
    settlement.cc_fees ?? 0,
    y
  );
  y = drawFinancialSummary(doc, settlement, y);
  y = drawExpenses(doc, expenses, y);

  const merchResult = drawMerchSection(doc, settlement, y);
  y = merchResult.y;

  y = drawSettlementCalc(doc, settlement, merchResult.artistPaidSellerFee, merchResult.venuePaidTax, y);

  // Deposits detail (compact — only if any)
  if (deposits.length > 0) {
    y = secH(doc, "Deposits & Advances", y);
    for (const d of deposits) {
      const label = `${d.type}${d.date ? ` (${d.date})` : ""}${d.notes ? ` — ${d.notes}` : ""}`;
      y = moneyRow(doc, label, fmt(d.amount), y, { indent: 2 });
    }
    y += 1;
  }

  y = drawSignatures(doc, y);

  drawFooter(doc, "Artist Settlement");

  const filename = `${sanitize(settlement.artist_name ?? "Artist")}-${sanitize(eventDateLabel)}-${sanitize(venue.name)}-Artist Settlement.pdf`;
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
  };

  const eventTitle = settlement.event_title ?? settlement.artist_name ?? "Event";
  const eventDateLabel = settlement.event_date
    ? new Date(String(settlement.event_date).slice(0, 10) + "T12:00:00").toLocaleDateString("en-US", {
        weekday: "short", month: "short", day: "numeric", year: "numeric",
      })
    : "TBD";

  let y = await addPdfHeader(doc, {
    title: `Venue Settlement — ${eventTitle}`,
    venueName: v.name,
    venueAddress: venueAddress(v),
    venueSlug: v.slug,
    showBuyerInfo: false,
    compact: true,
  });

  y = drawDealTerms(doc, settlement, eventDateLabel, y);
  y = drawTicketAudit(
    doc,
    settlement.ticket_audit ?? [],
    settlement.tax_rate ?? 0,
    (settlement.tax_method as "multiplier" | "divisor") ?? "multiplier",
    settlement.cc_fees ?? 0,
    y
  );
  y = drawFinancialSummary(doc, settlement, y);
  y = drawExpenses(doc, expenses, y);

  const merchResult = drawMerchSection(doc, settlement, y);
  y = merchResult.y;

 // Deposits detail
  if (deposits.length > 0) {
    y = secH(doc, "Deposits & Advances", y);
    for (const d of deposits) {
      const label = `${d.type}${d.date ? ` (${d.date})` : ""}${d.notes ? ` — ${d.notes}` : ""}`;
      y = moneyRow(doc, label, fmt(d.amount), y, { indent: 2 });
    }
    y += 1;

  y = drawSettlementCalc(doc, settlement, merchResult.artistPaidSellerFee, merchResult.venuePaidTax, y);

  }

  // Ancillary + Venue P&L
  const ancillaryItems: [string, number][] = [
    ["Bar Revenue", settlement.bar_revenue ?? 0],
    ["Concessions", settlement.concessions_revenue ?? 0],
    ["Merch Venue Share", settlement.merch_venue_share ?? 0],
    ["Ticketing Rebate", settlement.ticketing_rebate ?? 0],
    ["Parking", settlement.parking_revenue ?? 0],
    ["Sponsorship", settlement.sponsorship_revenue ?? 0],
  ];
  let totalAnc = 0;
  for (const [, amt] of ancillaryItems) totalAnc += amt;
  if (settlement.other_ancillary?.length) {
    for (const item of settlement.other_ancillary) totalAnc += item.amount;
  }

  if (totalAnc > 0) {
    y = secH(doc, "Ancillary Revenue", y);
    for (const [label, amt] of ancillaryItems) {
      if (amt > 0) y = moneyRow(doc, label, fmt(amt), y, { indent: 2 });
    }
    if (settlement.other_ancillary?.length) {
      for (const item of settlement.other_ancillary) {
        if (item.amount > 0) y = moneyRow(doc, item.name || "Other", fmt(item.amount), y, { indent: 2 });
      }
    }
    y = moneyRow(doc, "Gross Ancillary Revenue", fmt(totalAnc), y, { bold: true });
    y += 1;
  }

  // Venue P&L
  const venueTotalRevenue = settlement.venue_total_revenue ?? (settlement.net_receipts + totalAnc);
  const venueTotalCosts = settlement.total_expenses + settlement.artist_total + merchResult.venuePaidSellerFee;
  const venueNetProfit = settlement.venue_net_profit ?? (venueTotalRevenue - venueTotalCosts);

  y = secH(doc, "Venue P&L", y);
  y = moneyRow(doc, "Gross Revenue:", fmt(venueTotalRevenue), y, { bold: true });
  y = moneyRow(doc, "Total Expenses", `(${fmt(settlement.total_expenses)})`, y, { indent: 4 });
  y = moneyRow(doc, "Artist Walkout", `(${fmt(settlement.artist_total)})`, y, { indent: 4 });
  if (merchResult.venuePaidSellerFee > 0) {
    y = moneyRow(doc, "Merch Seller Fee (venue-paid)", `(${fmt(merchResult.venuePaidSellerFee)})`, y, { indent: 4 });
  }
  y = moneyRow(doc, "NET PROFIT TO VENUE", fmt(venueNetProfit), y, { highlight: true });
  y += 1;

  y = drawSignatures(doc, y);

  drawFooter(doc, "Venue Settlement");

  const filename = `${sanitize(eventTitle)}-${sanitize(eventDateLabel)}-Venue_Settlement.pdf`;
  doc.save(filename);
}

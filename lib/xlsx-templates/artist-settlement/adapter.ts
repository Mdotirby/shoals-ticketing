import type { Settlement, TaxMethod } from "@/lib/types/settlement";
import type { ArtistOffer } from "@/lib/types/offer";

type ExpenseInput = { name: string; category: string; actual_amount: number };

/**
 * Settlement (+ its expenses, + the linked Offer if any) -> the flat field
 * map artist-settlement/manifest.json's cells expect.
 *
 * Every dollar figure here is either read directly off `settlement` (the
 * app's own already-computed fields, via lib/settlement/model.ts's
 * artistPayout()/settlementWaterfall() -- see app/admin/settlements/[id]/page.tsx
 * for where they're calculated and saved) or derived with the exact same
 * formulas as lib/pdf-templates/settlement-report/adapter.ts. This function
 * introduces no new settlement math -- the Excel design's own formulas were
 * used only to find WHICH cell each value belongs in, not to decide what
 * the value IS. settlement.balance_due already includes backend overage
 * AND any service-fee rebate (artistPayout()'s artistTotal = guarantee +
 * artistBackend + serviceFeeRebate), matching VENUE_SETTLEMENTv2's formula
 * shape, not v1's -- confirmed with Matt.
 */
export type ArtistSettlementData = {
  artist_name: string;
  venue_name: string;
  event_date_label: string;
  venue_address: string;
  agency: string;
  shows_label: string;
  venue_capacity: number;
  agent_name: string;
  show_time_label: string;
  radius_clause: string;
  agent_phone: string;
  billing: string;
  agent_email: string;
  show_lineup_line_1: string;
  show_lineup_line_2: string;
  show_lineup_line_3: string;

  guarantee: number;
  deposit_pct: number;
  deposit_amount: number;
  deal_type: string;
  deposit_due: string;
  backend_percentage: number;
  balance_due_terms: string;
  merch_split: string;
  production_by: string;
  merch_seller: string;
  other_terms: string;
  comps_label: string;

  ticket_audit: {
    tier: string;
    capacity: number;
    sold: number;
    comps: number;
    unsold: number;
    price: number;
    svc: number;
    fac: number;
    tax: number;
    cc: number;
    gross: number;
  }[];
  ticket_totals_capacity: number;
  ticket_totals_sold: number;
  ticket_totals_comps: number;
  ticket_totals_unsold: number;
  ticket_totals_avg_price: number;
  ticket_totals_svc: number;
  ticket_totals_fac: number;
  ticket_totals_tax: number;
  ticket_totals_cc: number;
  ticket_totals_gross: number;

  gbor: number;
  service_fees: number;
  facility_fees: number;
  cc_fees: number;
  tax_rate: number;
  taxes: number;
  nbor: number;

  expenses_fixed: { name: string; amount: number }[];
  expenses_variable: { name: string; amount: number }[];
  total_fixed: number;
  total_variable: number;
  total_expenses: number;

  merch_total_gross: number;
  merch_tax_label: string;
  merch_total_tax: number;
  merch_total_net: number;
  merch_venue_take_label: string;
  merch_venue_share: number;
  merch_artist_share: number;

  artist_guarantee: number;
  splitpoint: number;
  merch_venue_take_deduction: number;
  seller_fee: number;
  cash_advance: number;
  deposits_paid: number;
  backend_overage: number;
  balance_due: number;
};

function pctLabel(rate: number, digits = 1): string {
  return `${(rate * 100).toFixed(digits)}%`;
}

function taxMethodLabel(method: TaxMethod | undefined): string {
  return method === "divisor" ? "Divisor" : "Multiplier";
}

export function buildArtistSettlementData(
  settlement: Settlement,
  expenses: ExpenseInput[],
  offer: ArtistOffer | null
): ArtistSettlementData {
  // ---- Ticket audit rows: same formula as settlement-report's adapter ----
  const rows = settlement.ticket_audit || [];
  const taxRate = settlement.tax_rate || 0;
  // Per-row cc_fees/unsold/tax/gross_receipts are now real, authoritative
  // fields on TicketAuditRow (properly allocated per real order -- see
  // lib/types/settlement.ts), not something this adapter needs to
  // re-derive. An earlier version of this pro-rated settlement.cc_fees
  // across rows by sold-ticket-count, which is exactly the flat
  // per-transaction approximation the real per-order allocation replaced.
  let tCap = 0, tSold = 0, tComps = 0, tUnsold = 0, tSvc = 0, tFac = 0, tTax = 0, tCc = 0, tGross = 0;
  const ticket_audit = rows.map((r) => {
    const capacity = r.capacity || 0;
    const sold = r.sold || 0;
    const comps = r.comps || 0;
    const unsold = r.unsold ?? Math.max(0, capacity - sold - comps);
    const svc = (r.ticketing_fee || 0) * sold;
    const fac = (r.facility_fee || 0) * sold;
    const tax = r.tax || 0;
    const cc = r.cc_fees || 0;
    const rowGross = r.gross_receipts || (r.gross || 0) + svc + fac + tax + cc;

    tCap += capacity;
    tSold += sold;
    tComps += comps;
    tUnsold += unsold;
    tSvc += svc;
    tFac += fac;
    tTax += tax;
    tCc += cc;
    tGross += rowGross;

    return { tier: r.tier, capacity, sold, comps, unsold, price: r.price || 0, svc, fac, tax, cc, gross: rowGross };
  });
  // Average ticket price across tiers -- per Matt: sum of tier prices /
  // number of tiers, NOT a raw sum (the source sheet had this wrong in two
  // different ways across its own rows -- see doc-templates-xlsx/README.md).
  const avgPrice = rows.length > 0 ? rows.reduce((s, r) => s + (r.price || 0), 0) / rows.length : 0;

  // ---- Expenses ----
  const expenses_fixed = expenses
    .filter((e) => e.category === "fixed")
    .map((e) => ({ name: e.name, amount: e.actual_amount || 0 }));
  const expenses_variable = expenses
    .filter((e) => e.category === "variable")
    .map((e) => ({ name: e.name, amount: e.actual_amount || 0 }));
  const total_fixed = expenses_fixed.reduce((s, e) => s + e.amount, 0);
  const total_variable = expenses_variable.reduce((s, e) => s + e.amount, 0);
  // "Splitpoint" on this document means the pool the backend % applies to
  // (net receipts minus expenses) -- NOT settlement.splitpoint, which in
  // lib/settlement/model.ts is deliberately defined as just the guarantee
  // (the threshold the show must clear), a different, real concept that
  // happens to share the same field name. Both net_receipts and the
  // expense totals here are already real, correct, stored/computed
  // values -- this is just their difference, not new business logic.
  const netAfterExpenses = (settlement.net_receipts || 0) - (total_fixed + total_variable);

  // ---- Header / deal-terms context (from the linked Offer -- confirmed
  // with Matt to look this up live via offer_id rather than snapshotting
  // it onto Settlement; blank when no offer is linked) ----
  const o = offer;
  const showsLabel = o ? `${o.num_shows ?? ""} x ${o.show_length ?? ""}`.trim() : "";
  const lineupLines = (o?.show_lineup || []).slice(0, 3).map(
    (l) => `${l.time} - ${l.artist}${l.set_length ? ` (${l.set_length})` : ""}`
  );
  const compsParts: string[] = [];
  if (o?.comps != null) compsParts.push(`${o.comps} total`);
  if (o?.artist_comps != null) compsParts.push(`${o.artist_comps} Artist`);
  if (o?.marketing_comps != null) compsParts.push(`${o.marketing_comps} Mktg`);

  const event_date_label = settlement.event_date
    ? new Date(String(settlement.event_date).slice(0, 10) + "T12:00:00").toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "—";

  const gbor =
    (settlement.total_gross || 0) +
    (settlement.ticketing_fees || 0) +
    (settlement.facility_fees || 0) +
    (settlement.cc_fees || 0) +
    (settlement.taxes || 0);

  return {
    artist_name: settlement.artist_name || "",
    venue_name: o?.venue || "",
    event_date_label,
    venue_address: o?.venue_address || "",
    agency: o?.agency || "",
    shows_label: showsLabel,
    venue_capacity: tCap,
    agent_name: o?.agent_name || "",
    show_time_label: o?.show_time || "",
    radius_clause: settlement.radius_clause || "",
    agent_phone: o?.agent_phone || "",
    billing: o?.billing || "",
    agent_email: o?.agent_email || "",
    show_lineup_line_1: lineupLines[0] || "",
    show_lineup_line_2: lineupLines[1] || "",
    show_lineup_line_3: lineupLines[2] || "",

    guarantee: settlement.guarantee || 0,
    deposit_pct: (o?.deposit_pct || 0) / 100,
    deposit_amount: o?.deposit_amount ?? (settlement.guarantee || 0) * ((o?.deposit_pct || 0) / 100),
    deal_type: settlement.deal_type || "",
    deposit_due: o?.deposit_due || "",
    backend_percentage: settlement.backend_percentage || 0,
    balance_due_terms: o?.balance_due || "",
    merch_split: o?.merch_split || "",
    production_by: o?.production_by || "",
    merch_seller: o?.merch_seller || "",
    other_terms: o?.other_terms || "",
    comps_label: compsParts.join(" | "),

    ticket_audit,
    ticket_totals_capacity: tCap,
    ticket_totals_sold: tSold,
    ticket_totals_comps: tComps,
    ticket_totals_unsold: tUnsold,
    ticket_totals_avg_price: avgPrice,
    ticket_totals_svc: tSvc,
    ticket_totals_fac: tFac,
    ticket_totals_tax: tTax,
    ticket_totals_cc: tCc,
    ticket_totals_gross: tGross,

    gbor,
    service_fees: settlement.ticketing_fees || 0,
    facility_fees: settlement.facility_fees || 0,
    cc_fees: settlement.cc_fees || 0,
    tax_rate: taxRate,
    taxes: settlement.taxes || 0,
    nbor: settlement.net_receipts || 0,

    expenses_fixed,
    expenses_variable,
    total_fixed,
    total_variable,
    total_expenses: total_fixed + total_variable,

    merch_total_gross: settlement.merch_total_gross || 0,
    merch_tax_label: `Sales Tax (${pctLabel(settlement.merch_tax_rate || 0)}, ${taxMethodLabel(settlement.merch_tax_method)})`,
    merch_total_tax: settlement.merch_total_tax || 0,
    merch_total_net: settlement.merch_total_net || 0,
    merch_venue_take_label: `Venue Take (${pctLabel(settlement.merch_split_venue_pct || 0)} of Net)`,
    merch_venue_share: settlement.merch_venue_share || 0,
    merch_artist_share: settlement.merch_artist_share || 0,

    artist_guarantee: settlement.guarantee || 0,
    splitpoint: netAfterExpenses,
    merch_venue_take_deduction: settlement.merch_venue_share || 0,
    seller_fee:
      settlement.merch_seller_fee_payer === "artist" ? settlement.merch_seller_fee || 0 : 0,
    cash_advance: settlement.cash_advance || 0,
    deposits_paid: settlement.deposit_paid || 0,
    backend_overage: settlement.artist_backend || 0,
    balance_due: settlement.balance_due || 0,
  };
}

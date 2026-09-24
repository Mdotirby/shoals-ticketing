import type { ArtistOffer } from "@/lib/types/offer";
import { offerSurchargePerTicket, STRIPE_ONLINE_PCT, STRIPE_ONLINE_FLAT_CENTS } from "@/lib/fees/rates";
import { artistPayout } from "@/lib/settlement/model";

/**
 * ArtistOffer -> the flat field map offer/manifest.json's cells expect.
 *
 * Unlike the settlement adapters, this one has no external record to look
 * up -- an Offer export IS the ArtistOffer record. Pre-computed fields
 * (gross_potential, net_potential, total_fixed/variable/expenses) are read
 * directly off `offer`, matching how app/admin/offers/[id]/page.tsx and
 * .../new/page.tsx compute and save them.
 *
 * The artist walkout is the exception: splitpoint, backend, overage, artist
 * total and revenue to venue are DERIVED here from net potential and
 * expenses through lib/settlement/model.ts artistPayout() -- the same
 * function the offer builder, the offer PDF and settlements rely on. The
 * stored artist_backend / splitpoint / pot_walkout are deliberately ignored:
 * older offers were saved under earlier versions of the model and carry
 * values that no longer match it.
 *
 * Two things this DOES compute itself, both confirmed with Matt and NOT
 * present correctly in the source design's own formulas:
 *   - Multi-tier fee aggregation: Service/Facility/CC Fees and Taxes sum
 *     across every ticket_scaling row, not just the first (the sheet's own
 *     formulas were tier-1-only).
 *   - Average ticket price: sum of tier prices / tier count, used as the
 *     denominator for the BREAKEVEN / BARE MINIMUM "tickets needed" figures
 *     -- not a raw sum (which the sheet used inconsistently across its own
 *     copies of this template).
 *
 * CC fee: computed via lib/fees/rates.ts's offerSurchargePerTicket() -- the
 * SAME function the live offer builder pages call, so this can never drift
 * out of sync with what Matt sees while creating the offer again. That
 * function prices the full flat fee per ticket (matches the source
 * spreadsheet's own assumption -- confirmed with Matt after an earlier
 * version amortised the flat fee across an assumed order size, which
 * understated it here to match a since-corrected bug in the live page).
 */
export type OfferData = {
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

  ticket_scaling: {
    tier: string;
    capacity: number;
    comps: number;
    kills: number;
    sellable: number;
    price: number;
    svc: number;
    fac: number;
    tax: number;
    cc: number;
    allin_price: number;
    gross: number;
  }[];
  ticket_totals_capacity: number;
  ticket_totals_comps: number;
  ticket_totals_kills: number;
  ticket_totals_sellable: number;
  ticket_totals_avg_price: number;
  ticket_totals_svc: number;
  ticket_totals_fac: number;
  ticket_totals_tax: number;
  ticket_totals_cc: number;
  ticket_totals_allin_price: number;
  ticket_totals_gross: number;

  gross_potential: number;
  service_fees: number;
  facility_fees: number;
  cc_fees: number;
  adj_gross_potential: number;
  tax_rate: number;
  tax_label: string;
  taxes: number;
  net_potential: number;
  cc_rate_pct: number;
  cc_rate_flat: number;

  expenses_fixed: { name: string; amount: number }[];
  expenses_variable: { name: string; amount: number }[];
  total_fixed: number;
  total_variable: number;
  total_expenses: number;

  artist_guarantee: number;
  splitpoint: number;
  backend: number;
  overage: number;
  artist_total_potential: number;

  expenses_incl_artist: number;
  revenue_to_venue: number;
  breakeven_pct: number;
  breakeven_tickets: number;
  venue_total: number;
  bare_minimum_pct: number;
  bare_minimum_tickets: number;
  cover_band_expenses_pct: number;
  cover_band_expenses_tickets: number;
};

export function buildOfferData(offer: ArtistOffer): OfferData {
  const rows = offer.ticket_scaling || [];
  const taxRate = offer.tax_rate || 0;
  const taxMethod = offer.tax_method;

  let tCap = 0, tComps = 0, tKills = 0, tSellable = 0, tSvc = 0, tFac = 0, tTax = 0, tCc = 0, tAllin = 0, tGross = 0;
  const ticket_scaling = rows.map((r) => {
    const capacity = r.seats || 0;
    const comps = r.comps || 0;
    const kills = r.kills || 0;
    const sellable = r.sellable_cap ?? Math.max(0, capacity - comps - kills);
    // r.price is a DERIVED field the offer builder computes as net_price +
    // facility_fee + ticketing_fee (its "Sub." column) -- using it here as
    // the base "price" double-counts facility/ticketing fees (once inside
    // r.price, once again added separately below) and cascades into
    // inflated tax and CC too, since both are computed off this base.
    // r.net_price is the true base -- what the source spreadsheet's own
    // PRICE column means, and what fees/tax/cc get added ON TOP of.
    const price = r.net_price || 0;
    const svc = r.ticketing_fee || 0;
    const fac = r.facility_fee || 0;
    const tax =
      taxMethod === "divisor" && taxRate > 0 ? price - price / (1 + taxRate) : price * taxRate;
    const cc = offerSurchargePerTicket(price + svc + fac + tax);
    const allin_price = price + svc + fac + tax + cc;
    const gross = allin_price * sellable;

    tCap += capacity;
    tComps += comps;
    tKills += kills;
    tSellable += sellable;
    tSvc += svc * sellable;
    tFac += fac * sellable;
    tTax += tax * sellable;
    tCc += cc * sellable;
    tAllin += allin_price * sellable;
    tGross += gross;

    return { tier: r.name, capacity, comps, kills, sellable, price, svc, fac, tax, cc, allin_price, gross };
  });
  const avgPrice = rows.length > 0 ? rows.reduce((s, r) => s + (r.net_price || 0), 0) / rows.length : 0;

  // Multi-tier-correct fee aggregation (confirmed fix -- source sheet only
  // used tier 1 for these).
  const service_fees = tSvc;
  const facility_fees = tFac;
  const cc_fees = tCc;
  const taxes = tTax;
  const gross_potential = offer.gross_potential ?? tGross;
  // Adjusted gross is gross less the ticketing and facility fees -- the two
  // fees that are not the show's money. The card surcharge is NOT one of
  // them: it is shown on its own line as a cost, but it is not carved out of
  // the face value the artist's split is measured against.
  //
  // Subtracting it here made the printed column contradict itself. On a
  // divisor offer it read Gross 19,344 -> Adj 14,061.60 -> Tax 1,290.96 ->
  // Net 13,589.04, and 14,061.60 - 1,290.96 is 12,770.64, not 13,589.04. On
  // a multiplier offer it printed a NET POTENTIAL larger than the ADJ. GROSS
  // POTENTIAL above it. Net and Tax were right all along -- both come off
  // the stored figures the builder computes -- so Adj. Gross was the one
  // line on the sheet that disagreed with the screen, by exactly the card
  // surcharge, on every offer exported.
  const adj_gross_potential = gross_potential - (service_fees + facility_fees);
  // Only the divisor case has tax inside the face to take back out; under
  // multiplier it is charged on top and was never in here. The old fallback
  // subtracted it either way.
  const net_potential =
    offer.net_potential ??
    (taxMethod === "divisor" ? adj_gross_potential - taxes : adj_gross_potential);

  const expenses_fixed = (offer.fixed_expenses || []).map((e) => ({ name: e.name, amount: e.amount || 0 }));
  const expenses_variable = (offer.variable_expenses || []).map((e) => ({ name: e.name, amount: e.amount || 0 }));
  const total_fixed = offer.total_fixed ?? expenses_fixed.reduce((s, e) => s + e.amount, 0);
  const total_variable = offer.total_variable ?? expenses_variable.reduce((s, e) => s + e.amount, 0);
  const total_expenses = offer.total_expenses ?? total_fixed + total_variable;

  const guarantee = offer.guarantee || 0;
  const backendPct = (Number(offer.backend_percentage) || 0) / 100;
  const dealType = String(offer.deal_type || "FLAT").toUpperCase();

  // Splitpoint on this document is the pool the backend % applies to: net
  // potential minus expenses. That is the offer builder's definition too.
  const netAfterExpenses = net_potential - total_expenses;

  // One implementation, shared with the builder, the PDF and settlements:
  //   backend = pool x backend%
  //   overage = backend - guarantee, and nothing if that is not positive
  //   artist  = guarantee + overage -- the greater of the guarantee and the
  //             percentage share, never both
  //
  // This used to read offer.artist_backend as "backend". But the builder
  // saves the OVERAGE into artist_backend, so the sheet printed the overage
  // on the Backend row, subtracted the guarantee from it a second time for
  // Overage, and took max(guarantee, overage) as the VS total -- understating
  // the artist by exactly the guarantee on every VS offer.
  const payout = artistPayout({
    netReceipts: net_potential,
    totalExpenses: total_expenses,
    guarantee,
    backendPct,
    dealType,
  });
  const hasBackend = dealType !== "FLAT";
  const backend = hasBackend && netAfterExpenses > 0 ? netAfterExpenses * backendPct : 0;
  const overage = hasBackend ? payout.artistBackend : 0;
  const artist_total_potential = payout.dealTotal;

  const expenses_incl_artist = total_expenses + artist_total_potential;
  // The VENUE's potential. Derived rather than read from offer.pot_walkout for
  // the same stale-row reason as above; on a current offer the two agree.
  const revenue_to_venue = netAfterExpenses - artist_total_potential;

  const totalCapacity = tCap || 1;
  const breakeven_tickets = avgPrice > 0 ? expenses_incl_artist / avgPrice : 0;
  const bare_minimum_tickets = avgPrice > 0 ? guarantee / avgPrice : 0;
  const cover_band_expenses_tickets = avgPrice > 0 ? (total_expenses + guarantee) / avgPrice : 0;

  const o = offer;
  const showsLabel = `${o.num_shows ?? ""} x ${o.show_length ?? ""}`.trim();
  const lineupLines = (o.show_lineup || []).slice(0, 3).map(
    (l) => `${l.time} - ${l.artist}${l.set_length ? ` (${l.set_length})` : ""}`
  );
  const compsParts: string[] = [];
  if (o.comps != null) compsParts.push(`${o.comps} total`);
  if (o.artist_comps != null) compsParts.push(`${o.artist_comps} Artist`);
  if (o.marketing_comps != null) compsParts.push(`${o.marketing_comps} Mktg`);

  const event_date_label = o.event_date
    ? new Date(String(o.event_date).slice(0, 10) + "T12:00:00").toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "—";

  return {
    artist_name: o.artist_name || "",
    venue_name: o.venue || "",
    event_date_label,
    venue_address: o.venue_address || "",
    agency: o.agency || "",
    shows_label: showsLabel,
    venue_capacity: tCap,
    agent_name: o.agent_name || "",
    show_time_label: o.show_time || "",
    radius_clause: [o.radius_distance, o.radius_days_prior != null ? `${o.radius_days_prior}d prior` : null, o.radius_days_after != null ? `${o.radius_days_after} days after` : null]
      .filter(Boolean)
      .join(" | "),
    agent_phone: o.agent_phone || "",
    billing: o.billing || "",
    agent_email: o.agent_email || "",
    show_lineup_line_1: lineupLines[0] || "",
    show_lineup_line_2: lineupLines[1] || "",
    show_lineup_line_3: lineupLines[2] || "",

    guarantee,
    deposit_pct: (o.deposit_pct || 0) / 100,
    deposit_amount: o.deposit_amount ?? guarantee * ((o.deposit_pct || 0) / 100),
    deal_type: o.deal_type || "",
    deposit_due: o.deposit_due || "",
    backend_percentage: backendPct,
    balance_due_terms: o.balance_due || "",
    merch_split: o.merch_split || "",
    production_by: o.production_by || "",
    merch_seller: o.merch_seller || "",
    other_terms: o.other_terms || "",
    comps_label: compsParts.join(" | "),

    ticket_scaling,
    ticket_totals_capacity: tCap,
    ticket_totals_comps: tComps,
    ticket_totals_kills: tKills,
    ticket_totals_sellable: tSellable,
    ticket_totals_avg_price: avgPrice,
    ticket_totals_svc: tSvc,
    ticket_totals_fac: tFac,
    ticket_totals_tax: tTax,
    ticket_totals_cc: tCc,
    ticket_totals_allin_price: tSellable > 0 ? tAllin / tSellable : 0,
    ticket_totals_gross: tGross,

    gross_potential,
    service_fees,
    facility_fees,
    cc_fees,
    adj_gross_potential,
    tax_rate: taxRate,
    // The template's label was the literal "Taxes (Multiplier)", so every
    // divisor offer -- 21 of the 40 on file -- told the agent the wrong
    // method while B36 printed the right rate beside it. The settlement
    // documents already derive this; the offer sheet now does too.
    tax_label: `Taxes (${taxMethod === "divisor" ? "Divisor" : "Multiplier"})`,
    taxes,
    net_potential,
    // J34/K34 sat on the CC/Processing Fees row as the literal 0.029 and
    // 0.30. They happen to match today, but nothing tied them to the rate
    // L34 is actually computed with, so a rate change would have moved the
    // money without moving the rate printed next to it.
    cc_rate_pct: STRIPE_ONLINE_PCT,
    cc_rate_flat: STRIPE_ONLINE_FLAT_CENTS / 100,

    expenses_fixed,
    expenses_variable,
    total_fixed,
    total_variable,
    total_expenses,

    artist_guarantee: guarantee,
    splitpoint: netAfterExpenses,
    backend,
    overage,
    artist_total_potential,

    expenses_incl_artist,
    revenue_to_venue,
    breakeven_pct: breakeven_tickets / totalCapacity,
    breakeven_tickets: Math.round(breakeven_tickets),
    venue_total: revenue_to_venue,
    bare_minimum_pct: bare_minimum_tickets / totalCapacity,
    bare_minimum_tickets: Math.round(bare_minimum_tickets),
    cover_band_expenses_pct: cover_band_expenses_tickets / totalCapacity,
    cover_band_expenses_tickets: Math.round(cover_band_expenses_tickets),
  };
}

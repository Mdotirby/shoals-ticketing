import type { ArtistOffer } from "@/lib/types/offer";
import { artistPayout } from "@/lib/settlement/model";
import { talentInExpenses } from "@/lib/offers/defaults";
import { doorDeductions, joinNames, offTopNames } from "@/lib/offers/door";
import { artistFacilityShare, artistFacPerTicket } from "@/lib/offers/facilityShare";
import { cardExpenseAtSellout, cardSurchargeExact, withoutCardExpense, CARD_EXPENSE_NAME } from "@/lib/offers/cardExpense";

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
 * CC fee: computed via lib/offers/cardExpense.ts's cardSurchargeExact() --
 * the SAME function the live offer builder pages call, so this can never
 * drift out of sync with what Matt sees while creating the offer. Exactly
 * 2.9% + exactly $0.30, grossed up so the surcharge covers the fee Stripe
 * actually takes rather than falling short of it. It prices the
 * full flat fee per ticket (matches the source spreadsheet's own assumption
 * -- confirmed with Matt after an earlier version amortised the flat fee
 * across an assumed order size, which understated it here to match a
 * since-corrected bug in the live page).
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
  /** Blanked — the card fee is not a deduction here. */
  cc_label: string;
  cc_fees: number | null;
  adj_gross_potential: number;
  tax_rate: number;
  tax_label: string;
  taxes: number;
  net_potential: number;
  cc_rate_pct: number | null;
  cc_rate_flat: number | null;

  expenses_fixed: { name: string; amount: number }[];
  expenses_variable: { name: string; amount: number }[];
  total_fixed: number;
  total_variable: number;
  total_expenses: number;

  artist_guarantee: number;
  /** A64-A66: the template's row names, renamed on a door deal. */
  splitpoint_label: string;
  backend_label: string;
  overage_label: string;
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
    // Under `divisor` the tax is already INSIDE the face -- that is what
    // divisor means -- so it is shown in the TAX column as a memo but must
    // not be added again to reach what the buyer pays. Adding it made the
    // sheet quote an all-in of $26.79 on Sunny Sweeney's tier where the
    // builder quotes $25.00, and charged the card fee on the inflated base
    // on top of that. Only a `multiplier` tax is genuinely added on top.
    const isDivisor = taxMethod === "divisor";
    const tax = isDivisor && taxRate > 0 ? price - price / (1 + taxRate) : price * taxRate;
    const preCc = price + svc + fac + (isDivisor ? 0 : tax);
    // Exact, not rounded to the cent: this is multiplied by the tier's seat
    // count two lines down, and it must land on the same total as the show
    // expense below. See lib/offers/cardExpense.ts.
    const cc = cardSurchargeExact(preCc);
    const allin_price = preCc + cc;
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
  const taxes = tTax;
  /**
   * Gross is everything the buyer pays — the all-in, card fee included.
   *
   * It used to be the sub-total (face + service + facility), which left the
   * surcharge out of gross while the expense list charged it. That subtracts
   * money that was never added: on Sunny Sweeney the buyer paid $13,015.60,
   * the sheet called gross $12,480.00, and then took $535.60 of card fee out
   * as a cost. $535.60 of pool, and at a 65% backend about $348 of artist
   * money, against what settlement will actually produce — because settlement
   * does the opposite and carries the surcharge through NBOR so the expense
   * removes it once (see lib/settlement/model.ts).
   *
   * It also made the sheet contradict itself: the scaling table totalled
   * $13,015.60 and the summary said $12,480.00, two numbers called gross
   * differing by exactly the card fee.
   *
   * Computed, not read from offer.gross_potential — the stored figure follows
   * the old definition and would reintroduce both problems.
   */
  const gross_potential = tGross;

  // Gross less the two fees that are not the show's money. The card fee is
  // not one of them: it stays in and leaves once, below, as an expense.
  const adj_gross_potential = gross_potential - (service_fees + facility_fees);

  /**
   * Tax comes out under BOTH methods now, which it did not before.
   *
   * Gross is the all-in, so a multiplier tax is inside it — it is charged on
   * top of the face at checkout and the buyer pays it. Under divisor it is
   * inside the face and therefore inside gross too. Either way adjusted gross
   * carries it and net has to take it out.
   *
   * `taxes` is computed per tier off net_price, so it is tax on FACE only —
   * the card fee is not taxed, and must not be.
   */
  const net_potential = adj_gross_potential - taxes;

  // On a door deal, say which lines come off the door before the split.
  const isDoor = String(offer.deal_type || "").toUpperCase() === "DOOR";
  const expenses_fixed = (offer.fixed_expenses || []).map((e) => ({
    name: isDoor && e.off_top ? `${e.name} (off the top)` : e.name,
    amount: e.amount || 0,
  }));

  // The card surcharge is a show expense, derived from the rate rather than
  // read off the record. Deriving it rather than trusting the stored rows
  // matters for the same reason the walkout below is derived: an offer saved
  // before this existed carries either no card line at all (21 of the 40 on
  // file), or a hand-entered 3% of gross (13), or a 0% line (6). Any legacy
  // row is dropped so the derived one replaces it instead of stacking.
  const cardExpense = cardExpenseAtSellout(rows, { taxMethod, taxRate });
  const ownVariable = withoutCardExpense(offer.variable_expenses || []).map((e) => ({
    name: e.name,
    amount: e.amount || 0,
  }));
  const expenses_variable = [...ownVariable, { name: CARD_EXPENSE_NAME, amount: cardExpense.amount }];
  const total_fixed = offer.total_fixed ?? expenses_fixed.reduce((s, e) => s + e.amount, 0);
  // Sum the offer's own rate lines when it has them; fall back to the stored
  // total when it does not, since some records carry totals without rows.
  // Then add the card surcharge, which is derived either way.
  const ownVariableTotal =
    ownVariable.length > 0
      ? ownVariable.reduce((s, e) => s + e.amount, 0)
      : offer.total_variable ?? 0;
  const total_variable = ownVariableTotal + cardExpense.amount;
  const total_expenses = total_fixed + total_variable;

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
    // DOOR splits receipts directly: out comes the surcharge inside
    // net_potential, and any lines the deal takes off the top.
    cardSurcharge: cardExpense.amount,
    doorDeductions: doorDeductions(offer.fixed_expenses, dealType),
    facilityFeeToArtist: artistFacilityShare(rows),
  });
  const hasBackend = dealType !== "FLAT";
  const backend = dealType === "DOOR"
    ? payout.artistBackend
    : hasBackend && netAfterExpenses > 0 ? netAfterExpenses * backendPct : 0;
  // A door deal has no overage; that row carries the facility fee share.
  const overage = isDoor ? payout.facilityFeeToArtist : hasBackend ? payout.artistBackend : 0;
  const facPer = artistFacPerTicket(rows);
  const offTop = offTopNames(offer.fixed_expenses);
  // B18 spells the deal out, so the sheet says what the numbers are.
  const dealLabel = [
    isDoor
      ? `DOOR ${Math.round(backendPct * 100)}/${100 - Math.round(backendPct * 100)}${offTop.length ? ` after ${joinNames(offTop)}` : ""}`
      : String(offer.deal_type || ""),
    facPer > 0 ? `+ $${facPer.toFixed(2)}/tkt FAC to artist` : "",
  ].filter(Boolean).join(" ");
  const artist_total_potential = payout.dealTotal;

  // On FLAT, PLUS and BONUS the guarantee is the Talent line inside
  // total_expenses, so only what the artist earns beyond it is a further cost.
  // Subtracting the whole artist total there charged the guarantee twice.
  // Read off the row: older offers have Talent at $0.
  const talent = talentInExpenses(offer.fixed_expenses, dealType);
  const artistCostBeyondExpenses = artist_total_potential - talent;
  const expenses_incl_artist = total_expenses + artistCostBeyondExpenses;
  // The VENUE's potential. Derived rather than read from offer.pot_walkout for
  // the same stale-row reason as above; on a current offer the two agree.
  const revenue_to_venue = netAfterExpenses - artistCostBeyondExpenses;

  const totalCapacity = tCap || 1;
  const breakeven_tickets = avgPrice > 0 ? expenses_incl_artist / avgPrice : 0;
  const bare_minimum_tickets = avgPrice > 0 ? guarantee / avgPrice : 0;
  const cover_band_expenses_tickets =
    avgPrice > 0 ? (total_expenses + guarantee - talent) / avgPrice : 0;

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
    deal_type: dealLabel,
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
    /**
     * The CC row is blanked out of the deduction stack.
     *
     * The template has a "CC/Processing Fees" line between Facility Fees and
     * ADJ. GROSS, and everything in that column is a subtraction. The card
     * fee is not subtracted there — it is inside gross and comes out once, in
     * the expenses below — so printing it mid-stack read as a second charge:
     * 12,480 − 2,080 − 0 − 535.60 is 9,864.40, and the next row said 10,400.
     *
     * Blanked rather than relabelled. A number sitting in a column of
     * deductions that is not deducted is a question every reader has to work
     * out, and the answer is already on the expense line that carries it.
     */
    cc_label: "",
    cc_fees: null,
    cc_rate_pct: null,
    cc_rate_flat: null,
    adj_gross_potential,
    tax_rate: taxRate,
    // The template's label was the literal "Taxes (Multiplier)", so every
    // divisor offer -- 21 of the 40 on file -- told the agent the wrong
    // method while B36 printed the right rate beside it. The settlement
    // documents already derive this; the offer sheet now does too.
    tax_label: `Taxes (${taxMethod === "divisor" ? "Divisor" : "Multiplier"})`,
    taxes,
    net_potential,

    expenses_fixed,
    expenses_variable,
    total_fixed,
    total_variable,
    total_expenses,

    artist_guarantee: guarantee,
    splitpoint_label: isDoor ? (offTop.length ? `Door after ${joinNames(offTop)}` : "Door (face value)") : "Splitpoint",
    backend_label: isDoor ? "Door share" : "Backend",
    overage_label: isDoor ? "Facility fee to artist" : "Overage",
    // On a door deal the split runs on the door, not on net after expenses.
    splitpoint: isDoor ? payout.overage : netAfterExpenses,
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

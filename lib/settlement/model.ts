/**
 * The settlement waterfall — one definition, imported everywhere.
 *
 * This lived in four places (the settlement page, POST /api/settlements,
 * the refresh route, and the PDF) and all four disagreed. The page computed
 * net receipts as an identity that reduced to total_gross; the create route
 * used the documented model; the PDF printed a subtraction column whose lines
 * didn't reach the total it printed underneath them.
 *
 *   gross receipts   ALL-IN ticket gross — face + service fee + facility fee.
 *                    What the buyer paid for admission, before sales tax and
 *                    before the card surcharge.
 *
 *   adjusted gross   gross − service − facility. The artist's face value.
 *
 *   net receipts     adjusted gross − sales tax. The split base.
 *
 *   net after exp.   net receipts − expenses. The pool.
 *
 *   overage          (net after expenses × backend%) − guarantee.
 *
 *   artist total     guarantee + overage, when the overage is positive —
 *                    i.e. the better of the guarantee or the percentage,
 *                    never both.
 *
 * ── Why tax only subtracts on divisor events ─────────────────────────────
 * Sales tax never belongs to the artist under either method — the difference
 * is only whether it was ever inside adjusted gross to begin with.
 *
 *   divisor    — the face price is tax-INCLUSIVE, so the tax is sitting inside
 *                adjusted gross and has to be backed out.
 *   multiplier — the tax was charged ON TOP of face at checkout and was never
 *                part of adjusted gross. Subtracting it again would take it out
 *                of the artist's split base a second time.
 *
 * ── Where the card surcharge lives ───────────────────────────────────────
 * In the EXPENSES, once, and nowhere else (Matt, confirmed).
 *
 * It used to be deducted here, on the way from GBOR to NBOR, and left out of
 * the expense list entirely. It is now the other way round: the waterfall
 * carries it through — the buyer paid it, so it is inside GBOR and stays
 * inside NBOR — and a single uneditable expense line takes it out.
 *
 * The two arrangements land on the SAME pool, because the surcharge is added
 * and removed either way. That is the point, and it is what makes the change
 * safe on settlements already finalised: Muscle Shoals Meets the 90s was paid
 * $39,451.92 on a 100% backend, and it still is. Deducting it in both places
 * would have made that $38,161.89 — $1,290.03 less than the cheque that was
 * actually written.
 *
 * DOOR is the one deal that splits net receipts directly, with no expense
 * recoupment, so it never sees that expense line. It gets `cardSurcharge`
 * passed in and takes it off itself; see artistPayout below.
 *
 * The exception is a fees-included event, where the venue absorbs the
 * surcharge — computeEventAudit carves it out of face value before these
 * numbers are ever built.
 */

import type { TaxMethod } from "@/lib/types/settlement";

export type SettlementWaterfallInput = {
  /** Ticket gross: face + service + facility, before tax and card surcharge. */
  totalGross: number;
  ticketingFees: number;
  facilityFees: number;
  taxRate: number;
  taxMethod: TaxMethod;
  /** Card surcharge collected from buyers — part of GBOR, and carried through
   *  into NBOR. It leaves as an expense line, not here. */
  ccFees?: number;
};

export type SettlementWaterfall = {
  /**
   * GROSS BOX OFFICE RECEIPTS — everything the buyer paid, card surcharge and
   * sales tax included. This is the figure that ties to the Stripe deposit,
   * which is what makes a settlement checkable against a bank statement.
   *
   * Distinct from `grossReceipts` below, which is the ticket side only. An
   * earlier version of this page used the narrower figure and called it
   * "Gross Receipts", so the settlement reconciled to nothing.
   */
  gbor: number;
  /** Ticket-side gross: face + service + facility. Not the all-in. */
  grossReceipts: number;
  adjGross: number;
  taxes: number;
  /**
   * NET BOX OFFICE RECEIPTS: GBOR − service − facility − tax.
   *
   * The card surcharge is NOT taken out here. It is a show expense, and
   * subtracting it in both places would charge the show twice for one
   * surcharge.
   */
  netReceipts: number;
  /** The surcharge carried inside netReceipts, echoed back so callers can
   *  build the expense line that removes it — and so DOOR can undo it. */
  cardSurcharge: number;
  /** netReceipts without the surcharge: face value, the true split base.
   *  Only for the deals that split receipts directly rather than a pool. */
  netReceiptsExCard: number;
};

export function settlementWaterfall(
  input: SettlementWaterfallInput
): SettlementWaterfall {
  const { totalGross, ticketingFees, facilityFees, taxRate, taxMethod } = input;
  const ccFees = input.ccFees ?? 0;

  const grossReceipts = totalGross;
  const adjGross = grossReceipts - ticketingFees - facilityFees;

  const taxes =
    taxMethod === "divisor" && taxRate > 0
      ? adjGross - adjGross / (1 + taxRate)
      : adjGross * taxRate;

  // GBOR adds back what the buyer paid on top of the ticket: the card
  // surcharge always, and sales tax only when it was charged additively. On a
  // divisor event the tax is already inside the face price, so adding it here
  // would count it twice.
  const taxChargedOnTop = taxMethod === "divisor" ? 0 : taxes;
  const gbor = grossReceipts + taxChargedOnTop + ccFees;

  // NBOR = GBOR − service − facility − tax. The card surcharge stays in, and
  // comes out once as an expense. Algebraically this lands on face value plus
  // the surcharge under multiplier, and face-less-embedded-tax plus the
  // surcharge under divisor.
  const netReceipts = gbor - ticketingFees - facilityFees - taxes;

  return {
    gbor,
    grossReceipts,
    adjGross,
    taxes,
    netReceipts,
    cardSurcharge: ccFees,
    netReceiptsExCard: netReceipts - ccFees,
  };
}

export type ArtistPayoutInput = {
  netReceipts: number;
  totalExpenses: number;
  guarantee: number;
  /** Backend share as a DECIMAL (0.85), not a percent. */
  backendPct: number;
  dealType: string | null | undefined;
  /** Total service fees collected — the base the rebate is taken from. */
  ticketingFees?: number;
  /**
   * Share of the service fee handed back to the promoter, as a DECIMAL
   * (0.5 = 50%). Stored as a percentage rather than a flat per-ticket amount
   * so it follows the service fee if that ever changes, instead of silently
   * going stale.
   *
   * This is NOT part of the deal split — it sits outside the guarantee and
   * backend, on top of whatever the deal produces.
   */
  serviceFeeRebatePct?: number;
  /**
   * The card surcharge carried inside netReceipts.
   *
   * Only DOOR needs it. Every other deal measures a pool that has already had
   * the surcharge removed by its expense line; DOOR splits net receipts
   * directly and recoups no expenses, so it would otherwise hand the artist a
   * percentage of money that goes to Stripe.
   */
  cardSurcharge?: number;
};

export type ArtistPayout = {
  netAfterExpenses: number;
  /**
   * The pool the backend percentage is measured against — net receipts
   * minus expenses. Always equal to netAfterExpenses; kept as its own
   * field because "Splitpoint" is the label used on the settlement/offer
   * documents and UI.
   *
   * A prior version of this function returned the guarantee here instead
   * (rationale: "the threshold the show clears before backend is earned").
   * That reading doesn't match what the field has always meant on the
   * actual documents and to Matt -- older stored offers/settlements
   * already hold pool values under this field name, not guarantee values,
   * so redefining it to mean guarantee silently made every existing
   * record's stored `splitpoint` mean something different from what it
   * meant when it was saved.
   */
  splitpoint: number;
  overage: number;
  artistBackend: number;
  /** What the deal itself produces, before any service-fee rebate. */
  dealTotal: number;
  /** Service fee handed back, outside the deal. */
  serviceFeeRebate: number;
  /** dealTotal + serviceFeeRebate — the figure to write the cheque for. */
  artistTotal: number;
};

/** The label the card surcharge carries on a settlement's expense list. */
export const SETTLEMENT_CARD_EXPENSE_NAME = "Card processing (buyer-funded surcharge)";

export type SettlementExpenseLike = {
  name?: string | null;
  estimated_amount?: number | null;
  actual_amount?: number | null;
};

/**
 * A settlement's expense rows with the card surcharge appended as a locked
 * line, and any stored card row removed first.
 *
 * Derived rather than stored: the surcharge is whatever the orders actually
 * carried, so a row in settlement_expenses would go stale the moment a refund
 * landed, and could be edited to a number that no longer matches the ledger.
 */
export function withCardExpense<T extends SettlementExpenseLike>(
  expenses: T[],
  cardSurcharge: number,
): Array<T | { name: string; estimated_amount: number; actual_amount: number; locked: true }> {
  const own = (Array.isArray(expenses) ? expenses : []).filter(
    (e) => !/card processing|credit\s*card|stripe|processing fee/i.test(String(e?.name ?? "")),
  );
  if (!(cardSurcharge > 0)) return own;
  return [
    ...own,
    {
      name: SETTLEMENT_CARD_EXPENSE_NAME,
      estimated_amount: cardSurcharge,
      actual_amount: cardSurcharge,
      locked: true as const,
    },
  ];
}

export function artistPayout(input: ArtistPayoutInput): ArtistPayout {
  const { netReceipts, totalExpenses, guarantee, backendPct } = input;
  const dealType = String(input.dealType ?? "FLAT").toUpperCase();

  const netAfterExpenses = netReceipts - totalExpenses;
  const serviceFeeRebate =
    (input.ticketingFees ?? 0) * (input.serviceFeeRebatePct ?? 0);

  // Pure door deal: a straight percentage of net, with no guarantee floor and
  // no expense recoupment. Because it recoups nothing, it never meets the
  // expense line that takes the card surcharge back out, so it takes it out
  // here -- otherwise the artist is paid a share of Stripe's cut.
  if (dealType === "DOOR") {
    const doorBase = netReceipts - (input.cardSurcharge ?? 0);
    const artistBackend = doorBase > 0 ? doorBase * backendPct : 0;
    return {
      netAfterExpenses,
      splitpoint: netAfterExpenses,
      overage: doorBase,
      artistBackend,
      dealTotal: artistBackend,
      serviceFeeRebate,
      artistTotal: artistBackend + serviceFeeRebate,
    };
  }

  // FLAT / CO_PROMOTE: guarantee only, no backend.
  if (dealType === "FLAT" || dealType === "CO_PROMOTE") {
    return {
      netAfterExpenses,
      splitpoint: netAfterExpenses,
      overage: 0,
      artistBackend: 0,
      dealTotal: guarantee,
      serviceFeeRebate,
      artistTotal: guarantee + serviceFeeRebate,
    };
  }

  // VS / PLUS / BONUS — a true "versus" deal:
  //
  //   overage = (net after expenses × backend%) − guarantee
  //   artist  = guarantee + overage, when the overage is positive
  //
  // The percentage runs on the WHOLE pool, and the guarantee is then recouped
  // out of the artist's own share. Equivalent to max(guarantee, pool × pct):
  // the artist takes the better of the two, never both.
  //
  // Not (pool − guarantee) × pct, which applies the percentage only to what is
  // left after the guarantee. That reads plausibly and is a different deal —
  // on Drivin' N Cryin' (pool $3,000, guarantee $2,000, 70%) it pays $2,700
  // instead of $2,100, handing the artist $600 that isn't theirs.
  const overage = netAfterExpenses * backendPct - guarantee;
  const artistBackend = overage > 0 ? overage : 0;
  return {
    netAfterExpenses,
    splitpoint: netAfterExpenses,
    overage,
    artistBackend,
    dealTotal: guarantee + artistBackend,
    serviceFeeRebate,
    artistTotal: guarantee + artistBackend + serviceFeeRebate,
  };
}

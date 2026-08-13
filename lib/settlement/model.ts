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
 *   overage          net after expenses − guarantee.
 *
 *   artist total     guarantee + (overage × backend%), when overage > 0.
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
 * ── Why the card surcharge never appears ─────────────────────────────────
 * The buyer funds it and it goes straight to Stripe, so it was never part of
 * the ticket gross being split. The exception is a fees-included event, where
 * the venue absorbs it — computeEventAudit carves it out of face value before
 * these numbers are ever built.
 */

import type { TaxMethod } from "@/lib/types/settlement";

export type SettlementWaterfallInput = {
  /** Ticket gross: face + service + facility, before tax and card surcharge. */
  totalGross: number;
  ticketingFees: number;
  facilityFees: number;
  taxRate: number;
  taxMethod: TaxMethod;
  /** Card surcharge collected from buyers — part of GBOR, deducted to reach NBOR. */
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
  /** NET BOX OFFICE RECEIPTS: GBOR − service − facility − card − tax. */
  netReceipts: number;
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

  // NBOR = GBOR − service − facility − card − tax. Algebraically this lands on
  // face value under multiplier, and face-less-embedded-tax under divisor —
  // which is the same answer the ticket-side walk gives, arrived at from the
  // number that actually hit the bank.
  const netReceipts = gbor - ticketingFees - facilityFees - ccFees - taxes;

  return { gbor, grossReceipts, adjGross, taxes, netReceipts };
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
};

export type ArtistPayout = {
  netAfterExpenses: number;
  /** The threshold the show clears before backend is earned — the guarantee. */
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

export function artistPayout(input: ArtistPayoutInput): ArtistPayout {
  const { netReceipts, totalExpenses, guarantee, backendPct } = input;
  const dealType = String(input.dealType ?? "FLAT").toUpperCase();

  const netAfterExpenses = netReceipts - totalExpenses;
  const serviceFeeRebate =
    (input.ticketingFees ?? 0) * (input.serviceFeeRebatePct ?? 0);

  // Pure door deal: a straight percentage of net, with no guarantee floor and
  // no expense recoupment.
  if (dealType === "DOOR") {
    const artistBackend = netReceipts > 0 ? netReceipts * backendPct : 0;
    return {
      netAfterExpenses,
      splitpoint: 0,
      overage: netReceipts,
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
      splitpoint: 0,
      overage: 0,
      artistBackend: 0,
      dealTotal: guarantee,
      serviceFeeRebate,
      artistTotal: guarantee + serviceFeeRebate,
    };
  }

  // VS / PLUS / BONUS: promoter recoups expenses and the guarantee, then the
  // artist earns their share of whatever is left.
  const overage = netAfterExpenses - guarantee;
  const artistBackend = overage > 0 ? overage * backendPct : 0;
  return {
    netAfterExpenses,
    splitpoint: guarantee,
    overage,
    artistBackend,
    dealTotal: guarantee + artistBackend,
    serviceFeeRebate,
    artistTotal: guarantee + artistBackend + serviceFeeRebate,
  };
}

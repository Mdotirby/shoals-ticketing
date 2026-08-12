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
  /** ALL-IN ticket gross: face + service + facility. */
  totalGross: number;
  ticketingFees: number;
  facilityFees: number;
  taxRate: number;
  taxMethod: TaxMethod;
};

export type SettlementWaterfall = {
  grossReceipts: number;
  adjGross: number;
  taxes: number;
  netReceipts: number;
};

export function settlementWaterfall(
  input: SettlementWaterfallInput
): SettlementWaterfall {
  const { totalGross, ticketingFees, facilityFees, taxRate, taxMethod } = input;

  const grossReceipts = totalGross;
  const adjGross = grossReceipts - ticketingFees - facilityFees;

  const taxes =
    taxMethod === "divisor" && taxRate > 0
      ? adjGross - adjGross / (1 + taxRate)
      : adjGross * taxRate;

  // Only the divisor case removes tax — under multiplier it was additive and
  // was never inside adjGross. See the header note.
  const netReceipts = taxMethod === "divisor" ? adjGross - taxes : adjGross;

  return { grossReceipts, adjGross, taxes, netReceipts };
}

export type ArtistPayoutInput = {
  netReceipts: number;
  totalExpenses: number;
  guarantee: number;
  /** Backend share as a DECIMAL (0.85), not a percent. */
  backendPct: number;
  dealType: string | null | undefined;
};

export type ArtistPayout = {
  netAfterExpenses: number;
  /** The threshold the show clears before backend is earned — the guarantee. */
  splitpoint: number;
  overage: number;
  artistBackend: number;
  artistTotal: number;
};

export function artistPayout(input: ArtistPayoutInput): ArtistPayout {
  const { netReceipts, totalExpenses, guarantee, backendPct } = input;
  const dealType = String(input.dealType ?? "FLAT").toUpperCase();

  const netAfterExpenses = netReceipts - totalExpenses;

  // Pure door deal: a straight percentage of net, with no guarantee floor and
  // no expense recoupment.
  if (dealType === "DOOR") {
    const artistBackend = netReceipts > 0 ? netReceipts * backendPct : 0;
    return {
      netAfterExpenses,
      splitpoint: 0,
      overage: netReceipts,
      artistBackend,
      artistTotal: artistBackend,
    };
  }

  // FLAT / CO_PROMOTE: guarantee only, no backend.
  if (dealType === "FLAT" || dealType === "CO_PROMOTE") {
    return {
      netAfterExpenses,
      splitpoint: 0,
      overage: 0,
      artistBackend: 0,
      artistTotal: guarantee,
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
    artistTotal: guarantee + artistBackend,
  };
}

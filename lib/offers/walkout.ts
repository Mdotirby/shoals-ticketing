import { artistPayout } from "@/lib/settlement/model";

/**
 * Walkout scenarios for the offer builder's right rail — what the artist and
 * the venue each walk out with if the room sells a given share of its
 * sellable tickets.
 *
 * No deal math of its own: the artist figure is artistPayout(), the function
 * the builder, the offer export and settlements already share. This only
 * scales the offer's sellout numbers down to a sell-through:
 *
 *   net receipts   = net potential × share   (every tier sells the same share)
 *   expenses       = fixed + variable × share (variable expenses are a rate on gross)
 *
 * and applies the P&L tab's rule for where the guarantee lives: on FLAT, PLUS
 * and BONUS offers the guarantee is already the "Talent" line in fixed
 * expenses, so only the backend comes out on top of expenses; on VS it is the
 * whole artist payment.
 */
export type WalkoutBasis = {
  /** Net receipts at sellout (the builder's live.netPotential). */
  netPotential: number;
  /** Fixed expenses — don't move with sales. */
  totalFixed: number;
  /** Variable expenses at sellout — rate × gross, so they scale with sales. */
  totalVariable: number;
  /** Sellable tickets across all tiers. */
  sellable: number;
  guarantee: number;
  /** Backend as the builder stores it: a percentage (85 = 85%). */
  backendPct: number;
  dealType: string;
};

export type Walkout = {
  /** Share of sellable tickets sold, 0–1. */
  share: number;
  sold: number;
  netReceipts: number;
  expenses: number;
  /** What the deal pays the artist (guarantee plus any backend). */
  artist: number;
  /** Net receipts − expenses − the artist cost not already in expenses. */
  venue: number;
};

/** Offers whose guarantee is entered as the Talent line in fixed expenses. */
export function guaranteeInExpenses(dealType: string): boolean {
  const d = String(dealType || "").toUpperCase();
  return d === "FLAT" || d === "PLUS" || d === "BONUS";
}

export function walkoutAt(share: number, b: WalkoutBasis): Walkout {
  const s = Math.max(0, Math.min(1, share));
  const netReceipts = b.netPotential * s;
  const expenses = b.totalFixed + b.totalVariable * s;
  const payout = artistPayout({
    netReceipts,
    totalExpenses: expenses,
    guarantee: b.guarantee,
    backendPct: (Number(b.backendPct) || 0) / 100,
    dealType: b.dealType,
  });
  const artistCost = guaranteeInExpenses(b.dealType) ? payout.dealTotal - b.guarantee : payout.dealTotal;
  return {
    share: s,
    sold: Math.round(b.sellable * s),
    netReceipts,
    expenses,
    artist: payout.dealTotal,
    venue: netReceipts - expenses - artistCost,
  };
}

/**
 * The smallest share at which the venue stops losing money, or null when it
 * still loses money at sellout. Venue net only rises with sales (the artist
 * never takes more than the whole of each extra dollar), so a bisection is
 * exact to well under one ticket.
 */
export function breakEvenShare(b: WalkoutBasis): number | null {
  if (walkoutAt(1, b).venue < 0) return null;
  if (walkoutAt(0, b).venue >= 0) return 0;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (walkoutAt(mid, b).venue >= 0) hi = mid;
    else lo = mid;
  }
  return hi;
}

import type { SupabaseClient } from "@supabase/supabase-js";
import { ratesFor } from "@/lib/fees/rates";

/**
 * The settlement ledger row for an order — one definition.
 *
 * settlement_ledger is what settlement, the admin dashboard and the event
 * workspace all read. Getting a row wrong is not a display bug; it is what an
 * artist gets paid. This arithmetic existed in three places — the Stripe
 * webhook, the backfill endpoint, and (as zeros) the cash-sale route — and the
 * copies had already drifted: the backfill hardcoded the ONLINE card rate for
 * every order regardless of how it was captured, and ignored the rate cutover
 * entirely, so replaying a door sale or anything sold before 2026-08-14
 * silently restated its face value.
 *
 * WHY `at` EXISTS. ratesFor() is cutover-aware and defaults to now. That is
 * right for a live charge and wrong for a replay: an order charged on
 * 2026-08-13 was surcharged at 2.7%, and backing out 2.9% from it invents a
 * fee that was never collected and shorts the artist's face value by the
 * difference. Anything reconstructing a historical row MUST pass the order's
 * own created_at.
 */

export type LedgerBasis = {
  /** What the buyer was actually charged, in dollars. */
  totalAmount: number;
  quantity: number;
  /** Per-ticket rates, already resolved for the event (resolveVenueFees). */
  ticketingFee: number;
  facilityFee: number;
  venueRebate: number;
  taxRate: number;
  taxMethod: string;
  feesIncludedInPrice: boolean;
  /** orders.source — decides the capture method and whether a card was used. */
  source: string;
  /** When the charge happened. Omit only for a charge happening right now. */
  at?: Date;
};

export type LedgerAmounts = {
  ticketRevenue: number;
  taxCollected: number;
  totalTicketingFee: number;
  totalFacilityFee: number;
  totalVenueRebate: number;
  /** What we surcharged the buyer for card processing. */
  surchargeCollected: number;
  netToVenue: number;
  netToPlatform: number;
};

/** Sold at the door for cash — no card, and by policy no fees or tax either. */
function isCashSale(source: string): boolean {
  const s = (source ?? "").trim();
  return s === "cash" || s === "cash_sale" || s === "box_office_cash";
}

export function computeLedgerAmounts(basis: LedgerBasis): LedgerAmounts {
  const {
    totalAmount, quantity, ticketingFee, facilityFee, venueRebate,
    taxRate, taxMethod, feesIncludedInPrice, source, at,
  } = basis;

  // Cash is not a variant of the card math — it is a different transaction
  // with genuinely zero fees. Running it through the inversion below would
  // manufacture a card surcharge and a ticketing fee nobody ever paid.
  // Mirrors app/api/box-office/cash-sale/route.ts, which writes these zeros
  // directly at the time of sale.
  if (isCashSale(source)) {
    return {
      ticketRevenue: totalAmount,
      taxCollected: 0,
      totalTicketingFee: 0,
      totalFacilityFee: 0,
      totalVenueRebate: 0,
      surchargeCollected: 0,
      netToVenue: totalAmount,
      netToPlatform: 0,
    };
  }

  // ticket_revenue = face value only — the ticket price, with every other
  // component of the charge backed out. The facility fee was once missing from
  // this subtraction entirely, so every facility fee ever collected was buried
  // inside ticket_revenue and reported to artists as face value while
  // settlement_ledger.facility_fee stayed $0.00 on all 757 rows.
  //
  // When feesIncludedInPrice, service + facility were never charged on top of
  // totalAmount — they are already inside the ticket price — so they must not
  // be subtracted again when backing out face value.
  const totalTicketingFee = Math.round(ticketingFee * quantity * 100) / 100;
  const totalFacilityFee = Math.round(facilityFee * quantity * 100) / 100;
  const totalVenueRebate = Math.round(venueRebate * quantity * 100) / 100;
  const ticketingFeeToSubtract = feesIncludedInPrice ? 0 : totalTicketingFee;
  const facilityFeeToSubtract = feesIncludedInPrice ? 0 : totalFacilityFee;

  // The surcharge we actually collected was computed on the SUBTOTAL, not on
  // the grossed-up total. Deriving it from totalAmount (which already contains
  // the surcharge) over-states the fee on every order and leaves face value
  // correspondingly short. Invert the checkout formula instead:
  //   total = subtotal + (subtotal × pct + flat)
  //   → subtotal = (total − flat) / (1 + pct)
  //
  // Card-present sales are surcharged at the Terminal rate (2.7% + $0.05), not
  // the online one. Backing out the online rate on a reader sale understates
  // the artist's face value on every door transaction.
  const captureMethod = source === "terminal" ? "terminal" : "online";
  const { pct: surchargePct, flatCents: surchargeFlat } = ratesFor(
    captureMethod,
    at ?? new Date()
  );
  const surchargeCollected = feesIncludedInPrice
    ? 0 // venue absorbed it — the buyer paid exactly the sticker price
    : Math.round(
        (totalAmount -
          (totalAmount * 100 - surchargeFlat) / (1 + surchargePct) / 100) *
          100
      ) / 100;

  const effectiveTaxRate = taxMethod === "divisor" ? 0 : taxRate;
  // Solve for face: gross = face×(1+taxRate) + svc + fac + surcharge
  const preTax =
    totalAmount - ticketingFeeToSubtract - facilityFeeToSubtract - surchargeCollected;
  const ticketRevenue =
    effectiveTaxRate > 0
      ? Math.round((preTax / (1 + effectiveTaxRate)) * 100) / 100
      : Math.round(preTax * 100) / 100;
  const taxCollected = Math.round(ticketRevenue * effectiveTaxRate * 100) / 100;

  return {
    ticketRevenue,
    taxCollected,
    totalTicketingFee,
    totalFacilityFee,
    totalVenueRebate,
    surchargeCollected,
    netToVenue:
      totalAmount -
      ticketingFeeToSubtract -
      facilityFeeToSubtract -
      surchargeCollected +
      totalVenueRebate,
    netToPlatform: totalTicketingFee - totalVenueRebate,
  };
}

/**
 * Does this order already have its sale row?
 *
 * NOT maybeSingle(): a refunded or disputed order legitimately has more than
 * one row for the same order_id (the sale, plus a negative reversal), and
 * maybeSingle() errors on multiple rows — which reads as "no ledger" and leads
 * to a second sale row being written, double-counting the revenue.
 *
 * Anything that is not explicitly a reversal counts as the sale row, so a
 * legacy row with a null type is treated as present. That direction is the
 * safe one: at worst a repair is skipped, which is the status quo.
 */
export async function hasSaleRow(
  admin: SupabaseClient,
  orderId: string
): Promise<boolean> {
  const { data } = await admin
    .from("settlement_ledger")
    .select("id, type")
    .eq("order_id", orderId)
    .limit(5);
  return (data ?? []).some((r) => r.type !== "refund" && r.type !== "dispute");
}

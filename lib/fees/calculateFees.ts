import { surchargeCents } from "@/lib/fees/rates";

/**
 * The one place a basket is priced.
 *
 * Both sides of the sale call this: the checkout routes that create the
 * charge, and the storefront breakdown the buyer reads before paying. They
 * used to be separate implementations that agreed most of the time, which is
 * the worst way for them to disagree — the client taxed the whole order
 * (round(price x qty x rate)) while the server taxed one ticket and
 * multiplied (round(price x rate) x qty). On 172 of 320 realistic baskets
 * those differ by a cent or three: three $12.50 tickets were shown $3.56 of
 * tax and charged $3.57.
 *
 * Nobody was overcharged by much, but the total on the screen was not the
 * total on the card, and a price breakdown that does not tie is worse than
 * no breakdown. One function now, so they cannot drift again.
 */

export interface FeeBreakdown {
  /** Base ticket price in cents (before discount) */
  ticketPriceCents: number;
  /** Discounted ticket price in cents (after promo) */
  discountedTicketPriceCents: number;
  /** Ticketing fee per ticket in cents */
  ticketingFeeCents: number;
  /** Facility fee per ticket in cents */
  facilityFeeCents: number;
  /** Tax per ticket in cents */
  taxCents: number;
  /** Effective quantity (may differ from requested qty for assigned seating) */
  effectiveQuantity: number;
  /** Subtotal before Stripe fee in cents */
  subtotalBeforeStripeFee: number;
  /** Stripe processing fee in cents */
  stripeFeeCents: number;
  /** Grand total in cents */
  totalCents: number;
  /** Discount per ticket in cents */
  discountCentsPerTicket: number;
  /** True when ticketingFeeCents/facilityFeeCents are already baked into
   *  ticketPriceCents and were NOT added again into totalCents. Callers building
   *  line-item UIs (Stripe line items, order summaries) should label these as
   *  "included" rather than adding them as separate charges. */
  feesIncludedInPrice: boolean;
}

/**
 * Compute the full fee breakdown for a checkout.
 *
 * This is the SINGLE SOURCE OF TRUTH for fee math used by both
 * the Checkout Session route and the PaymentIntent route.
 */
export function calculateFees(opts: {
  ticketPriceCents: number;
  discountCentsPerTicket: number;
  ticketingFee: number;
  facilityFee: number;
  taxRate: number;
  quantity: number;
  /** True when ticketPriceCents already has ticketingFee + facilityFee baked
   *  in — don't add them again on top of the charge. */
  feesIncludedInPrice?: boolean;
}): FeeBreakdown {
  const { ticketPriceCents, discountCentsPerTicket, ticketingFee, facilityFee, taxRate, quantity, feesIncludedInPrice = false } = opts;

  const discountedTicketPriceCents = Math.max(0, ticketPriceCents - discountCentsPerTicket);
  // Nominal per-ticket amounts — always returned for display/reporting, even
  // when baked into the price and not separately charged.
  const ticketingFeeCents = Math.round(ticketingFee * 100);
  const facilityFeeCents = Math.round(facilityFee * 100);

  // Tax on discounted ticket price
  const taxCents = Math.round(discountedTicketPriceCents * taxRate);

  // Subtotal before Stripe fee — skip re-adding fees already baked into the price.
  const subtotalBeforeStripeFee = feesIncludedInPrice
    ? (discountedTicketPriceCents + taxCents) * quantity
    : (discountedTicketPriceCents + ticketingFeeCents + facilityFeeCents + taxCents) * quantity;

  // Card processing surcharge — informational even when absorbed (see below).
  // Routed through the rate card so the percentage, the flat fee, and the
  // gross-up policy all live in one place.
  const stripeFeeCents = surchargeCents(subtotalBeforeStripeFee);

  // When fees are baked into the price, the venue absorbs the card
  // processing fee too — the customer is charged exactly the sticker
  // price (+ tax, if additive), full stop, never subtotal + surcharge.
  const totalCents = feesIncludedInPrice
    ? subtotalBeforeStripeFee
    : subtotalBeforeStripeFee + stripeFeeCents;

  return {
    ticketPriceCents,
    discountedTicketPriceCents,
    ticketingFeeCents,
    facilityFeeCents,
    taxCents,
    effectiveQuantity: quantity,
    subtotalBeforeStripeFee,
    stripeFeeCents,
    totalCents,
    discountCentsPerTicket,
    feesIncludedInPrice,
  };
}

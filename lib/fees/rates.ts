/**
 * Platform rate card — THE single source of truth for card processing rates.
 *
 * Every checkout path, offer projection, settlement, and report imports from
 * here. Before this module the rate was duplicated as a `0.027` literal in 22
 * places across 16 files, and had already drifted out of sync with the UI copy
 * sitting next to it ("Less: Stripe Fees (~2.9%)" printed above a 2.7% number).
 *
 * Verified against live Stripe balance transactions on 2026-08-12: the blended
 * actual rate across succeeded charges was 2.903% + $0.30, i.e. exactly the
 * published US online rate below.
 *
 * ── Estimate vs. actual ──────────────────────────────────────────────────
 * These constants are for PROJECTING a fee before the charge exists (pricing a
 * checkout, modelling an offer). Once a charge has settled, the authoritative
 * number is `balance_transaction.fee` from Stripe — never a re-derivation from
 * these rates. Settlement reads the recorded actual; only forecasts use these.
 */

/** US online (card-not-present) — Stripe standard pricing. */
export const STRIPE_ONLINE_PCT = 0.029;
export const STRIPE_ONLINE_FLAT_CENTS = 30;

/**
 * The rate this platform charged before the correction to Stripe's real rate.
 * Kept only so in-flight shows finish selling at the price they opened at.
 */
export const LEGACY_ONLINE_PCT = 0.027;

/**
 * When the corrected online rate takes effect.
 *
 * A show that is already on sale should finish at the price it opened at —
 * raising the surcharge mid-run changes what a buyer pays for the same seat
 * their friend already bought. So the new rate starts at a cutover instant
 * rather than the moment this deploys.
 *
 * Default is 01:00 Central on 2026-08-14, which clears the 2026-08-13 show
 * including late door sales. Override without a deploy by setting
 * STRIPE_RATE_CUTOVER_AT to an ISO timestamp (or to a past date to apply the
 * corrected rate immediately).
 */
export const STRIPE_RATE_CUTOVER_AT = new Date(
  process.env.STRIPE_RATE_CUTOVER_AT ?? "2026-08-14T06:00:00Z"
);

/**
 * The online percentage in force right now.
 *
 * Deliberately a function, not a constant: a module-scope constant is
 * evaluated once when the module loads, so a long-lived server process that
 * started before the cutover would keep serving the old rate indefinitely.
 */
export function currentOnlinePct(at: Date = new Date()): number {
  return at >= STRIPE_RATE_CUTOVER_AT ? STRIPE_ONLINE_PCT : LEGACY_ONLINE_PCT;
}

/**
 * US card-present via Stripe Terminal. Genuinely a different rate — this is
 * NOT a stale copy of the online rate and must not be "corrected" to match it.
 */
export const STRIPE_TERMINAL_PCT = 0.027;
export const STRIPE_TERMINAL_FLAT_CENTS = 5;

export type CaptureMethod = "online" | "terminal";

export function ratesFor(
  method: CaptureMethod = "online",
  at: Date = new Date()
): { pct: number; flatCents: number } {
  return method === "terminal"
    ? { pct: STRIPE_TERMINAL_PCT, flatCents: STRIPE_TERMINAL_FLAT_CENTS }
    : { pct: currentOnlinePct(at), flatCents: STRIPE_ONLINE_FLAT_CENTS };
}

/**
 * Card surcharge in DOLLARS for a dollar-denominated subtotal.
 *
 * For the customer-facing price displays, which work in dollars and used to
 * each keep their own copy of the rate as a module-scope constant.
 */
export function onlineSurchargeDollars(subtotalDollars: number): number {
  if (subtotalDollars <= 0) return 0;
  return surchargeCents(Math.round(subtotalDollars * 100)) / 100;
}

/**
 * How the card fee is passed to the buyer.
 *
 *   • "gross_up"    — buyer covers the fee in full. The only mode that actually
 *                     leaves the venue whole (see surchargeCents below).
 *   • "on_subtotal" — legacy behaviour: pct applied to the subtotal. Always
 *                     under-recovers, because Stripe bills on the grossed-up
 *                     total, not the subtotal.
 *   • "absorb"      — venue eats the fee; buyer pays the sticker price. This is
 *                     what `fees_included_in_price` events do today.
 */
export type SurchargeMode = "gross_up" | "on_subtotal" | "absorb";

export const DEFAULT_SURCHARGE_MODE: SurchargeMode = "on_subtotal";

/**
 * The surcharge to add to `subtotalCents` so the buyer covers processing.
 *
 * The gross-up matters more than it looks. Stripe's cut is taken on the final
 * charged amount — which includes the surcharge itself — so charging
 * `subtotal × pct` can never recover `total × pct`. On a $100 subtotal at
 * 2.9% + $0.30:
 *
 *   on_subtotal → charge $103.20, Stripe keeps $3.29  → venue is $0.09 short
 *   gross_up    → charge $103.40, Stripe keeps $3.30  → venue is whole
 *
 * Returns 0 for "absorb" — the caller charges exactly the subtotal and the fee
 * becomes a real venue expense at settlement.
 */
export function surchargeCents(
  subtotalCents: number,
  mode: SurchargeMode = DEFAULT_SURCHARGE_MODE,
  method: CaptureMethod = "online",
  /** Pin the rate to a point in time — pass an order's date to recompute it
   *  at the rate that was actually in force when it was charged. */
  at: Date = new Date()
): number {
  if (subtotalCents <= 0) return 0;
  const { pct, flatCents } = ratesFor(method, at);

  if (mode === "absorb") return 0;
  if (mode === "on_subtotal") {
    return Math.round(subtotalCents * pct + flatCents);
  }
  // gross_up: solve total = (subtotal + flat) / (1 - pct), surcharge = total - subtotal
  const total = (subtotalCents + flatCents) / (1 - pct);
  return Math.round(total - subtotalCents);
}

/**
 * What Stripe will actually deduct from a charge of `totalCents`.
 *
 * Use for forecasting and for flagging variance against the recorded actual —
 * not as a substitute for `balance_transaction.fee` on a settled charge.
 */
export function estimatedStripeCostCents(
  totalCents: number,
  method: CaptureMethod = "online",
  at: Date = new Date()
): number {
  if (totalCents <= 0) return 0;
  const { pct, flatCents } = ratesFor(method, at);
  return Math.round(totalCents * pct + flatCents);
}

/**
 * Average tickets per order, used ONLY to amortise the flat per-transaction fee
 * across tickets when projecting a sellout in the offer builder. A projection
 * has no orders yet, so the $0.30 has to be spread over an assumed basket size.
 *
 * Derived from order history on 2026-08-12: 1,675 tickets across 752 paid
 * orders ≈ 2.2. Rounded down to 2 so the offer errs toward over-stating cost
 * rather than promising an artist money that processing will eat.
 */
export const OFFER_AVG_TICKETS_PER_ORDER = 2;

/**
 * Per-ticket card surcharge for offer projections, with the flat fee amortised
 * over OFFER_AVG_TICKETS_PER_ORDER. Returns dollars, not cents — the offer
 * builder works in dollars throughout.
 */
export function offerSurchargePerTicket(preCcDollars: number): number {
  if (preCcDollars <= 0) return 0;
  // Offers deliberately IGNORE the cutover and always use the corrected rate.
  // An offer models a show that hasn't happened yet — often months out — so
  // quoting an agent the legacy rate would understate processing cost on a
  // show that will certainly be sold at the new one.
  const pct = STRIPE_ONLINE_PCT;
  const cents =
    preCcDollars * 100 * pct + STRIPE_ONLINE_FLAT_CENTS / OFFER_AVG_TICKETS_PER_ORDER;
  return Math.round(cents) / 100;
}

/** Percentage rate currently in force, formatted for display, e.g. "2.9%". */
export function ratePctLabel(
  method: CaptureMethod = "online",
  at: Date = new Date()
): string {
  const { pct } = ratesFor(method, at);
  return `${(pct * 100).toFixed(1).replace(/\.0$/, "")}%`;
}

/** Full rate label for display, e.g. "2.9% + $0.30". */
export function rateLabel(
  method: CaptureMethod = "online",
  at: Date = new Date()
): string {
  const { flatCents } = ratesFor(method, at);
  return `${ratePctLabel(method, at)} + $${(flatCents / 100).toFixed(2)}`;
}

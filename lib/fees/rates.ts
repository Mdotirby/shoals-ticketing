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

/**
 * Gross up, so the venue is exactly whole.
 *
 * This was "on_subtotal" until 2026-09-25, which under-recovers on every
 * order — $195.88 across the book, $7.71 on the Dolly Parton Tribute alone.
 * The rate was corrected to 2.9% in an earlier pass and the gap was then
 * surfaced on the settlement page, but the mode itself was never changed, so
 * the shortfall kept accruing where everyone could see it.
 *
 * It costs the buyer 2.9% of the surcharge — around 3c on a $25 ticket.
 */
export const DEFAULT_SURCHARGE_MODE: SurchargeMode = "gross_up";

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
 * gross_up is the default since 2026-09-25. It is exact, not close: see
 * grossUpCents below, and the exhaustive test over every subtotal to $2,000.
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
  return grossUpCents(subtotalCents, pct, flatCents);
}

/**
 * The surcharge that makes the venue EXACTLY whole — to the cent, every time.
 *
 * Stripe's fee on a charge of T cents is `round(T * pct + flat)`, verified
 * against all 795 live charges on the account: every one matches, across
 * Visa, Mastercard, Amex and Discover, online and card-present. There is no
 * variance to absorb, so zero shortfall is reachable exactly rather than
 * approximately.
 *
 * What we need is the surcharge `s` where charging `subtotal + s` produces a
 * fee of exactly `s`:
 *
 *     s === round((subtotal + s) * pct + flat)
 *
 * The continuous solve — total = (subtotal + flat) / (1 - pct) — lands within
 * a cent of that, but rounding it can miss either way, and a cent missed on
 * every order is the whole problem restated. So the continuous answer is only
 * a starting point; from there we step to the exact integer.
 *
 * A fixed point always exists. Let g(s) = round((subtotal + s) * pct + flat)
 * - s. Raising s by one raises the rounded fee by 0 or 1, so g falls by
 * exactly 1 or 0 at each step — never by 2. A function that decreases in
 * steps of at most 1 cannot cross zero without landing on it.
 */
export function grossUpCents(subtotalCents: number, pct: number, flatCents: number): number {
  const feeOn = (surcharge: number) => Math.round((subtotalCents + surcharge) * pct + flatCents);

  let s = Math.round((subtotalCents * pct + flatCents) / (1 - pct));
  // Walk to the fixed point. Two or three steps in practice; the bound only
  // stops a pathological rate from spinning here.
  for (let i = 0; i < 64; i++) {
    const fee = feeOn(s);
    if (fee === s) return s;
    s += fee > s ? 1 : -1;
  }
  // Unreachable for any sane rate. Round up rather than down so the error, if
  // it ever happens, is a cent of overage the buyer paid and not a cent the
  // venue quietly ate.
  return feeOn(s) > s ? s + 1 : s;
}

/**
 * What Stripe will actually deduct from a charge of `totalCents`.
 *
 * Use for forecasting and for flagging variance against the recorded actual —
 * not as a substitute for `balance_transaction.fee` on a settled charge.
 */
export function estimatedStripeCostCents(
  totalCents: number,
  method: CaptureMethod = "online"
): number {
  if (totalCents <= 0) return 0;
  // Deliberately NOT cutover-aware. The cutover governs what WE bill the
  // buyer; Stripe charges its published rate regardless. Gating this on the
  // cutover made the settlement estimate Stripe's cost at 2.7% while Stripe
  // was really taking 2.9%, understating the shortfall the platform absorbs.
  const pct = method === "terminal" ? STRIPE_TERMINAL_PCT : STRIPE_ONLINE_PCT;
  const flatCents =
    method === "terminal" ? STRIPE_TERMINAL_FLAT_CENTS : STRIPE_ONLINE_FLAT_CENTS;
  return Math.round(totalCents * pct + flatCents);
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

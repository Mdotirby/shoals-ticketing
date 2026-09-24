import { STRIPE_ONLINE_PCT, STRIPE_ONLINE_FLAT_CENTS } from "@/lib/fees/rates";

/**
 * The card surcharge as a show expense.
 *
 * ── Why it moved ─────────────────────────────────────────────────────────
 * The surcharge used to appear only as a per-ticket line in the offer's fee
 * stack, and separately as whatever anyone happened to type into the expense
 * list. Across the 40 offers on file that meant three different answers:
 * 21 had no card expense at all, 13 carried a hand-entered 3% of gross, and
 * 6 carried a 0% line that computed to nothing. None used the real rate. On
 * Sunny Sweeney the 3% line read $374.40 against a true surcharge of $520.00.
 *
 * So it is derived here instead of typed: one rate, every offer, and the
 * expense list no longer depends on someone remembering to add a row.
 *
 * ── The rate ─────────────────────────────────────────────────────────────
 * Online card-not-present: exactly 2.9% + exactly $0.30 per ticket, taken
 * from STRIPE_ONLINE_PCT and STRIPE_ONLINE_FLAT_CENTS. Neither is rounded --
 * not to 3%, not to anything else.
 *
 * ── Why this does not call offerSurchargePerTicket() ──────────────────────
 * That function rounds to the whole cent, because it prices ONE ticket and a
 * card cannot be charged a fraction of a cent. Applied 520 times that
 * rounding compounds: $24.00 x 2.9% + $0.30 = $0.996 a ticket, which becomes
 * $1.00 each and $520.00 across Sunny Sweeney's tier against a true $517.92.
 * $2.08 of rounding, all of it upward, and it makes the rate look like it
 * was rounded too.
 *
 * So the total is computed whole -- 2.9% of the summed base plus $0.30 a
 * ticket -- and rounded exactly once, at the end. The per-ticket figure is
 * returned unrounded for display.
 *
 * ── Per order, and an offer assumes one ticket per order ─────────────────
 * Stripe charges the flat fee once per CHARGE, not once per ticket: two
 * tickets bought together are one order, one $0.30. That is what checkout
 * and settlement do -- calculateFees() builds the whole order's subtotal
 * (face + ticketing + facility + tax) and takes a single surcharge on it.
 *
 * An offer has no orders yet, so it assumes one ticket per order (Matt,
 * confirmed): 520 sellable seats means 520 orders and 520 flat fees. That is
 * deliberately the conservative end -- any real basket bigger than one ticket
 * costs less than the offer forecast, never more.
 *
 * The base is the same either way: face plus both fees plus tax. Under
 * `divisor` the tax is already inside the face, so the sub-total is the base
 * as it stands; under `multiplier` it rides on top and is added first.
 *
 * An offer assumes a sellout, so the expense is the surcharge on every
 * sellable seat. Door sales run card-present at a different rate, but an
 * offer has no way to know the split in advance and quoting the cheaper
 * terminal rate would understate the cost.
 */

/** The rate, for display next to the line. */
export const CARD_RATE_PCT = STRIPE_ONLINE_PCT;
export const CARD_RATE_FLAT = STRIPE_ONLINE_FLAT_CENTS / 100;

export const CARD_EXPENSE_NAME = `Card processing (${(CARD_RATE_PCT * 100).toFixed(1)}% + $${CARD_RATE_FLAT.toFixed(2)})`;

/**
 * The surcharge on one ticket, unrounded.
 *
 * offerSurchargePerTicket() in lib/fees/rates.ts rounds to the whole cent,
 * which is right when pricing a single real charge and wrong when the figure
 * is about to be multiplied by a thousand seats. An offer is a forecast, so
 * every surcharge figure in the offer model -- the per-ticket line, the fee
 * total and the show expense -- comes through here and is rounded only where
 * it is finally presented. One implementation, so those three can never
 * disagree the way they did when two of them rounded and one did not.
 */
export function cardSurchargeExact(preCcDollars: number): number {
  if (preCcDollars <= 0) return 0;
  return preCcDollars * CARD_RATE_PCT + CARD_RATE_FLAT;
}

export type ScalingLike = {
  sellable_cap?: number | null;
  price?: number | null;
  net_price?: number | null;
};

export type ExpenseLike = { name?: string | null; rate?: number | null; amount?: number | null };

/**
 * Does this expense row look like someone's hand-entered card line?
 *
 * Matched loosely on purpose: the rows on file are variously "Credit Card
 * (Stripe)", "Credit Card", and "CC Processing". Any of them left in place
 * beside the derived line would charge the show twice.
 */
export function isCardExpense(name: unknown): boolean {
  return /credit\s*card|card\s*processing|\bcc\b|stripe|processing\s*fee/i.test(String(name ?? ""));
}

/** The caller's own expense rows, with any legacy card line removed. */
export function withoutCardExpense<T extends ExpenseLike>(rows: T[]): T[] {
  return (Array.isArray(rows) ? rows : []).filter((r) => !isCardExpense(r?.name));
}

/**
 * The surcharge across every sellable seat, priced exactly as the builder
 * prices it per ticket.
 *
 * Tax matters here because under `multiplier` it is added on top of the face
 * before the card is charged, so the card fee is levied on a larger amount.
 * Under `divisor` it is already inside the price.
 */
export function cardExpenseAtSellout(
  scaling: ScalingLike[],
  opts: { taxMethod?: string | null; taxRate?: number | null } = {},
): { amount: number; tickets: number; perTicket: number } {
  const rows = Array.isArray(scaling) ? scaling : [];
  const raw = Number(opts.taxRate) || 0;
  // tax_rate is stored as a decimal on some rows and a percentage on others.
  const dec = (raw > 0 && raw < 1 ? raw * 100 : raw) / 100;
  const divisor = opts.taxMethod === "divisor";

  // Accumulate the base the percentage applies to, and the ticket count the
  // flat fee applies to, WITHOUT rounding either along the way.
  let base = 0;
  let tickets = 0;
  for (const r of rows) {
    const sellable = Number(r?.sellable_cap) || 0;
    if (sellable <= 0) continue;
    const price = Number(r?.price) || 0;
    const taxPer = divisor ? 0 : (Number(r?.net_price) || 0) * dec;
    base += sellable * (price + taxPer);
    tickets += sellable;
  }
  // Identical to summing cardSurchargeExact() per ticket, since the rate is
  // linear -- written as one multiplication so no intermediate value rounds.
  const exact = base * CARD_RATE_PCT + tickets * CARD_RATE_FLAT;
  const amount = Math.round(exact * 100) / 100;
  return { amount, tickets, perTicket: tickets > 0 ? exact / tickets : 0 };
}

/** The derived line, shaped like the stored expense rows it sits beside. */
export function cardExpenseRow(
  scaling: ScalingLike[],
  opts: { taxMethod?: string | null; taxRate?: number | null } = {},
): { name: string; amount: number; rate: number; locked: true } {
  const { amount } = cardExpenseAtSellout(scaling, opts);
  // `rate` is carried for the stored shape's sake only. The amount is NOT a
  // percentage of gross -- it includes a flat 30c a ticket -- so nothing
  // should recompute it by multiplying this rate by anything.
  return { name: CARD_EXPENSE_NAME, amount, rate: 0, locked: true };
}

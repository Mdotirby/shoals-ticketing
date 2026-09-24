import { offerSurchargePerTicket, STRIPE_ONLINE_PCT, STRIPE_ONLINE_FLAT_CENTS } from "@/lib/fees/rates";

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
 * Online card-not-present: 2.9% + $0.30 per ticket, from lib/fees/rates.ts
 * via offerSurchargePerTicket() — the same function the builder's own
 * per-ticket all-in price is computed with, so the expense and the price the
 * buyer sees can never quote different rates.
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

  let amount = 0;
  let tickets = 0;
  for (const r of rows) {
    const sellable = Number(r?.sellable_cap) || 0;
    if (sellable <= 0) continue;
    const price = Number(r?.price) || 0;
    const taxPer = divisor ? 0 : Math.round((Number(r?.net_price) || 0) * dec * 100) / 100;
    amount += sellable * offerSurchargePerTicket(price + taxPer);
    tickets += sellable;
  }
  amount = Math.round(amount * 100) / 100;
  return { amount, tickets, perTicket: tickets > 0 ? Math.round((amount / tickets) * 100) / 100 : 0 };
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

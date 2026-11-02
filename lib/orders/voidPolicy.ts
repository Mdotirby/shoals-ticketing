/**
 * Voiding a cash sale — the box office rang up a sale that never happened.
 *
 * Not a refund. A refund gives money back; a void says there was never any
 * money. Cash can't be refunded in software (lib/orders/refundPolicy.ts), but
 * a mistaken cash sale still has to come off the books, or the settlement and
 * the till disagree. So: the order stops counting as sold, its seats go back
 * on sale, its tickets stop scanning, and the ledger gets a reversal that
 * nets its cash to zero.
 *
 * Card sales are never voided here. Their money really moved, so they go
 * through the refund pipeline and Stripe.
 */

export const CASH_SOURCES = ["cash", "cash_sale", "box_office_cash"] as const;

export function isCashSource(source: string | null | undefined): boolean {
  return (CASH_SOURCES as readonly string[]).includes(String(source ?? "").trim());
}

type OrderLike = { status: string | null; source: string | null; total_amount?: number | string | null };

/** Why this order can't be voided, in words for the person asking, or null if it can. */
export function voidBlocker(order: OrderLike): string | null {
  if (order.status === "voided") return "This sale is already voided.";
  if (order.status === "refunded") return "This order was refunded. There's nothing left to void.";
  if (!isCashSource(order.source)) {
    return "Only cash sales can be voided. A card sale's money really moved, so refund it instead.";
  }
  if (order.status !== "paid") return `This order is ${order.status ?? "not paid"}. Only a paid cash sale can be voided.`;
  return null;
}

/**
 * The ledger row that cancels an order's remaining money: whatever its rows
 * still add up to, negated. Null when they already net to zero.
 */
export function voidReversal<T extends { gross_amount?: number | null; ticket_revenue?: number | null; net_to_venue?: number | null }>(
  rows: T[],
): { gross_amount: number; ticket_revenue: number; net_to_venue: number } | null {
  const sum = (k: keyof T) =>
    Math.round(rows.reduce((s, r) => s + (Number(r[k]) || 0), 0) * 100) / 100;
  const gross = sum("gross_amount");
  if (Math.abs(gross) < 0.005) return null;
  return { gross_amount: -gross, ticket_revenue: -sum("ticket_revenue"), net_to_venue: -sum("net_to_venue") };
}

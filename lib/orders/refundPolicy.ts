/**
 * Refund policy — the house rule, not the design mockup's.
 *
 * No refunds except when the show is cancelled or something went wrong on
 * our side (a platform or purchase glitch: wrong event, wrong tickets, a
 * double charge). When a refund does happen it is 100% all-in — face value,
 * service fee, facility fee, tax and card surcharge — because the buyer did
 * nothing wrong in either case. So there is no partial or face-only option,
 * and every refund carries one of these two reasons.
 *
 * Cash orders are never refunded in software: the drawer is physical, and a
 * cash refund reconciles at the box office at close of night.
 */

export const REFUND_REASONS = {
  show_cancelled: "Show cancelled",
  glitch: "Platform or purchase glitch",
} as const;

export type RefundReason = keyof typeof REFUND_REASONS;

export function isRefundReason(v: unknown): v is RefundReason {
  return typeof v === "string" && v in REFUND_REASONS;
}

type OrderLike = { status: string | null; source: string | null };
type EventLike = { booking_status?: string | null } | null;

/**
 * Why this refund can't go ahead, in words for the person asking — or null
 * if it can. Pure, so the order book can show the same answer the route
 * enforces before anyone presses the button.
 */
export function refundBlocker(order: OrderLike, event: EventLike, reason: unknown): string | null {
  if (order.status === "refunded") return "This order is already refunded.";
  if (order.source === "cash") {
    return "Cash orders can't be refunded here — the drawer is physical. Refund it at the box office and it reconciles at close of night.";
  }
  if (!isRefundReason(reason)) {
    return "Refunds are only issued when a show is cancelled or when something went wrong on our side. Pick which one this is.";
  }
  if (reason === "show_cancelled" && event?.booking_status !== "cancelled") {
    return "This show isn't marked cancelled. Cancel it first, or refund this order as a glitch if that's what happened.";
  }
  return null;
}

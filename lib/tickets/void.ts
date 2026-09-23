import { SupabaseClient } from "@supabase/supabase-js";

/**
 * Voiding a ticket — the thing that stops it getting someone through the door.
 *
 * A refunded order used to keep its tickets, and they scanned clean. On
 * 2026-08-15 eight tickets on a fully refunded VIP table were checked in at
 * Muscle Shoals Meets: The 90's, six of them in one bulk check-in, for a table
 * nobody paid for. Every refund path calls this now so there is one
 * implementation and no path can forget.
 *
 * Deliberately separate from `is_scanned`. That column records what happened
 * at the door; this records whether the ticket was entitled to be there. A
 * ticket can be both scanned and void — that is precisely the case above, and
 * the two facts must not overwrite each other.
 *
 * Tolerates a database without the migration: `voided_at` may not exist yet
 * (plans/ticket-void-migration.sql), and a refund must never fail because of
 * that. It returns what it did so callers can say so.
 */
export type VoidResult = {
  /** How many tickets were voided by this call. */
  voided: number;
  /** Tickets already scanned when voided — someone got in on them. */
  alreadyScanned: number;
  /** True when the column is missing, so nothing could be voided. */
  unsupported: boolean;
  error?: string;
};

const MISSING_COLUMN = /voided_at|void_reason|column .* does not exist/i;

/**
 * Void every ticket on an order.
 *
 * `reason` is shown to door staff when a scan is refused, so it should read as
 * an explanation ("Order refunded"), not a code.
 */
export async function voidTicketsForOrder(
  admin: SupabaseClient,
  orderId: string,
  reason = "Order refunded",
): Promise<VoidResult> {
  const { data: tickets, error: readError } = await admin
    .from("tickets")
    .select("id, is_scanned, voided_at")
    .eq("order_id", orderId);

  // Reading failed because the column is not there yet — nothing to do, and
  // not an error worth failing a refund over.
  if (readError) {
    if (MISSING_COLUMN.test(readError.message)) {
      return { voided: 0, alreadyScanned: 0, unsupported: true };
    }
    return { voided: 0, alreadyScanned: 0, unsupported: false, error: readError.message };
  }

  const live = (tickets ?? []).filter((t) => !t.voided_at);
  if (live.length === 0) return { voided: 0, alreadyScanned: 0, unsupported: false };

  const { error: writeError } = await admin
    .from("tickets")
    .update({ voided_at: new Date().toISOString(), void_reason: reason })
    .in(
      "id",
      live.map((t) => t.id),
    );

  if (writeError) {
    if (MISSING_COLUMN.test(writeError.message)) {
      return { voided: 0, alreadyScanned: 0, unsupported: true };
    }
    return { voided: 0, alreadyScanned: 0, unsupported: false, error: writeError.message };
  }

  return {
    voided: live.length,
    alreadyScanned: live.filter((t) => t.is_scanned).length,
    unsupported: false,
  };
}

/**
 * Why the door should turn this ticket away, or null if it should not.
 *
 * One place decides, so the handheld scanner and the bulk check-in list cannot
 * disagree about what a valid ticket is — they did, which is how a refunded
 * order walked in through the bulk list while the scanner would have refused
 * it.
 */
export function refusalReason(ticket: {
  voided_at?: string | null;
  void_reason?: string | null;
  is_scanned?: boolean | null;
  scanned_at?: string | null;
  orderStatus?: string | null;
}): string | null {
  if (ticket.voided_at) {
    return ticket.void_reason
      ? `Void — ${ticket.void_reason.toLowerCase()}.`
      : "This ticket has been voided.";
  }
  if (ticket.orderStatus === "refunded") {
    return "This order was refunded — ticket is no longer valid.";
  }
  if (ticket.is_scanned) {
    return ticket.scanned_at
      ? `Already scanned at ${new Date(ticket.scanned_at).toLocaleString()}`
      : "Already scanned.";
  }
  return null;
}

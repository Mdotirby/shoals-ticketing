import { SupabaseClient } from "@supabase/supabase-js";

/**
 * Who gets an email about one show.
 *
 * Separated from the route so the rule that decides it is readable and
 * testable on its own: this is the part that, if it is wrong, puts a message
 * in front of hundreds of people it was not meant for.
 *
 * THE RULE
 *
 * Paid orders only, one send per distinct address. Refunded buyers are left
 * out — they no longer hold a ticket, and "see you Saturday" to someone you
 * refunded is a complaint, not a reminder. (A cancellation notice is the one
 * case that wants them; that is a different send and should say so out loud
 * rather than being this function's default.)
 *
 * Addresses are compared lower-cased and trimmed. One buyer with three orders
 * is one email, not three — on Muscle Shoals Meets that is 237 orders and 225
 * people.
 *
 * Orders with no address at all are counted and reported rather than silently
 * dropped. They are real sales, usually box office cash, and the sender
 * should know a slice of the room cannot be reached this way: 11 of the first
 * 1,000 orders on file have no email on them.
 */

export type EventAudience = {
  /** Distinct, lower-cased addresses that will be sent to. */
  recipients: { email: string; name: string | null }[];
  /** Paid orders with no address on them — real sales this cannot reach. */
  unreachableOrders: number;
  /** Paid orders considered, before deduplication. */
  paidOrders: number;
  /** Refunded orders, deliberately excluded. Reported so the number is visible. */
  refundedOrders: number;
};

/** PostgREST caps an unbounded select at 1,000 rows, which is under one show's orders. */
const PAGE = 1000;

export async function eventEmailAudience(
  admin: SupabaseClient,
  eventId: string,
  { includeRefunded = false }: { includeRefunded?: boolean } = {},
): Promise<EventAudience> {
  type Row = { customer_email: string | null; customer_name: string | null; status: string | null };

  // Paged deliberately. An unbounded select silently stops at 1,000 rows, and
  // a show that sold 1,200 tickets would quietly lose its last 200 buyers —
  // the same truncation that made eventSales under-report.
  const rows: Row[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin
      .from("orders")
      .select("customer_email, customer_name, status")
      .eq("event_id", eventId)
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const batch = (data ?? []) as Row[];
    rows.push(...batch);
    if (batch.length < PAGE) break;
  }

  const paid = rows.filter((r) => r.status === "paid");
  const refunded = rows.filter((r) => r.status === "refunded");
  const considered = includeRefunded ? [...paid, ...refunded] : paid;

  const byEmail = new Map<string, { email: string; name: string | null }>();
  let unreachable = 0;
  for (const r of considered) {
    const email = (r.customer_email ?? "").trim().toLowerCase();
    if (!email || !email.includes("@")) { unreachable++; continue; }
    // First order wins the name — the earliest is as good as any, and it keeps
    // the result stable between two calls that page in the same order.
    if (!byEmail.has(email)) byEmail.set(email, { email, name: r.customer_name?.trim() || null });
  }

  return {
    recipients: [...byEmail.values()],
    unreachableOrders: unreachable,
    paidOrders: paid.length,
    refundedOrders: refunded.length,
  };
}

import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth/can";
import { createAdminClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/admin/orders — the cross-event order book.
 *
 * Support questions arrive by name, email or a Stripe receipt, not by show,
 * so this searches every order. The event workspace's Orders tab is the same
 * list with ?event_id= applied.
 *
 *   ?q=        name, email, full order id, or a Stripe payment id (pi_…)
 *   ?scope=    all | refunds | comps
 *   ?event_id= one show
 *   ?limit=    default 50, max 200
 *
 * Scoped like the page it sits beside: artists don't get the cross-show book
 * at all (their view is their assigned shows), and anyone below owner sees
 * only orders for their own venue's shows.
 */
export async function GET(request: Request) {
  const guard = await requireStaff();
  if (!guard.ok) return guard.response;
  if (guard.actor.role === "artist") {
    return NextResponse.json({ error: "Not available for artist accounts" }, { status: 403 });
  }
  const venueScope = guard.actor.resolved.level === "owner" ? null : guard.actor.venueId;

  const params = new URL(request.url).searchParams;
  const q = (params.get("q") ?? "").trim();
  const scope = params.get("scope") ?? "all";
  const eventId = params.get("event_id");
  const limit = Math.min(Number(params.get("limit")) || 50, 200);
  const admin = createAdminClient();

  let query = admin
    .from("orders")
    .select("id, customer_name, customer_email, quantity, total_amount, status, source, created_at, event_id, stripe_payment_intent_id, events!inner(title, date, venue_id)", { count: "exact" })
    .order("created_at", { ascending: false })
    .limit(limit);

  if (venueScope) query = query.eq("events.venue_id", venueScope);
  if (eventId) query = query.eq("event_id", eventId);
  if (scope === "refunds") query = query.eq("status", "refunded");
  if (scope === "comps") query = query.eq("source", "comp");
  if (q) {
    if (UUID.test(q)) query = query.eq("id", q);
    else if (q.startsWith("pi_")) query = query.eq("stripe_payment_intent_id", q);
    else {
      // PostgREST or-filter: commas and parens would break the expression.
      const safe = q.replace(/[,()*]/g, " ").trim();
      query = query.or(`customer_name.ilike.*${safe}*,customer_email.ilike.*${safe}*`);
    }
  }

  const { data, error, count } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ orders: data ?? [], total: count ?? 0 });
}

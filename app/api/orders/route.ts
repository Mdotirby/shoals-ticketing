import { createAdminClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";
import { getAdminActor, requireStaff } from "@/lib/auth/can";
import { DENY, tenantScope } from "@/lib/auth/tenant";

/**
 * GET: list orders.  ?event_id= &venue_id=
 *
 * THIS ROUTE ANSWERED ANYONE. No session, no guard — an anonymous request
 * returned all 994 orders with customer_name, customer_email, customer_phone,
 * customer_zip, shipping_address and the Stripe payment intent for every one.
 * `venue_id` was an optional filter, so omitting it returned every tenant's
 * orders and supplying someone else's returned theirs.
 *
 * Staff only now, and pinned to the caller's own venue unless they hold
 * cross_tenant_reporting — see lib/auth/tenant.ts.
 */
export async function GET(request: Request) {
  const guard = await requireStaff();
  if (!guard.ok) return guard.response;

  const admin = createAdminClient();
  const { searchParams } = new URL(request.url);
  const eventId = searchParams.get("event_id");
  const scope = tenantScope(await getAdminActor(), searchParams.get("venue_id"));
  if (scope === DENY) return NextResponse.json([], { status: 200 });

  let query = admin
    .from("orders")
    .select("*, events!inner(title, venue, venue_id), promo_codes(code, discount_type, discount_value)")
    .order("created_at", { ascending: false })
    .limit(2000);

  if (eventId) {
    query = query.eq("event_id", eventId);
  }

  // The tenant boundary, not a filter the caller chose.
  if (scope !== null) {
    query = query.eq("events.venue_id", scope);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}

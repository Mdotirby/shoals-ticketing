import { createAdminClient } from "@/lib/supabase-server";
import { NextRequest, NextResponse } from "next/server";

// POST /api/cart-abandonment — Track a cart abandonment (called when user enters email but doesn't complete checkout)
export async function POST(req: NextRequest) {
  const body = await req.json();
  const admin = createAdminClient();

  if (!body.event_id || !body.customer_email) {
    return NextResponse.json({ error: "event_id and customer_email required" }, { status: 400 });
  }

  // Check if there's already a pending abandonment for this email + event
  const { data: existing } = await admin
    .from("cart_abandonment")
    .select("id")
    .eq("event_id", body.event_id)
    .eq("customer_email", body.customer_email.toLowerCase())
    .eq("recovered", false)
    .maybeSingle();

  if (existing) {
    // Update existing record
    await admin
      .from("cart_abandonment")
      .update({ quantity: body.quantity || 1, created_at: new Date().toISOString() })
      .eq("id", existing.id);
    return NextResponse.json({ tracked: true, updated: true });
  }

  const { error } = await admin.from("cart_abandonment").insert({
    event_id: body.event_id,
    customer_email: body.customer_email.toLowerCase(),
    customer_name: body.customer_name || null,
    quantity: body.quantity || 1,
    ticket_type: body.ticket_type || null,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ tracked: true });
}

// GET /api/cart-abandonment — List pending abandonments (admin)
export async function GET(req: NextRequest) {
  const eventId = req.nextUrl.searchParams.get("event_id");
  const admin = createAdminClient();

  let query = admin
    .from("cart_abandonment")
    .select("*, events(title, date)")
    .eq("recovered", false)
    .order("created_at", { ascending: false });

  if (eventId) query = query.eq("event_id", eventId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

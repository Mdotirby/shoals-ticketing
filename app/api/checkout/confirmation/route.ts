import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-server";

// GET /api/checkout/confirmation?session_id=...
// Returns order + first ticket QR for the success page
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get("session_id");

  if (!sessionId) {
    return NextResponse.json({ error: "session_id required" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: order, error } = await admin
    .from("orders")
    .select("id, customer_name, customer_email, quantity, total_amount, event_id, status")
    .eq("stripe_checkout_session_id", sessionId)
    .single();

  if (error || !order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  // Fetch event details
  const { data: event } = await admin
    .from("events")
    .select("title, date, venue")
    .eq("id", order.event_id)
    .single();

  // Fetch first ticket's QR code (for display)
  const { data: tickets } = await admin
    .from("tickets")
    .select("id, qr_code, qr_data_url")
    .eq("order_id", order.id)
    .limit(1);

  return NextResponse.json({
    order,
    event: event || null,
    ticket: tickets?.[0] || null,
  });
}

import { createAdminClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";

// GET /api/admin/orders/[orderId]
// Returns the full order with its tickets and event info for the order detail page.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ orderId: string }> }
) {
  const { orderId } = await params;
  const admin = createAdminClient();

  // Fetch the order + event details + promo code in one query
  const { data: order, error: orderError } = await admin
    .from("orders")
    .select(`
      *,
      events!inner(
        id,
        title,
        date,
        venue,
        venue_id
      ),
      promo_codes(code, discount_type, discount_value)
    `)
    .eq("id", orderId)
    .single();

  if (orderError || !order) {
    return NextResponse.json(
      { error: orderError?.message ?? "Order not found" },
      { status: 404 }
    );
  }

  // Fetch venue slug for the email sender address
  let venueSlug = "tickets";
  if (order.events?.venue_id) {
    const { data: venueData } = await admin
      .from("venues")
      .select("slug")
      .eq("id", order.events.venue_id)
      .single();
    if (venueData?.slug) venueSlug = venueData.slug;
  }

  // Fetch all tickets for this order
  const { data: tickets, error: ticketsError } = await admin
    .from("tickets")
    .select("id, qr_code, qr_data_url, ticket_type_id, customer_name, customer_email, is_scanned, scanned_at, created_at")
    .eq("order_id", orderId)
    .order("created_at", { ascending: true });

  if (ticketsError) {
    return NextResponse.json({ error: ticketsError.message }, { status: 500 });
  }

  return NextResponse.json({
    order,
    venueSlug,
    tickets: tickets ?? [],
  });
}

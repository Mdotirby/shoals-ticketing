import { createAdminClient } from "@/lib/supabase-server";
import { resolveVenueFees, calculateFees } from "@/lib/checkout-helpers";
import { NextResponse } from "next/server";

/**
 * GET /api/admin/orders/[orderId]/fee-preview?tier_id=xxx&quantity=1
 *
 * Returns the full fee breakdown (ticketing fee, facility fee, tax, processing fee,
 * total) for a given ticket tier, using the same logic as the customer checkout.
 * Also returns all tiers for this event so the UI can build the dropdown.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ orderId: string }> }
) {
  const { orderId } = await params;
  const { searchParams } = new URL(req.url);
  const tierId = searchParams.get("tier_id");
  const quantity = Math.max(1, parseInt(searchParams.get("quantity") || "1", 10));

  const admin = createAdminClient();

  // Get event from order
  const { data: order } = await admin
    .from("orders")
    .select("event_id")
    .eq("id", orderId)
    .single();

  if (!order?.event_id) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  // Fetch event + all tiers
  const { data: event } = await admin
    .from("events")
    .select("id, title, price, venue_id, event_venue_id, facility_fee_enabled")
    .eq("id", order.event_id)
    .single();

  if (!event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  const { data: tiers } = await admin
    .from("ticket_tiers")
    .select("id, tier_name, price, capacity")
    .eq("event_id", order.event_id)
    .order("sort_order", { ascending: true });

  // Resolve venue fees (ticketing fee, facility fee, tax rate)
  const fees = await resolveVenueFees(admin, event);
  const effectiveTaxRate = fees.taxMethod === "divisor" ? 0 : fees.taxRate;

  // If no tier_id provided, return just the tiers list
  if (!tierId) {
    return NextResponse.json({ tiers: tiers || [], fees });
  }

  // Find the selected tier
  const tier = (tiers || []).find((t: { id: string }) => t.id === tierId);
  if (!tier) {
    return NextResponse.json({ error: "Tier not found" }, { status: 404 });
  }

  const ticketPriceCents = Math.round((tier as { price: number }).price * 100);
  const breakdown = calculateFees({
    ticketPriceCents,
    discountCentsPerTicket: 0,
    ticketingFee: fees.ticketingFee,
    facilityFee: fees.facilityFee,
    taxRate: effectiveTaxRate,
    quantity,
  });

  return NextResponse.json({
    tiers: tiers || [],
    fees,
    tier,
    breakdown,
  });
}

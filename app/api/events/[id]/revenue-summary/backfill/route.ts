import { createAdminClient } from "@/lib/supabase-server";
import { resolveVenueFees } from "@/lib/checkout-helpers";
import { NextResponse } from "next/server";

/**
 * POST /api/events/[id]/revenue-summary/backfill
 *
 * Creates settlement_ledger rows for any paid order that doesn't have one.
 * Uses the same fee math as the Stripe webhook — venue fee rates resolved
 * from event_venues → venues → defaults.
 *
 * Safe to run multiple times: only inserts rows for orders with no ledger entry.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: eventId } = await params;
  const admin = createAdminClient();

  // Load event + venue info needed for fee resolution
  const { data: event, error: eventError } = await admin
    .from("events")
    .select("id, price, venue_id, event_venue_id, facility_fee_enabled, tax_method, fees_included_in_price")
    .eq("id", eventId)
    .single();

  if (eventError || !event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  // Resolve venue fee rates (ticketing fee, facility fee, tax rate, rebate)
  const fees = await resolveVenueFees(admin, event);

  // Load all paid orders for this event
  const { data: orders, error: ordersError } = await admin
    .from("orders")
    .select("id, total_amount, quantity, stripe_checkout_session_id, status, source")
    .eq("event_id", eventId)
    .eq("status", "paid");

  if (ordersError) {
    return NextResponse.json({ error: ordersError.message }, { status: 500 });
  }

  if (!orders || orders.length === 0) {
    return NextResponse.json({ backfilled: 0, message: "No paid orders found" });
  }

  // Delete ALL existing sale entries for this event and recreate from scratch.
  // This ensures wrong ticket_revenue values (from earlier code) get corrected.
  await admin
    .from("settlement_ledger")
    .delete()
    .eq("event_id", eventId)
    .eq("type", "sale");

  // Build ledger rows: ticket_revenue = face value (before fees/tax/stripe)
  const effectiveTaxRate = fees.taxMethod === "divisor" ? 0 : fees.taxRate;

  const rows = orders.map((order: { id: string; total_amount: number; quantity: number; stripe_checkout_session_id: string | null }) => {
    const totalAmount = Number(order.total_amount) || 0;
    const quantity = Number(order.quantity) || 1;
    const totalTicketingFee = Math.round(fees.ticketingFee * quantity * 100) / 100;
    const ticketingFeeToSubtract = fees.feesIncludedInPrice ? 0 : totalTicketingFee;
    const stripeFee = Math.round((totalAmount * 0.027 + 0.30) * 100) / 100;
    // Solve: gross = face*(1+taxRate) + ticketingFee + stripeFee  →  face = (gross - fees) / (1+taxRate)
    const ticketRevenue = effectiveTaxRate > 0
      ? Math.round(((totalAmount - ticketingFeeToSubtract - stripeFee) / (1 + effectiveTaxRate)) * 100) / 100
      : Math.round((totalAmount - ticketingFeeToSubtract - stripeFee) * 100) / 100;
    const taxCollected = Math.round(ticketRevenue * effectiveTaxRate * 100) / 100;
    const venueRebate = Math.round(fees.venueRebate * quantity * 100) / 100;

    return {
      order_id: order.id,
      event_id: eventId,
      venue_id: event.venue_id || null,
      stripe_session_id: order.stripe_checkout_session_id || null,
      gross_amount: totalAmount,
      ticket_revenue: ticketRevenue,
      ticketing_fee: totalTicketingFee,
      venue_rebate: venueRebate,
      tax_collected: taxCollected,
      stripe_fee: stripeFee,
      net_to_venue: totalAmount - ticketingFeeToSubtract - stripeFee + venueRebate,
      net_to_platform: totalTicketingFee - venueRebate,
      type: "sale",
    };
  });

  const { error: insertError } = await admin
    .from("settlement_ledger")
    .insert(rows);

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({
    backfilled: rows.length,
    message: `Recalculated ${rows.length} ledger entr${rows.length === 1 ? "y" : "ies"} with correct face value`,
  });
}

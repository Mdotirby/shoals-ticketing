import { createAdminClient } from "@/lib/supabase-server";
import { getStripe } from "@/lib/stripe";
import { NextResponse } from "next/server";

/**
 * POST /api/admin/orders/[orderId]/refund
 *
 * Full-order cancellation: refunds the payment via Stripe (skipped for
 * zero-dollar comp orders — nothing to reverse), releases every seat tied to
 * the order back to available for resale, and marks the order Refunded.
 * Use this for "wrong event" / "wrong tickets" mistakes — not for billing
 * corrections, where the seats should stay reserved (see Request Correct
 * Payment / Reinstate as Comp instead).
 *
 * Body: { note?: string }
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ orderId: string }> }
) {
  const { orderId } = await params;
  const body = await req.json().catch(() => ({}));
  const note: string | undefined = body?.note;

  const admin = createAdminClient();

  const { data: order, error: findError } = await admin
    .from("orders")
    .select("id, status, notes, total_amount, stripe_payment_intent_id")
    .eq("id", orderId)
    .single();

  if (findError || !order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  if (order.status === "refunded") {
    return NextResponse.json({ error: "Order is already refunded" }, { status: 400 });
  }

  // Issue the actual refund via Stripe when there's a real payment to reverse.
  // Zero-dollar comp orders have nothing to refund — just release seats below.
  if (Number(order.total_amount) > 0) {
    if (!order.stripe_payment_intent_id) {
      return NextResponse.json(
        { error: "No Stripe payment on this order — nothing to refund via Stripe. Release seats manually if needed." },
        { status: 400 }
      );
    }
    try {
      const stripe = getStripe();
      await stripe.refunds.create({ payment_intent: order.stripe_payment_intent_id });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Stripe refund failed";
      return NextResponse.json({ error: `Stripe refund failed: ${message}` }, { status: 502 });
    }
  }

  // Release every seat tied to this order back into inventory.
  const { data: releasedSeats, error: seatError } = await admin
    .from("seats")
    .update({ status: "available", order_id: null, ticket_id: null, held_until: null, held_session: null })
    .eq("order_id", orderId)
    .select("id");

  if (seatError) {
    // The refund already went through on Stripe's side — surface this clearly
    // rather than silently leaving seats locked with no order status change.
    return NextResponse.json(
      { error: `Refund succeeded on Stripe, but releasing seats failed: ${seatError.message}. Release them manually.` },
      { status: 500 }
    );
  }

  const existingNote = order.notes ? `${order.notes}\n` : "";
  const refundNote = note?.trim()
    ? note.trim()
    : `Refunded in full on ${new Date().toLocaleDateString("en-US")}. Seats released for resale.`;

  const { error: updateError } = await admin
    .from("orders")
    .update({ status: "refunded", notes: `${existingNote}${refundNote}` })
    .eq("id", orderId);

  if (updateError) {
    return NextResponse.json(
      { error: `Refund succeeded and seats were released, but updating order status failed: ${updateError.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    seatsReleased: (releasedSeats || []).length,
  });
}

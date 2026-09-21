import { requireCapability } from "@/lib/auth/can";
import { createAdminClient } from "@/lib/supabase-server";
import { getStripe } from "@/lib/stripe";
import { NextResponse } from "next/server";
import { writeAudit } from "@/lib/auth/audit";
import { REFUND_REASONS, refundBlocker } from "@/lib/orders/refundPolicy";

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
 * Policy (lib/orders/refundPolicy.ts): only for a cancelled show or a glitch
 * on our side, always the full all-in amount, never for cash. The reason is
 * required and recorded on the order and in the audit log.
 *
 * Body: { reason: "show_cancelled" | "glitch", note?: string }
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ orderId: string }> }
) {
  const guard = await requireCapability("invoices_payments", { write: true });
  if (!guard.ok) return guard.response;

  const { orderId } = await params;
  const body = await req.json().catch(() => ({}));
  const note: string | undefined = body?.note;
  const reason: unknown = body?.reason;

  const admin = createAdminClient();

  const { data: order, error: findError } = await admin
    .from("orders")
    .select("id, status, source, notes, total_amount, stripe_payment_intent_id, event_id, events(booking_status, venue_id)")
    .eq("id", orderId)
    .single();

  if (findError || !order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  const event = (Array.isArray(order.events) ? order.events[0] : order.events) as
    | { booking_status: string | null; venue_id: string | null }
    | null;
  const blocked = refundBlocker(order, event, reason);
  if (blocked) {
    return NextResponse.json({ error: blocked }, { status: 400 });
  }
  const reasonLabel = REFUND_REASONS[reason as keyof typeof REFUND_REASONS];

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
  const reasonLine = `Refund reason: ${reasonLabel}.`;

  const { error: updateError } = await admin
    .from("orders")
    .update({ status: "refunded", notes: `${existingNote}${reasonLine} ${refundNote}` })
    .eq("id", orderId);

  if (updateError) {
    return NextResponse.json(
      { error: `Refund succeeded and seats were released, but updating order status failed: ${updateError.message}` },
      { status: 500 }
    );
  }

  await writeAudit(guard.actor, {
    action: "order.refunded",
    targetType: "order",
    targetId: orderId,
    venueId: event?.venue_id ?? null,
    detail: { reason, amount: Number(order.total_amount) || 0, event_id: order.event_id, note: note?.trim() || null },
  });

  return NextResponse.json({
    success: true,
    seatsReleased: (releasedSeats || []).length,
  });
}

import { createAdminClient } from "@/lib/supabase-server";
import { getSeatIdsFromStripe } from "@/lib/stripe-seat-repair";
import { NextResponse } from "next/server";

/**
 * POST /api/admin/orders/[orderId]/repair-seats
 *
 * Two modes:
 *  1. Auto (no body / empty body): pulls seat_ids from Stripe metadata.
 *  2. Manual ({ manualSeatIds: string[] }): assigns the given seat IDs directly.
 *
 * Both modes refuse to overwrite seats already sold to a different order.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ orderId: string }> }
) {
  const { orderId } = await params;
  const admin = createAdminClient();

  const body = await req.json().catch(() => ({}));
  const manualSeatIds: string[] | undefined = Array.isArray(body?.manualSeatIds)
    ? body.manualSeatIds
    : undefined;

  // Load the order
  const { data: order, error: orderError } = await admin
    .from("orders")
    .select("id, stripe_checkout_session_id, event_id")
    .eq("id", orderId)
    .single();

  if (orderError || !order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  let seatIds: string[] = [];

  if (manualSeatIds && manualSeatIds.length > 0) {
    // ── Manual mode ──────────────────────────────────────────────────────────
    seatIds = manualSeatIds;
  } else {
    // ── Auto mode: pull from Stripe ──────────────────────────────────────────
    if (!order.stripe_checkout_session_id) {
      return NextResponse.json(
        { error: "No Stripe session ID on this order. Use manual assignment." },
        { status: 400 }
      );
    }

    try {
      seatIds = await getSeatIdsFromStripe(order.stripe_checkout_session_id);
    } catch (e) {
      return NextResponse.json(
        { error: `Failed to retrieve Stripe record: ${e instanceof Error ? e.message : String(e)}` },
        { status: 500 }
      );
    }

    if (seatIds.length === 0) {
      return NextResponse.json(
        { error: "No seat_ids found in the Stripe metadata. Use manual assignment." },
        { status: 400 }
      );
    }
  }

  // Check for conflicts with other orders
  const { data: seats, error: seatsError } = await admin
    .from("seats")
    .select("id, status, order_id")
    .in("id", seatIds);

  if (seatsError) {
    return NextResponse.json({ error: seatsError.message }, { status: 500 });
  }

  const conflicts = (seats || []).filter(
    (s: { status: string; order_id: string | null }) =>
      s.status === "sold" && s.order_id !== orderId
  );

  if (conflicts.length > 0) {
    return NextResponse.json(
      {
        error: `${conflicts.length} seat(s) already sold to a different order.`,
        conflicting_seat_ids: conflicts.map((s: { id: string }) => s.id),
      },
      { status: 409 }
    );
  }

  const { error: updateError } = await admin
    .from("seats")
    .update({ status: "sold", order_id: orderId, held_until: null, held_session: null })
    .in("id", seatIds);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, repairedSeats: seatIds.length, seatIds });
}

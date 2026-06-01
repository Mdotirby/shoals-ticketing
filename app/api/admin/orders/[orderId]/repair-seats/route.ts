import { createAdminClient } from "@/lib/supabase-server";
import { getStripe } from "@/lib/stripe";
import { NextResponse } from "next/server";

/**
 * POST /api/admin/orders/[orderId]/repair-seats
 *
 * Fixes orders where payment completed but seats were never marked sold.
 * Retrieves seat_ids from the Stripe session metadata and marks them sold,
 * linking them to this order. Safe to run multiple times — only touches
 * seats that are "available" or "held" (won't overwrite seats already sold
 * to a different order).
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ orderId: string }> }
) {
  const { orderId } = await params;
  const admin = createAdminClient();

  // Load the order to get the Stripe session ID
  const { data: order, error: orderError } = await admin
    .from("orders")
    .select("id, stripe_checkout_session_id, event_id")
    .eq("id", orderId)
    .single();

  if (orderError || !order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  if (!order.stripe_checkout_session_id) {
    return NextResponse.json(
      { error: "No Stripe session ID on this order — cannot look up seat assignments." },
      { status: 400 }
    );
  }

  // Retrieve the Stripe session to get seat_ids from metadata
  const stripe = getStripe();
  let seatIds: string[] = [];
  try {
    const session = await stripe.checkout.sessions.retrieve(
      order.stripe_checkout_session_id
    );
    const raw = session.metadata?.seat_ids;
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) seatIds = parsed.filter((id) => typeof id === "string");
    }
  } catch (e) {
    return NextResponse.json(
      { error: `Failed to retrieve Stripe session: ${e instanceof Error ? e.message : String(e)}` },
      { status: 500 }
    );
  }

  if (seatIds.length === 0) {
    return NextResponse.json(
      { error: "No seat_ids found in the Stripe session metadata. This was a general-admission purchase or seat IDs were not recorded at checkout." },
      { status: 400 }
    );
  }

  // Verify these seats still exist and are not already sold to a different order
  const { data: seats, error: seatsError } = await admin
    .from("seats")
    .select("id, status, order_id")
    .in("id", seatIds);

  if (seatsError) {
    return NextResponse.json({ error: seatsError.message }, { status: 500 });
  }

  const alreadySoldElsewhere = (seats || []).filter(
    (s: { status: string; order_id: string | null }) =>
      s.status === "sold" && s.order_id !== orderId
  );

  if (alreadySoldElsewhere.length > 0) {
    return NextResponse.json(
      {
        error: `${alreadySoldElsewhere.length} seat(s) are already sold to a different order. Manual intervention required.`,
        conflicting_seat_ids: alreadySoldElsewhere.map((s: { id: string }) => s.id),
      },
      { status: 409 }
    );
  }

  // Mark seats sold and link to this order
  const { error: updateError } = await admin
    .from("seats")
    .update({ status: "sold", order_id: orderId, held_until: null, held_session: null })
    .in("id", seatIds);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    repairedSeats: seatIds.length,
    seatIds,
  });
}

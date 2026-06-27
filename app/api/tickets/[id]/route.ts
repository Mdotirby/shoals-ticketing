import { createAdminClient } from "@/lib/supabase-server";
import { getSeatIdsFromStripe } from "@/lib/stripe-seat-repair";
import { buildSeatAssignments, buildSeatAssignmentsByTicket } from "@/lib/seating/buildAssignments";
import { NextResponse } from "next/server";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("tickets")
    .select("*, events!inner(title, venue, date)")
    .eq("qr_code", id)
    .single();

  if (error) {
    return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
  }

  // Fetch sibling tickets + operator slug from the same order
  let siblings: typeof data[] = [];
  let orderOperatorSlug: string | null = null;
  if (data.order_id) {
    const [{ data: allTickets }, { data: orderRow }] = await Promise.all([
      admin
        .from("tickets")
        .select("id, qr_code, qr_data_url, customer_name, customer_email, is_scanned")
        .eq("order_id", data.order_id)
        .order("created_at", { ascending: true }),
      admin
        .from("orders")
        .select("operator_slug")
        .eq("id", data.order_id)
        .single(),
    ]);
    siblings = allTickets || [];
    orderOperatorSlug = orderRow?.operator_slug ?? null;
  }

  // Build seat assignments per ticket so each ticket in the carousel shows its own seat.
  // Falls back to order-level for pre-migration rows (ticket_id not yet set on seats).
  let assignmentsByTicket = new Map<string, Awaited<ReturnType<typeof buildSeatAssignments>>>();
  if (data.order_id) {
    try {
      assignmentsByTicket = await buildSeatAssignmentsByTicket(admin, data.order_id);

      // Auto-repair: if no sold seats linked yet, pull from Stripe and link them
      const hasAny = assignmentsByTicket.size > 0;
      if (!hasAny) {
        await tryRepairSeatsFromStripe(admin, data.order_id);
        assignmentsByTicket = await buildSeatAssignmentsByTicket(admin, data.order_id);
      }
    } catch {
      // Non-fatal
    }
  }

  // Attach per-ticket seat assignments to each sibling.
  // When ticket_id is not populated (pre-migration), "__order__" holds all seats as fallback.
  const fallbackAssignments = assignmentsByTicket.get("__order__") ?? [];
  const siblingsWithSeats = siblings.map((s) => ({
    ...s,
    seatAssignments: assignmentsByTicket.get(s.id) ?? fallbackAssignments,
  }));

  const seatAssignments = assignmentsByTicket.get(data.id) ?? fallbackAssignments;

  return NextResponse.json({ ...data, siblings: siblingsWithSeats, seatAssignments, operatorSlug: orderOperatorSlug });
}

async function tryRepairSeatsFromStripe(
  admin: ReturnType<typeof createAdminClient>,
  orderId: string
): Promise<void> {
  const { data: order } = await admin
    .from("orders")
    .select("stripe_checkout_session_id")
    .eq("id", orderId)
    .single();

  if (!order?.stripe_checkout_session_id) return;

  let seatIds: string[] = [];
  try {
    seatIds = await getSeatIdsFromStripe(order.stripe_checkout_session_id);
  } catch {
    return;
  }

  if (seatIds.length === 0) return;

  const { data: seats } = await admin
    .from("seats")
    .select("id, status, order_id")
    .in("id", seatIds);

  const safeIds = (seats || [])
    .filter((s: { status: string; order_id: string | null }) =>
      s.status !== "sold" || s.order_id === orderId
    )
    .map((s: { id: string }) => s.id);

  if (safeIds.length === 0) return;

  await admin
    .from("seats")
    .update({ status: "sold", order_id: orderId, held_until: null, held_session: null })
    .in("id", safeIds);
}

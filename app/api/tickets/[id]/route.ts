import { createAdminClient } from "@/lib/supabase-server";
import { getSeatIdsFromStripe } from "@/lib/stripe-seat-repair";
import { NextResponse } from "next/server";

// GET: fetch ticket by QR code (the [id] param IS the qr_code)
// Also returns sibling tickets from the same order for carousel view.
// If seats are missing (never linked at checkout), auto-repairs by pulling
// seat_ids from the Stripe session metadata and marking them sold.
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
    return NextResponse.json(
      { error: "Ticket not found" },
      { status: 404 }
    );
  }

  // Fetch sibling tickets from the same order
  let siblings: typeof data[] = [];
  if (data.order_id) {
    const { data: allTickets } = await admin
      .from("tickets")
      .select("id, qr_code, qr_data_url, customer_name, customer_email, is_scanned")
      .eq("order_id", data.order_id)
      .order("created_at", { ascending: true });
    siblings = allTickets || [];
  }

  // Look up seat assignments for this order
  let seatAssignments: { section: string; row: string; seat: string }[] = [];

  if (data.order_id) {
    try {
      const soldSeats = await fetchSoldSeats(admin, data.order_id);

      // ── Auto-repair: seats not linked yet ──────────────────────────────────
      // Happens when checkout completed but seat_ids weren't stored in Stripe
      // metadata (pre-fix purchases). Pull seat_ids from the Stripe session and
      // mark them sold now so every subsequent load is instant.
      if (soldSeats.length === 0) {
        await tryRepairSeatsFromStripe(admin, data.order_id);
        // Re-fetch after repair attempt
        const repaired = await fetchSoldSeats(admin, data.order_id);
        soldSeats.push(...repaired);
      }

      if (soldSeats.length > 0) {
        seatAssignments = await buildSeatAssignments(admin, soldSeats);
      }
    } catch {
      // Non-fatal — proceed without seat assignments
    }
  }

  return NextResponse.json({ ...data, siblings, seatAssignments });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

type AdminClient = ReturnType<typeof createAdminClient>;
type SeatRow = { section_id: string; row_label: string; seat_number: number };

async function fetchSoldSeats(admin: AdminClient, orderId: string): Promise<SeatRow[]> {
  const { data } = await admin
    .from("seats")
    .select("id, seat_number, row_label, section_id")
    .eq("order_id", orderId)
    .eq("status", "sold");
  return (data || []) as SeatRow[];
}

async function tryRepairSeatsFromStripe(admin: AdminClient, orderId: string): Promise<void> {
  // Look up the Stripe session ID from the order
  const { data: order } = await admin
    .from("orders")
    .select("stripe_checkout_session_id")
    .eq("id", orderId)
    .single();

  if (!order?.stripe_checkout_session_id) return;

  // Retrieve seat_ids — handles both cs_… (Checkout Session) and pi_… (PaymentIntent)
  let seatIds: string[] = [];
  try {
    seatIds = await getSeatIdsFromStripe(order.stripe_checkout_session_id);
  } catch {
    return; // Stripe lookup failed — skip silently
  }

  if (seatIds.length === 0) return;

  // Only mark seats that aren't already sold to a different order
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

async function buildSeatAssignments(admin: AdminClient, seats: SeatRow[]) {
  const sectionIds = [...new Set(seats.map((s) => s.section_id))];
  const { data: sectionData } = await admin
    .from("sections")
    .select("id, name")
    .in("id", sectionIds);

  const sectionMap = new Map(
    (sectionData || []).map((s: { id: string; name: string }) => [s.id, s.name])
  );

  return seats
    .map((seat) => ({
      section: sectionMap.get(seat.section_id) || "Section",
      row: seat.row_label,
      seat: String(seat.seat_number),
    }))
    .sort((a, b) =>
      a.section.localeCompare(b.section) ||
      a.row.localeCompare(b.row) ||
      a.seat.localeCompare(b.seat, undefined, { numeric: true })
    );
}

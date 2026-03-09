import { createAdminClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";

const RESERVATION_MINUTES = 10;

/**
 * POST /api/seating/events/[eventId]/reserve
 * Hold one or more seats for 10 minutes.
 * Body: { seat_ids: string[], session_id?: string, user_id?: string }
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const { eventId } = await params;
  const admin = createAdminClient();
  const body = await request.json();
  const { seat_ids, session_id, user_id } = body;

  if (!Array.isArray(seat_ids) || seat_ids.length === 0) {
    return NextResponse.json(
      { error: "seat_ids array is required" },
      { status: 400 }
    );
  }

  // Verify these seats are currently available
  const { data: seats, error: seatError } = await admin
    .from("seating_seats")
    .select("id, status")
    .in("id", seat_ids);

  if (seatError || !seats) {
    return NextResponse.json(
      { error: "Failed to look up seats" },
      { status: 500 }
    );
  }

  const unavailable = seats.filter((s) => s.status !== "available");
  if (unavailable.length > 0) {
    return NextResponse.json(
      {
        error: "Some seats are no longer available",
        unavailable_seat_ids: unavailable.map((s) => s.id),
      },
      { status: 409 }
    );
  }

  const expiresAt = new Date(
    Date.now() + RESERVATION_MINUTES * 60 * 1000
  ).toISOString();

  // Update seat statuses to held
  const { error: updateError } = await admin
    .from("seating_seats")
    .update({ status: "held" })
    .in("id", seat_ids);

  if (updateError) {
    return NextResponse.json(
      { error: "Failed to hold seats" },
      { status: 500 }
    );
  }

  // Create reservation records
  const reservations = seat_ids.map((seatId: string) => ({
    seat_id: seatId,
    event_id: eventId,
    user_id: user_id || null,
    session_id: session_id || null,
    reservation_expires: expiresAt,
    status: "held",
  }));

  const { data: created, error: resError } = await admin
    .from("seat_reservations")
    .insert(reservations)
    .select();

  if (resError) {
    // Rollback seat statuses
    await admin
      .from("seating_seats")
      .update({ status: "available" })
      .in("id", seat_ids);

    return NextResponse.json(
      { error: "Failed to create reservations" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    reservations: created,
    expires_at: expiresAt,
  });
}

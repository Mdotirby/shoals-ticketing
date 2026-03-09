import { createAdminClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";

/**
 * POST /api/seating/events/[eventId]/release
 * Release held seats back to available.
 * Body: { seat_ids: string[] }
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const { eventId } = await params;
  const admin = createAdminClient();
  const body = await request.json();
  const { seat_ids } = body;

  if (!Array.isArray(seat_ids) || seat_ids.length === 0) {
    return NextResponse.json(
      { error: "seat_ids array is required" },
      { status: 400 }
    );
  }

  // Release seat statuses
  const { error: seatError } = await admin
    .from("seating_seats")
    .update({ status: "available" })
    .in("id", seat_ids)
    .eq("status", "held");

  if (seatError) {
    return NextResponse.json(
      { error: "Failed to release seats" },
      { status: 500 }
    );
  }

  // Mark reservations as expired
  const { error: resError } = await admin
    .from("seat_reservations")
    .update({ status: "expired" })
    .in("seat_id", seat_ids)
    .eq("event_id", eventId)
    .eq("status", "held");

  if (resError) {
    return NextResponse.json(
      { error: "Failed to update reservations" },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}

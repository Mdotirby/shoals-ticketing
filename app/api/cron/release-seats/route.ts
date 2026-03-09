import { createAdminClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";

/**
 * GET /api/cron/release-seats
 * Background job — releases expired seat reservations.
 * Should be called every 60 seconds via Vercel Cron or external scheduler.
 */
export async function GET() {
  const admin = createAdminClient();

  // Find expired held reservations
  const { data: expired, error: findError } = await admin
    .from("seat_reservations")
    .select("id, seat_id")
    .eq("status", "held")
    .lt("reservation_expires", new Date().toISOString());

  if (findError) {
    return NextResponse.json(
      { error: findError.message },
      { status: 500 }
    );
  }

  if (!expired || expired.length === 0) {
    return NextResponse.json({ released: 0 });
  }

  const seatIds = expired.map((r) => r.seat_id);
  const reservationIds = expired.map((r) => r.id);

  // Release seats back to available
  const { error: seatError } = await admin
    .from("seating_seats")
    .update({ status: "available" })
    .in("id", seatIds);

  if (seatError) {
    return NextResponse.json(
      { error: "Failed to release seats: " + seatError.message },
      { status: 500 }
    );
  }

  // Mark reservations as expired
  const { error: resError } = await admin
    .from("seat_reservations")
    .update({ status: "expired" })
    .in("id", reservationIds);

  if (resError) {
    return NextResponse.json(
      { error: "Failed to update reservations: " + resError.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    released: expired.length,
    seat_ids: seatIds,
  });
}

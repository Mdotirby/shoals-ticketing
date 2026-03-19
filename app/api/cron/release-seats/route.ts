import { createAdminClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";

/**
 * GET /api/cron/release-seats
 * Background job — releases expired held seats.
 * V3: seats table has status='held' + held_until timestamp directly.
 */
export async function GET() {
  const admin = createAdminClient();

  // Find expired held seats
  const { data: expired, error: findError } = await admin
    .from("seats")
    .select("id")
    .eq("status", "held")
    .lt("held_until", new Date().toISOString());

  if (findError) {
    return NextResponse.json({ error: findError.message }, { status: 500 });
  }

  if (!expired || expired.length === 0) {
    return NextResponse.json({ released: 0 });
  }

  const seatIds = expired.map((r: { id: string }) => r.id);

  // Release seats back to available
  const { error: seatError } = await admin
    .from("seats")
    .update({ status: "available", held_until: null, held_session: null })
    .in("id", seatIds);

  if (seatError) {
    return NextResponse.json(
      { error: "Failed to release seats: " + seatError.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    released: expired.length,
    seat_ids: seatIds,
  });
}

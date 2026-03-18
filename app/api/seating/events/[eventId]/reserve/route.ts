import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

/** POST /api/seating/events/[eventId]/reserve — hold seats for 10 minutes */
export async function POST(req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const body = await req.json();
  const { seat_ids, session_id } = body;

  if (!Array.isArray(seat_ids) || seat_ids.length === 0) {
    return NextResponse.json({ error: "seat_ids required" }, { status: 400 });
  }

  // Check all seats are available
  const { data: seats } = await admin.from("seats").select("id, status").in("id", seat_ids);
  const unavailable = (seats || []).filter((s: { status: string }) => s.status !== "available");
  if (unavailable.length > 0) {
    return NextResponse.json({
      error: "Some seats are no longer available",
      unavailable_seat_ids: unavailable.map((s: { id: string }) => s.id),
    }, { status: 409 });
  }

  // Hold seats
  const heldUntil = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  const { error } = await admin.from("seats").update({
    status: "held",
    held_until: heldUntil,
    held_session: session_id || null,
  }).in("id", seat_ids);

  if (error) return NextResponse.json({ error: "Failed to hold seats" }, { status: 500 });

  // Suppress unused variable warning
  void eventId;

  return NextResponse.json({ success: true, held_until: heldUntil, seat_count: seat_ids.length });
}

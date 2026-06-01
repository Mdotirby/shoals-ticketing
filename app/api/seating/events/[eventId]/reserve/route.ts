import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

/** POST /api/seating/events/[eventId]/reserve — hold seats for 4 minutes */
export async function POST(req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const body = await req.json();
  const { seat_ids, session_id } = body;

  if (!Array.isArray(seat_ids) || seat_ids.length === 0) {
    return NextResponse.json({ error: "seat_ids required" }, { status: 400 });
  }

  // Validate seats belong to this event's layout (prevents cross-event seat theft)
  const { data: eventMap } = await admin
    .from("event_layout_maps")
    .select("layout_id")
    .eq("event_id", eventId)
    .eq("enabled", true)
    .single();

  if (!eventMap) {
    return NextResponse.json({ error: "No active seating layout for this event" }, { status: 404 });
  }

  const { data: layoutSections } = await admin
    .from("sections")
    .select("id")
    .eq("layout_id", eventMap.layout_id);

  const layoutSectionIds = (layoutSections || []).map((s: { id: string }) => s.id);

  const { data: validSeats } = await admin
    .from("seats")
    .select("id")
    .in("id", seat_ids)
    .in("section_id", layoutSectionIds);

  const validIds = new Set((validSeats || []).map((s: { id: string }) => s.id));
  const invalidIds = seat_ids.filter((id: string) => !validIds.has(id));
  if (invalidIds.length > 0) {
    return NextResponse.json({ error: "One or more seats do not belong to this event" }, { status: 400 });
  }

  // Atomic conditional update — only updates seats that are still available.
  // If another request grabbed any seat between our check and this update,
  // the affected_rows count will be less than seat_ids.length and we reject.
  const heldUntil = new Date(Date.now() + 4 * 60 * 1000).toISOString();
  const { data: updated, error } = await admin
    .from("seats")
    .update({ status: "held", held_until: heldUntil, held_session: session_id || null })
    .in("id", seat_ids)
    .eq("status", "available")
    .select("id");

  if (error) return NextResponse.json({ error: "Failed to hold seats" }, { status: 500 });

  const heldCount = (updated || []).length;
  if (heldCount < seat_ids.length) {
    // Some seats were taken between page load and checkout — release any we did hold
    const heldIds = (updated || []).map((s: { id: string }) => s.id);
    if (heldIds.length > 0) {
      await admin
        .from("seats")
        .update({ status: "available", held_until: null, held_session: null })
        .in("id", heldIds)
        .eq("held_session", session_id || "");
    }
    return NextResponse.json({
      error: "Some seats are no longer available",
      unavailable_seat_ids: seat_ids.filter((id: string) => !heldIds.includes(id)),
    }, { status: 409 });
  }

  return NextResponse.json({ success: true, held_until: heldUntil, seat_count: seat_ids.length });
}

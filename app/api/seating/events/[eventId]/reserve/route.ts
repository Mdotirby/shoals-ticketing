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

  // Check current state of the requested seats first. A seat is fair game if
  // it's available, OR if this same session already holds it — e.g. the
  // customer bounced back from the payment page (declined card, browser back,
  // a dropped connection) and is re-submitting the same seats they already
  // reserved. Without this exception, the atomic "only if available" update
  // below would see their own still-held seats as taken and reject the
  // request every time they retry within the 4-minute hold window.
  const { data: seatCheck } = await admin
    .from("seats")
    .select("id, status, held_session")
    .in("id", seat_ids);

  const trulyUnavailable = (seatCheck || []).filter(
    (s: { status: string; held_session: string | null }) =>
      s.status !== "available" && !(s.status === "held" && s.held_session === (session_id || null))
  );
  if (trulyUnavailable.length > 0) {
    return NextResponse.json({
      error: "Some seats are no longer available",
      unavailable_seat_ids: trulyUnavailable.map((s: { id: string }) => s.id),
    }, { status: 409 });
  }

  const alreadyMineIds = (seatCheck || [])
    .filter((s: { status: string; held_session: string | null }) => s.status === "held" && s.held_session === (session_id || null))
    .map((s: { id: string }) => s.id);
  const needToGrabIds = seat_ids.filter((id: string) => !alreadyMineIds.includes(id));

  const heldUntil = new Date(Date.now() + 4 * 60 * 1000).toISOString();

  // Atomic conditional update for the seats we don't already hold — only
  // updates rows still available. If another request grabbed any seat
  // between our check and this update, the affected_rows count will be less
  // than needToGrabIds.length and we reject the whole request.
  let grabbedIds: string[] = [];
  if (needToGrabIds.length > 0) {
    const { data: updated, error } = await admin
      .from("seats")
      .update({ status: "held", held_until: heldUntil, held_session: session_id || null })
      .in("id", needToGrabIds)
      .eq("status", "available")
      .select("id");

    if (error) return NextResponse.json({ error: "Failed to hold seats" }, { status: 500 });
    grabbedIds = (updated || []).map((s: { id: string }) => s.id);

    if (grabbedIds.length < needToGrabIds.length) {
      // Some seats were taken between our check and this update — release any we did grab
      if (grabbedIds.length > 0) {
        await admin
          .from("seats")
          .update({ status: "available", held_until: null, held_session: null })
          .in("id", grabbedIds)
          .eq("held_session", session_id || "");
      }
      return NextResponse.json({
        error: "Some seats are no longer available",
        unavailable_seat_ids: needToGrabIds.filter((id: string) => !grabbedIds.includes(id)),
      }, { status: 409 });
    }
  }

  // Refresh the hold timer on seats we already held — lets a retry extend its
  // own window instead of racing an unrelated expiry.
  if (alreadyMineIds.length > 0) {
    await admin
      .from("seats")
      .update({ held_until: heldUntil })
      .in("id", alreadyMineIds)
      .eq("held_session", session_id || "");
  }

  return NextResponse.json({ success: true, held_until: heldUntil, seat_count: seat_ids.length });
}

import { createAdminClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth/can";
import { actorName } from "@/lib/auth/actor-name";
import { assertSeatsBelongToEvent } from "@/lib/checkout-helpers";
import {
  SEAT_MARKS,
  seatsForMark,
  countMarks,
  type SeatMark,
  type MarkableSeat,
  type MarkableSection,
} from "@/lib/seating/showMarks";

/**
 * Holds and kills painted onto one show's seats.
 *
 * The builder's Show mode: artist, production, comp, kill, and release.
 * The room is untouched — these rows are per-event, because a seat belongs
 * to a layout and two shows can run on the same room
 * (plans/show-seat-marks-migration.sql).
 *
 * Every rule the canvas applies is applied again here. A tool that refuses
 * to paint a sold seat is a courtesy; this is the part that holds.
 */

type SeatRow = { id: string; status: string | null; section_id: string | null; object_id: string | null };
type SectionRow = {
  id: string; name: string;
  seating_mode: string | null; sells_as_table: boolean | null; type: string | null;
};

function missingTable(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  return err.code === "42P01" || /Could not find the table/i.test(err.message || "");
}

/** The show's own seats and sections, via its enabled layout. */
async function loadRoom(admin: ReturnType<typeof createAdminClient>, eventId: string) {
  const { data: map } = await admin
    .from("event_layout_maps")
    .select("layout_id")
    .eq("event_id", eventId)
    .eq("enabled", true)
    .maybeSingle();
  if (!map?.layout_id) return null;

  const { data: sections } = await admin
    .from("sections")
    .select("id, name, seating_mode, sells_as_table, type")
    .eq("layout_id", map.layout_id);

  const ids = (sections ?? []).map((s: { id: string }) => s.id);
  if (!ids.length) return { sections: [] as SectionRow[], seats: [] as SeatRow[] };

  // Paged: a room can hold more than PostgREST's 1,000-row default, and a
  // half-loaded room would silently refuse marks on the seats it never saw.
  const seats: SeatRow[] = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await admin
      .from("seats")
      .select("id, status, section_id, object_id")
      .in("section_id", ids)
      .range(from, from + 999);
    const batch = (data ?? []) as SeatRow[];
    seats.push(...batch);
    if (batch.length < 1000) break;
  }
  return { sections: (sections ?? []) as SectionRow[], seats };
}

// GET /api/admin/events/:eventId/seat-marks
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireCapability("holds");
  if (!guard.ok) return guard.response;

  const { id: eventId } = await params;
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("event_seat_marks")
    .select("seat_id, mark, note, created_by, created_at")
    .eq("event_id", eventId);

  if (missingTable(error)) {
    return NextResponse.json({ migrated: false, marks: [], counts: countMarks([]) });
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const marks = data ?? [];
  const { data: prices } = await admin
    .from("event_section_prices")
    .select("section_id, price_cents, seat_price_cents")
    .eq("event_id", eventId);

  return NextResponse.json({
    migrated: true,
    marks,
    counts: countMarks(marks),
    prices: prices ?? [],
  });
}

// POST /api/admin/events/:eventId/seat-marks — { seatId, mark } or { seatIds, mark }
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireCapability("holds", { write: true });
  if (!guard.ok) return guard.response;

  const { id: eventId } = await params;
  const admin = createAdminClient();
  const body = await request.json().catch(() => ({}));

  const mark = body.mark as SeatMark;
  if (!(SEAT_MARKS as readonly string[]).includes(mark)) {
    return NextResponse.json({ error: "Unknown mark." }, { status: 400 });
  }

  const clickedId = typeof body.seatId === "string" ? body.seatId : null;
  if (!clickedId) return NextResponse.json({ error: "seatId is required." }, { status: 400 });

  // Whose seat is this? Same guard the checkout paths use — a seat id from
  // another show must not become a hold on this one.
  const owned = await assertSeatsBelongToEvent(admin, eventId, [clickedId]);
  if (!owned.ok) return NextResponse.json({ error: owned.error }, { status: 409 });

  const room = await loadRoom(admin, eventId);
  if (!room) return NextResponse.json({ error: "This show has no seat map." }, { status: 409 });

  const clicked = room.seats.find((s) => s.id === clickedId);
  if (!clicked) return NextResponse.json({ error: "That seat is not in this room." }, { status: 404 });

  const section = room.sections.find((s) => s.id === clicked.section_id) ?? null;

  // The rules, applied server-side. lib/seating/showMarks.ts decides; this
  // only reports what it decided.
  const toMarkable = (s: SeatRow): MarkableSeat =>
    ({ id: s.id, status: s.status, sectionId: s.section_id, objectId: s.object_id });
  const decision = seatsForMark(
    toMarkable(clicked),
    section as MarkableSection | null,
    room.seats.map(toMarkable),
  );
  if (!decision.ok) {
    return NextResponse.json({ error: decision.reason }, { status: 409 });
  }

  const by = await actorName(guard.actor);
  const rows = decision.seatIds.map((seat_id) => ({
    event_id: eventId,
    seat_id,
    mark,
    created_by: by,
  }));

  // Painting over an existing mark replaces it — one mark per seat per show.
  const { error } = await admin
    .from("event_seat_marks")
    .upsert(rows, { onConflict: "event_id,seat_id" });

  if (missingTable(error)) {
    return NextResponse.json(
      { error: "Run plans/show-seat-marks-migration.sql before holding seats." },
      { status: 409 },
    );
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ marked: decision.seatIds, mark });
}

// DELETE /api/admin/events/:eventId/seat-marks — release, ?seatId= (its table too)
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireCapability("holds", { write: true });
  if (!guard.ok) return guard.response;

  const { id: eventId } = await params;
  const admin = createAdminClient();
  const seatId = new URL(request.url).searchParams.get("seatId");
  if (!seatId) return NextResponse.json({ error: "seatId is required." }, { status: 400 });

  const room = await loadRoom(admin, eventId);
  const clicked = room?.seats.find((s) => s.id === seatId);
  const section = room?.sections.find((s) => s.id === clicked?.section_id);

  // Release follows the same whole-table rule as the hold, or half a table
  // comes back on sale and the rest stays held for nobody.
  let ids = [seatId];
  if (clicked && section?.sells_as_table && clicked.object_id) {
    ids = room!.seats.filter((s) => s.object_id === clicked.object_id).map((s) => s.id);
  }

  const { error } = await admin
    .from("event_seat_marks")
    .delete()
    .eq("event_id", eventId)
    .in("seat_id", ids);

  if (error && !missingTable(error)) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ released: ids });
}

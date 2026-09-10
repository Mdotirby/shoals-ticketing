import { createAdminClient } from "@/lib/supabase-server";
import { requireCapability } from "@/lib/auth/can";
import { NextResponse } from "next/server";

// GET: fetch guest list (bypasses RLS)
// Params: event_id (required), artist_id (optional — if omitted, returns all guests for event)
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const eventId = searchParams.get("event_id");
  const artistId = searchParams.get("artist_id");

  if (!eventId) {
    return NextResponse.json({ error: "event_id is required" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Tolerates the check-in columns not existing yet
  // (plans/guest-list-checkin-migration.sql is hand-run like every migration
  // here). Without them the list still loads and the door just cannot mark
  // anyone in — the same shape /api/events/[id]/holds uses for its own
  // pending table.
  const build = (cols: string) => {
    let q = admin.from("guest_list").select(cols).eq("event_id", eventId).order("created_at");
    if (artistId) q = q.eq("artist_id", artistId);
    return q;
  };

  let { data, error } = await build(
    "id, first_name, last_name, quantity, notes, artist_id, checked_in_at"
  );

  if (error && /checked_in_at|column .* does not exist/i.test(error.message)) {
    const fallback = await build("id, first_name, last_name, quantity, notes, artist_id");
    data = fallback.data;
    error = fallback.error;
  }

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data || []);
}

/**
 * PATCH: check a guest in at the door, or undo it.
 *
 * Body: { id, checked_in: boolean }
 *
 * Gated on `door_sales_comps` — the same capability that lets someone sell at
 * the door and issue comps, which is exactly who is standing at the list.
 * Marking someone in is not a read.
 */
export async function PATCH(request: Request) {
  const guard = await requireCapability("door_sales_comps", { write: true });
  if (!guard.ok) return guard.response;

  const body = await request.json();
  const { id, checked_in } = body as { id?: string; checked_in?: boolean };

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("guest_list")
    .update({
      checked_in_at: checked_in === false ? null : new Date().toISOString(),
      checked_in_by: checked_in === false ? null : guard.actor.id,
    })
    .eq("id", id)
    .select("id, first_name, last_name, quantity, checked_in_at")
    .single();

  if (error) {
    if (/checked_in_at|column .* does not exist/i.test(error.message)) {
      return NextResponse.json(
        { error: "Guest check-in isn't set up yet — run plans/guest-list-checkin-migration.sql first." },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

// POST: add a guest (bypasses RLS)
export async function POST(request: Request) {
  const body = await request.json();
  const { event_id, artist_id, first_name, last_name, quantity } = body;

  if (!event_id || !artist_id || !first_name || !last_name) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("guest_list")
    .insert({
      event_id,
      artist_id,
      first_name: first_name.trim(),
      last_name: last_name.trim(),
      quantity: quantity || 1,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}

// DELETE: remove a guest (bypasses RLS)
export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("guest_list")
    .delete()
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ deleted: true });
}

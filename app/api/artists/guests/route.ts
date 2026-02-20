import { createAdminClient } from "@/lib/supabase-server";
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
  let query = admin
    .from("guest_list")
    .select("id, first_name, last_name, quantity, artist_id")
    .eq("event_id", eventId)
    .order("created_at");

  if (artistId) {
    query = query.eq("artist_id", artistId);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data || []);
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

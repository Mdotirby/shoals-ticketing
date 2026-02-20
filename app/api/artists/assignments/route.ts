import { createAdminClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";

// GET: fetch artist assignments (bypasses RLS using service role)
// Query params: artist_id (required)
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const artistId = searchParams.get("artist_id");

  if (!artistId) {
    return NextResponse.json({ error: "artist_id is required" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Fetch assignments with event details
  const { data: assignments, error } = await admin
    .from("artist_event_assignments")
    .select("event_id, comp_limit")
    .eq("artist_id", artistId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!assignments || assignments.length === 0) {
    return NextResponse.json([]);
  }

  // Fetch event details for each assignment
  const eventIds = assignments.map((a: { event_id: string }) => a.event_id);
  const { data: events } = await admin
    .from("events")
    .select("id, title, date, venue")
    .in("id", eventIds);

  // Combine assignments with event data
  const result = assignments.map((a: { event_id: string; comp_limit: number }) => {
    const ev = events?.find((e: { id: string }) => e.id === a.event_id);
    return {
      event_id: a.event_id,
      comp_limit: a.comp_limit,
      events: ev || { id: a.event_id, title: "Unknown", date: "", venue: "" },
    };
  });

  return NextResponse.json(result);
}

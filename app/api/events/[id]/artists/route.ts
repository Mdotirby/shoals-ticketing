import { createAdminClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";

// GET: list featured artists assigned to an event
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const admin = createAdminClient();

  // Fetch assignments for this event
  const { data: assignments, error: assignError } = await admin
    .from("artist_event_assignments")
    .select("artist_id")
    .eq("event_id", id);

  if (assignError || !assignments || assignments.length === 0) {
    return NextResponse.json([]);
  }

  const artistIds = assignments.map((a: { artist_id: string }) => a.artist_id);

  // Fetch artist details
  const { data: artists, error: artistError } = await admin
    .from("admin_users")
    .select("id, first_name, last_name, avatar_url")
    .in("id", artistIds);

  if (artistError || !artists) {
    return NextResponse.json([]);
  }

  const result = artists.map((a: { id: string; first_name: string | null; last_name: string | null; avatar_url: string | null }) => ({
    id: a.id,
    name: [a.first_name, a.last_name].filter(Boolean).join(" ") || "Artist",
    avatar_url: a.avatar_url || null,
  }));

  return NextResponse.json(result);
}

import { createAdminClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";

// GET: list orders with optional filters
// ?event_id= &venue_id= &from= &to=
export async function GET(request: Request) {
  const admin = createAdminClient();
  const { searchParams } = new URL(request.url);
  const eventId = searchParams.get("event_id");
  const venueId = searchParams.get("venue_id");

  let query = admin
    .from("orders")
    .select("*, events!inner(title, venue, venue_id)")
    .order("created_at", { ascending: false })
    .limit(2000);

  if (eventId) {
    query = query.eq("event_id", eventId);
  }

  if (venueId) {
    query = query.eq("events.venue_id", venueId);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}

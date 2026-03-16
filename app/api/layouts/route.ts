import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/** GET /api/layouts?venue_id=xxx — list layouts for a venue */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const venueId = searchParams.get("venue_id");

  let query = admin
    .from("venue_layouts")
    .select("*")
    .order("created_at", { ascending: false });

  if (venueId) query = query.eq("venue_id", venueId);

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data || []);
}

/** POST /api/layouts — create a new layout */
export async function POST(request: Request) {
  const body = await request.json();
  const { name, venue_id } = body;

  const { data, error } = await admin
    .from("venue_layouts")
    .insert({
      name: name || "Untitled Layout",
      venue_id: venue_id || null,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

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
  const { name, venue_id, room_width_ft, room_height_ft, scale_pixels_per_foot } = body;

  const { data, error } = await admin
    .from("venue_layouts")
    .insert({
      name: name || "Untitled Layout",
      venue_id: venue_id || null,
      room_width_ft: room_width_ft || 100,
      room_height_ft: room_height_ft || 60,
      scale_pixels_per_foot: scale_pixels_per_foot || 10,
      canvas_width: (room_width_ft || 100) * (scale_pixels_per_foot || 10),
      canvas_height: (room_height_ft || 60) * (scale_pixels_per_foot || 10),
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

/** GET /api/seating/layouts?venue_id=xxx */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const venueId = searchParams.get("venue_id");
  let q = admin.from("venue_layouts").select("*").order("created_at", { ascending: false });
  if (venueId) q = q.eq("venue_id", venueId);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data || []);
}

/** POST /api/seating/layouts */
export async function POST(req: Request) {
  const body = await req.json();
  const { data, error } = await admin.from("venue_layouts").insert({
    name: body.name || "Untitled Layout",
    venue_id: body.venue_id || null,
    room_width_ft: body.room_width_ft || 100,
    room_height_ft: body.room_height_ft || 60,
  }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

/** GET /api/seating/events/[eventId]/map */
export async function GET(_req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const { data } = await admin.from("event_layout_maps").select("*").eq("event_id", eventId).single();
  return NextResponse.json(data || { enabled: false });
}

/** POST /api/seating/events/[eventId]/map — assign layout to event */
export async function POST(req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const body = await req.json();

  // Delete existing map
  await admin.from("event_layout_maps").delete().eq("event_id", eventId);

  if (!body.layout_id) {
    return NextResponse.json({ success: true, removed: true });
  }

  const { data, error } = await admin.from("event_layout_maps").insert({
    event_id: eventId,
    layout_id: body.layout_id,
    enabled: body.enabled !== false,
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

/** DELETE /api/seating/events/[eventId]/map */
export async function DELETE(_req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  await admin.from("event_layout_maps").delete().eq("event_id", eventId);
  return NextResponse.json({ success: true });
}

import { createAdminClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";

/**
 * GET /api/seating/events/[eventId]/map — get the seating map for an event
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const { eventId } = await params;
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("event_seating_maps")
    .select("*")
    .eq("event_id", eventId)
    .single();

  if (error || !data) {
    return NextResponse.json({ reserved_seating_enabled: false }, { status: 200 });
  }

  return NextResponse.json(data);
}

/**
 * POST /api/seating/events/[eventId]/map — create or update seating map link
 * Body: { chart_id, reserved_seating_enabled }
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const { eventId } = await params;
  const admin = createAdminClient();
  const body = await request.json();

  const { chart_id, reserved_seating_enabled } = body;

  if (!chart_id) {
    return NextResponse.json({ error: "chart_id is required" }, { status: 400 });
  }

  // Upsert: delete existing map for this event, then insert new one
  await admin.from("event_seating_maps").delete().eq("event_id", eventId);

  const { data, error } = await admin
    .from("event_seating_maps")
    .insert({
      event_id: eventId,
      chart_id,
      reserved_seating_enabled: reserved_seating_enabled ?? false,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}

/**
 * DELETE /api/seating/events/[eventId]/map — remove seating map from event
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const { eventId } = await params;
  const admin = createAdminClient();

  await admin.from("event_seating_maps").delete().eq("event_id", eventId);

  return NextResponse.json({ success: true });
}

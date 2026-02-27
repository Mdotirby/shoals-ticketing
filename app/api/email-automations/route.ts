import { createAdminClient } from "@/lib/supabase-server";
import { NextRequest, NextResponse } from "next/server";

// GET /api/email-automations?venue_id=xxx
export async function GET(req: NextRequest) {
  const venueId = req.nextUrl.searchParams.get("venue_id");
  const admin = createAdminClient();

  let query = admin
    .from("automated_email_rules")
    .select("*, email_templates(name, subject, category), events(title, date)")
    .order("created_at", { ascending: false });

  if (venueId) query = query.eq("venue_id", venueId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

// POST /api/email-automations — Create a rule
export async function POST(req: NextRequest) {
  const body = await req.json();
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("automated_email_rules")
    .insert({
      venue_id: body.venue_id || null,
      template_id: body.template_id,
      trigger_type: body.trigger_type,
      days_offset: body.days_offset || 1,
      send_time: body.send_time || "10:00",
      is_active: body.is_active ?? true,
      applies_to: body.event_id ? "specific_event" : "all_events",
      event_id: body.event_id || null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// PUT /api/email-automations — Toggle active state
export async function PUT(req: NextRequest) {
  const body = await req.json();
  const admin = createAdminClient();

  if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const updates: Record<string, unknown> = {};
  if (typeof body.is_active === "boolean") updates.is_active = body.is_active;
  if (body.days_offset !== undefined) updates.days_offset = body.days_offset;
  if (body.send_time) updates.send_time = body.send_time;

  const { data, error } = await admin
    .from("automated_email_rules")
    .update(updates)
    .eq("id", body.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// DELETE /api/email-automations?id=xxx
export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const admin = createAdminClient();
  const { error } = await admin.from("automated_email_rules").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ deleted: true });
}

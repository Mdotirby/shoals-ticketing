import { createAdminClient } from "@/lib/supabase-server";
import { NextRequest, NextResponse } from "next/server";

// GET /api/email-campaigns?venue_id=xxx
export async function GET(req: NextRequest) {
  const venueId = req.nextUrl.searchParams.get("venue_id");
  const admin = createAdminClient();

  let query = admin
    .from("email_campaigns")
    .select("*, email_templates(name, subject), events(title, date)")
    .order("created_at", { ascending: false });

  if (venueId) query = query.eq("venue_id", venueId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

// POST /api/email-campaigns — Create a campaign
export async function POST(req: NextRequest) {
  const body = await req.json();
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("email_campaigns")
    .insert({
      venue_id: body.venue_id || null,
      template_id: body.template_id || null,
      name: body.name,
      subject_override: body.subject_override || null,
      event_id: body.event_id || null,
      audience_type: body.audience_type || "event_buyers",
      audience_filter: body.audience_filter || null,
      status: body.scheduled_at ? "scheduled" : "draft",
      scheduled_at: body.scheduled_at || null,
      created_by: body.created_by || null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

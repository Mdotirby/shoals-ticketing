import { createAdminClient } from "@/lib/supabase-server";
import { NextRequest, NextResponse } from "next/server";

// GET /api/marketing/social — Fetch all social metrics
export async function GET() {
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("social_metrics")
    .select("*, events(title, date)")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}

// POST /api/marketing/social — Create a social metric entry
export async function POST(req: NextRequest) {
  const body = await req.json();
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("social_metrics")
    .insert({
      event_id: body.event_id || null,
      venue_id: body.venue_id || null,
      platform: body.platform,
      hashtag: body.hashtag || null,
      impressions: body.impressions || 0,
      engagements: body.engagements || 0,
      shares: body.shares || 0,
      mentions: body.mentions || 0,
      recorded_date: body.recorded_date || new Date().toISOString().split("T")[0],
      notes: body.notes || null,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

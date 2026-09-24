import { createAdminClient } from "@/lib/supabase-server";
import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth/can";

// GET /api/marketing/ad-spend — Fetch all ad campaigns
export async function GET() {
  // Was unauthenticated — what a venue spends on advertising is nobody's
  // business but theirs.
  const guard = await requireStaff();
  if (!guard.ok) return guard.response;

  const admin = createAdminClient();

  const { data, error } = await admin
    .from("ad_campaigns")
    .select("*, events(title, date)")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}

// POST /api/marketing/ad-spend — Create a new ad campaign
export async function POST(req: NextRequest) {
  const body = await req.json();
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("ad_campaigns")
    .insert({
      venue_id: body.venue_id || null,
      event_id: body.event_id || null,
      platform: body.platform,
      campaign_name: body.campaign_name || null,
      spend: body.spend || 0,
      impressions: body.impressions || 0,
      clicks: body.clicks || 0,
      start_date: body.start_date || null,
      end_date: body.end_date || null,
      notes: body.notes || null,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

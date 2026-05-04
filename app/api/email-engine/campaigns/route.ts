import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-server";
import { createCampaign } from "@/modules/email-engine";

// GET /api/email-engine/campaigns?venue_id=xxx
export async function GET(req: NextRequest) {
  const venue_id = req.nextUrl.searchParams.get("venue_id");
  const admin = createAdminClient();
  let q = admin
    .from("ee_campaigns")
    .select("*, ee_segments(name), events(title, date), ee_campaign_metrics(recipients,delivered,open_rate,click_rate,conversion_rate,revenue)")
    .order("updated_at", { ascending: false });
  if (venue_id) q = q.eq("venue_id", venue_id);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

// POST /api/email-engine/campaigns
export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!body.name || !body.subject || !body.content_html) {
    return NextResponse.json({ error: "name, subject, content_html required" }, { status: 400 });
  }
  try {
    const campaign = await createCampaign(createAdminClient(), {
      venue_id: body.venue_id || null,
      segment_id: body.segment_id || null,
      event_id: body.event_id || null,
      name: body.name,
      subject: body.subject,
      preview_text: body.preview_text || null,
      from_name: body.from_name || null,
      from_email: body.from_email || null,
      reply_to: body.reply_to || null,
      content_html: body.content_html,
      content_text: body.content_text || null,
      template_key: body.template_key || null,
      body_json: body.body_json ?? null,
      scheduled_at: body.scheduled_at || null,
      created_by: body.created_by || null,
    });
    return NextResponse.json(campaign);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

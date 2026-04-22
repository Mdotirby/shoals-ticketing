import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-server";
import { scheduleCampaign } from "@/modules/email-engine";

// POST /api/email-engine/campaigns/[id]/schedule  body: { scheduled_at: ISO }
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json();
  if (!body?.scheduled_at) {
    return NextResponse.json({ error: "scheduled_at required" }, { status: 400 });
  }
  try {
    await scheduleCampaign(createAdminClient(), id, body.scheduled_at);
    return NextResponse.json({ scheduled: true, scheduled_at: body.scheduled_at });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

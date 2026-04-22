import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-server";
import { sendCampaignNow } from "@/modules/email-engine";

// POST /api/email-engine/campaigns/[id]/send
// Enqueues the campaign for dispatch; cron drains the queue.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const res = await sendCampaignNow(createAdminClient(), id);
    return NextResponse.json(res);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

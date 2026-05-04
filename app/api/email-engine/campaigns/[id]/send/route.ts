import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-server";
import {
  sendCampaignNow,
  processQueue,
  finalizeCampaignIfDrained,
  EMAIL_ENGINE,
} from "@/modules/email-engine";

// POST /api/email-engine/campaigns/[id]/send
// Enqueues the campaign and immediately drains the dispatch queue
// so emails go out in the same request — no cron required.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const admin = createAdminClient();
  try {
    // 1. Build the dispatch queue (renders per-recipient, flips to 'sending')
    const enqueueResult = await sendCampaignNow(admin, id);

    // 2. Drain the queue — actually calls Resend for each recipient
    const dispatchResult = await processQueue(admin, {
      limit: EMAIL_ENGINE.DISPATCH_BATCH_SIZE,
    });

    // 3. If the queue is now empty, mark the campaign as sent
    await finalizeCampaignIfDrained(admin, id);

    return NextResponse.json({ ...enqueueResult, ...dispatchResult });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

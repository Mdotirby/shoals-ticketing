import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-server";
import {
  sendCampaignNow,
  processQueue,
  finalizeCampaignIfDrained,
  EMAIL_ENGINE,
} from "@/modules/email-engine";

export const runtime = "nodejs";
export const maxDuration = 300; // 5 minutes — needed for large lists with pacing delays

// POST /api/email-engine/campaigns/[id]/send
// Enqueues the campaign then drains the dispatch queue in a loop until
// all emails are sent — no cron required.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const admin = createAdminClient();
  try {
    // 1. Build the dispatch queue (renders per-recipient, flips to 'sending')
    const enqueueResult = await sendCampaignNow(admin, id);

    // 2. Loop until the queue is fully drained for this send.
    //    Each batch is DISPATCH_BATCH_SIZE (100) emails. Cap at 50 iterations
    //    (5,000 recipients) to stay within maxDuration.
    let totalSent = 0;
    let totalFailed = 0;
    let totalRetried = 0;
    for (let i = 0; i < 50; i++) {
      const batch = await processQueue(admin, {
        limit: EMAIL_ENGINE.DISPATCH_BATCH_SIZE,
      });
      totalSent += batch.sent;
      totalFailed += batch.failed;
      totalRetried += batch.retried;
      if (batch.attempted === 0) break; // queue empty — done
    }

    // 3. Mark the campaign as sent
    await finalizeCampaignIfDrained(admin, id);

    return NextResponse.json({
      ...enqueueResult,
      sent: totalSent,
      failed: totalFailed,
      retried: totalRetried,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

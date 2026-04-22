import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-server";
import {
  enqueueCampaign,
  processQueue,
  finalizeCampaignIfDrained,
  EMAIL_ENGINE,
} from "@/modules/email-engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/cron/email-engine/process-scheduled
 *
 *   1. Promotes any 'scheduled' campaigns whose scheduled_at has passed
 *      into the dispatch queue via enqueueCampaign().
 *   2. Drains up to DISPATCH_BATCH_SIZE queue rows through Resend.
 *   3. Finalises any campaign whose queue is now empty.
 *
 * Recommended schedule: every minute.
 */
export async function GET(req: NextRequest) {
  if (!authorizeCron(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const admin = createAdminClient();
  const nowIso = new Date().toISOString();

  // 1. Promote due-scheduled campaigns
  const { data: due } = await admin
    .from("ee_campaigns")
    .select("id")
    .eq("status", "scheduled")
    .lte("scheduled_at", nowIso)
    .limit(25);
  let promoted = 0;
  for (const c of (due ?? []) as { id: string }[]) {
    try {
      await enqueueCampaign(admin, c.id);
      promoted++;
    } catch (e) {
      console.error(`[EE cron] promote ${c.id} failed`, e);
      await admin.from("ee_campaigns").update({ status: "failed" }).eq("id", c.id);
    }
  }

  // 2. Drain queue
  const result = await processQueue(admin, { limit: EMAIL_ENGINE.DISPATCH_BATCH_SIZE });

  // 3. Finalise drained campaigns
  const { data: sending } = await admin
    .from("ee_campaigns")
    .select("id")
    .eq("status", "sending")
    .limit(50);
  let finalized = 0;
  for (const c of (sending ?? []) as { id: string }[]) {
    if (await finalizeCampaignIfDrained(admin, c.id)) finalized++;
  }

  return NextResponse.json({ ok: true, promoted, finalized, ...result });
}

function authorizeCron(req: NextRequest): boolean {
  const header = req.headers.get("authorization");
  const expected = process.env.CRON_SECRET;
  if (!expected) return true;
  return header === `Bearer ${expected}`;
}

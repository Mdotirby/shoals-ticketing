import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-server";
import { evaluateAllCampaigns } from "@/modules/email-engine";
import { authorizeCron } from "@/modules/email-engine/lib/cronAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/cron/email-engine/evaluate-optimizations
 * Applies the rule-based optimization layer to recently-sent campaigns.
 * Recommended schedule: hourly.
 */
export async function GET(req: NextRequest) {
  if (!authorizeCron(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const res = await evaluateAllCampaigns(createAdminClient());
    return NextResponse.json({ ok: true, ...res });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}

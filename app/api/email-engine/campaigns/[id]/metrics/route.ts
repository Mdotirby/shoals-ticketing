import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-server";
import { recomputeForCampaign } from "@/modules/email-engine";

/**
 * GET  /api/email-engine/campaigns/[id]/metrics   — fetch the rollup row
 * POST /api/email-engine/campaigns/[id]/metrics   — force recompute, then return
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const admin = createAdminClient();
  const [{ data: metrics }, { data: flags }] = await Promise.all([
    admin.from("ee_campaign_metrics").select("*").eq("campaign_id", id).maybeSingle(),
    admin.from("ee_optimization_flags").select("*").eq("campaign_id", id)
      .is("resolved_at", null).order("severity", { ascending: false }),
  ]);
  return NextResponse.json({ metrics: metrics ?? null, flags: flags ?? [] });
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const admin = createAdminClient();
  try {
    await recomputeForCampaign(admin, id);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
  const { data: metrics } = await admin
    .from("ee_campaign_metrics").select("*").eq("campaign_id", id).maybeSingle();
  return NextResponse.json({ metrics });
}

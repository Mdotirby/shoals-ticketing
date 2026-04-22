import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-server";
import { AD_ENGINE } from "@/modules/ad-engine";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const { eventId } = await params;
  const db = createAdminClient();
  const { data } = await db
    .from("ad_engine_budget_caps")
    .select("*")
    .eq("event_id", eventId)
    .maybeSingle();
  return NextResponse.json(data ?? null);
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const { eventId } = await params;
  const body = (await req.json()) as {
    daily_cap_total?: number;
    campaign_cap_total?: number;
    scaling_step_pct?: number;
  };
  const db = createAdminClient();
  const { data, error } = await db
    .from("ad_engine_budget_caps")
    .upsert(
      {
        event_id: eventId,
        daily_cap_total: Number(body.daily_cap_total ?? AD_ENGINE.DEFAULT_DAILY_CAP),
        campaign_cap_total: Number(body.campaign_cap_total ?? AD_ENGINE.DEFAULT_TOTAL_CAP),
        scaling_step_pct: Number(body.scaling_step_pct ?? AD_ENGINE.DEFAULT_SCALING_STEP_PCT),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "event_id" }
    )
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}

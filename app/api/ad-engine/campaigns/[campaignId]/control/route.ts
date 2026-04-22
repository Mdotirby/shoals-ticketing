/**
 * Manual campaign control: pause / resume / update_budget.
 * Always respects budget hard walls. Logs a decision record.
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-server";
import { getAdapter, checkBudgetWalls, logDecision } from "@/modules/ad-engine";
import type { Campaign } from "@/modules/ad-engine";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ campaignId: string }> }
) {
  const { campaignId } = await params;
  const body = (await req.json()) as {
    action: "pause" | "resume" | "update_budget";
    new_daily_budget?: number;
    note?: string;
  };
  const db = createAdminClient();

  const { data: row } = await db
    .from("ad_engine_campaigns")
    .select("*, identity:ad_engine_identities(access_token,external_id)")
    .eq("id", campaignId)
    .maybeSingle();
  if (!row) return NextResponse.json({ error: "campaign not found" }, { status: 404 });
  const camp = row as Campaign & {
    identity?: { access_token: string | null; external_id: string } | null;
  };

  const adapter = getAdapter(camp.platform);
  const token = camp.identity?.access_token ?? "";

  if (body.action === "pause") {
    if (camp.external_campaign_id && adapter.configured) {
      try {
        await adapter.pauseCampaign(camp.external_campaign_id, token);
      } catch (e) {
        return NextResponse.json({ error: (e as Error).message }, { status: 500 });
      }
    }
    await db
      .from("ad_engine_campaigns")
      .update({ status: "paused", paused_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", campaignId);
    await logDecision({
      campaign_id: campaignId,
      event_id: camp.event_id,
      decision_type: "pause_creative",
      confidence: "high",
      outcome: "executed",
      reason: body.note ?? "manual pause",
      proposed_delta: null,
      metrics_snapshot: null,
      mode: camp.mode,
    });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "resume") {
    if (camp.external_campaign_id && adapter.configured) {
      try {
        await adapter.resumeCampaign(camp.external_campaign_id, token);
      } catch (e) {
        return NextResponse.json({ error: (e as Error).message }, { status: 500 });
      }
    }
    await db
      .from("ad_engine_campaigns")
      .update({ status: "active", updated_at: new Date().toISOString() })
      .eq("id", campaignId);
    await logDecision({
      campaign_id: campaignId,
      event_id: camp.event_id,
      decision_type: "resume_creative",
      confidence: "high",
      outcome: "executed",
      reason: body.note ?? "manual resume",
      proposed_delta: null,
      metrics_snapshot: null,
      mode: camp.mode,
    });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "update_budget") {
    const newBudget = Number(body.new_daily_budget);
    if (!Number.isFinite(newBudget) || newBudget < 0) {
      return NextResponse.json({ error: "new_daily_budget required" }, { status: 400 });
    }
    const wall = await checkBudgetWalls(camp, newBudget);
    if (!wall.ok) return NextResponse.json({ error: `hard wall: ${wall.reason}` }, { status: 400 });
    if (camp.external_campaign_id && adapter.configured) {
      try {
        await adapter.updateBudget(camp.external_campaign_id, token, newBudget);
      } catch (e) {
        return NextResponse.json({ error: (e as Error).message }, { status: 500 });
      }
    }
    await db
      .from("ad_engine_campaigns")
      .update({
        current_daily_budget: newBudget,
        daily_budget_cap: Math.max(newBudget, camp.daily_budget_cap),
        updated_at: new Date().toISOString(),
      })
      .eq("id", campaignId);
    await logDecision({
      campaign_id: campaignId,
      event_id: camp.event_id,
      decision_type: newBudget > camp.current_daily_budget ? "scale_up" : "scale_down",
      confidence: "high",
      outcome: "executed",
      reason: body.note ?? "manual budget update",
      proposed_delta: { daily_budget_from: camp.current_daily_budget, daily_budget_to: newBudget },
      metrics_snapshot: null,
      mode: camp.mode,
    });
    return NextResponse.json({ ok: true, new_daily_budget: newBudget });
  }

  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}

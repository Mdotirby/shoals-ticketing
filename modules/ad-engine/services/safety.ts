/**
 * Safety Layer — guardrails shared by every optimization decision.
 *
 * Every public helper is pure-ish (reads DB, no side-effects except
 * into ad_engine_decision_log when explicitly asked).
 */
import { createAdminClient } from "@/lib/supabase-server";
import { AD_ENGINE } from "../constants";
import type { Campaign, Confidence, DecisionOutcome } from "../types";

/* ──────────────────────────────────────────────────────────── */
/*  Human overrides (freeze / disable / lock_budget)             */
/* ──────────────────────────────────────────────────────────── */

export async function getActiveOverrides(opts: {
  event_id?: string;
  campaign_id?: string;
}) {
  const db = createAdminClient();
  const now = new Date().toISOString();
  let q = db.from("ad_engine_overrides").select("*").eq("active", true);
  q = q.or(`expires_at.is.null,expires_at.gt.${now}`);
  if (opts.event_id) q = q.eq("event_id", opts.event_id);
  if (opts.campaign_id) q = q.eq("campaign_id", opts.campaign_id);
  const { data } = await q;
  return (data ?? []) as Array<{
    id: string;
    kind: "freeze_campaign" | "disable_optimization" | "lock_budget";
    event_id: string | null;
    campaign_id: string | null;
  }>;
}

/* ──────────────────────────────────────────────────────────── */
/*  Metrics freshness                                            */
/* ──────────────────────────────────────────────────────────── */

export async function getMetricsAgeHours(campaign_id: string): Promise<number | null> {
  const db = createAdminClient();
  const { data } = await db
    .from("ad_engine_daily_metrics")
    .select("synced_at")
    .eq("campaign_id", campaign_id)
    .order("synced_at", { ascending: false })
    .limit(1);
  const row = (data ?? [])[0] as { synced_at?: string } | undefined;
  if (!row?.synced_at) return null;
  return (Date.now() - new Date(row.synced_at).getTime()) / 3_600_000;
}

/* ──────────────────────────────────────────────────────────── */
/*  Cooldowns                                                    */
/* ──────────────────────────────────────────────────────────── */

export async function hoursSinceLaunch(campaign_id: string): Promise<number | null> {
  const db = createAdminClient();
  const { data } = await db
    .from("ad_engine_campaigns")
    .select("launched_at")
    .eq("id", campaign_id)
    .maybeSingle();
  const t = (data as { launched_at?: string } | null)?.launched_at;
  if (!t) return null;
  return (Date.now() - new Date(t).getTime()) / 3_600_000;
}

export async function hasRecentBudgetAdjustment(
  campaign_id: string,
  withinHours = AD_ENGINE.BUDGET_ADJ_COOLDOWN_HOURS
): Promise<boolean> {
  const db = createAdminClient();
  const cutoff = new Date(Date.now() - withinHours * 3_600_000).toISOString();
  const { data } = await db
    .from("ad_engine_decision_log")
    .select("id")
    .eq("campaign_id", campaign_id)
    .in("decision_type", ["scale_up", "scale_down"])
    .eq("outcome", "executed")
    .gte("created_at", cutoff)
    .limit(1);
  return (data ?? []).length > 0;
}

/* ──────────────────────────────────────────────────────────── */
/*  Confidence scoring                                           */
/* ──────────────────────────────────────────────────────────── */

export function scoreConfidence(metrics: {
  impressions: number;
  clicks: number;
}): Confidence {
  if (
    metrics.impressions >= AD_ENGINE.SAMPLE.HIGH_MIN_IMPRESSIONS &&
    metrics.clicks >= AD_ENGINE.SAMPLE.HIGH_MIN_CLICKS
  ) {
    return "high";
  }
  if (
    metrics.impressions >= AD_ENGINE.SAMPLE.MED_MIN_IMPRESSIONS &&
    metrics.clicks >= AD_ENGINE.SAMPLE.MED_MIN_CLICKS
  ) {
    return "medium";
  }
  return "low";
}

/* ──────────────────────────────────────────────────────────── */
/*  Budget hard walls                                            */
/* ──────────────────────────────────────────────────────────── */

export async function checkBudgetWalls(
  campaign: Pick<
    Campaign,
    "id" | "event_id" | "daily_budget_cap" | "total_budget_cap" | "current_total_spend"
  >,
  proposedNewDailyBudget: number
): Promise<{ ok: boolean; reason?: string }> {
  const db = createAdminClient();
  const { data: capRow } = await db
    .from("ad_engine_budget_caps")
    .select("*")
    .eq("event_id", campaign.event_id)
    .maybeSingle();
  if (!capRow) return { ok: false, reason: "no event-level cap row" };
  const cap = capRow as {
    daily_cap_total: number;
    campaign_cap_total: number;
    scaling_step_pct: number;
  };

  // Hard wall: never exceed event-level daily cap across all campaigns
  const { data: sibs } = await db
    .from("ad_engine_campaigns")
    .select("id,current_daily_budget,daily_budget_cap,status")
    .eq("event_id", campaign.event_id)
    .in("status", ["active", "paused", "pending_validation"]);

  const siblingsSum = ((sibs ?? []) as Array<{
    id: string;
    current_daily_budget: number;
  }>).reduce((s, r) => s + (r.id === campaign.id ? 0 : Number(r.current_daily_budget || 0)), 0);

  if (siblingsSum + proposedNewDailyBudget > cap.daily_cap_total) {
    return {
      ok: false,
      reason: `daily hard wall: ${siblingsSum + proposedNewDailyBudget} > ${cap.daily_cap_total}`,
    };
  }
  if (campaign.current_total_spend > cap.campaign_cap_total) {
    return {
      ok: false,
      reason: `campaign total cap reached: ${campaign.current_total_spend} > ${cap.campaign_cap_total}`,
    };
  }
  return { ok: true };
}

/* ──────────────────────────────────────────────────────────── */
/*  Decision log writer                                          */
/* ──────────────────────────────────────────────────────────── */

export async function logDecision(entry: {
  campaign_id: string | null;
  event_id: string | null;
  decision_type:
    | "scale_up"
    | "scale_down"
    | "pause_creative"
    | "resume_creative"
    | "rebalance"
    | "no_op";
  confidence: Confidence;
  outcome: DecisionOutcome;
  reason: string;
  proposed_delta: Record<string, unknown> | null;
  metrics_snapshot: Record<string, unknown> | null;
  mode: string | null;
}) {
  const db = createAdminClient();
  await db.from("ad_engine_decision_log").insert(entry);
}

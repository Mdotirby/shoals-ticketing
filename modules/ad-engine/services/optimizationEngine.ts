/**
 * Optimization Engine — deterministic rules, safety-first.
 *
 * Two modes:
 *   • EFFICIENCY — ROAS focused (scale when ROAS ≥ threshold).
 *   • VOLUME     — Ticket velocity focused (scale when CTR ≥ threshold).
 *
 * Every decision passes through the FAIL-SAFE pipeline (in order):
 *   1. Human overrides (freeze / disable_optimization / lock_budget)
 *   2. Metrics freshness gate (> 12h → log-only)
 *   3. Launch cooldown (< 6h → log-only; < 12h → block HIGH risk)
 *   4. Budget adjustment cooldown (1/24h)
 *   5. Confidence scoring (low → no action; medium → log only; high → execute)
 *   6. Budget hard walls (event-level daily + total caps)
 *   7. Scale step caps (never exceed MAX_SCALE_UP/DOWN per step)
 *   8. If any conflict → NO ACTION (priority: data safety > optimization)
 */
import { createAdminClient } from "@/lib/supabase-server";
import { AD_ENGINE } from "../constants";
import { getAdapter } from "../integrations";
import type { Campaign, CampaignMode, DailyMetric, DecisionOutcome } from "../types";
import {
  checkBudgetWalls,
  getActiveOverrides,
  getMetricsAgeHours,
  hasRecentBudgetAdjustment,
  hoursSinceLaunch,
  logDecision,
  scoreConfidence,
} from "./safety";

export type OptimizationRunResult = {
  campaignsEvaluated: number;
  decisionsExecuted: number;
  decisionsLoggedOnly: number;
  decisionsBlocked: number;
  errors: Array<{ campaign_id: string; error: string }>;
  ranAt: string;
};

type Snapshot = {
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  revenue: number;
  ctr: number;
  cpc: number;
  cpm: number;
  roas: number;
};

function rollupRecent(rows: DailyMetric[], days = 3): Snapshot {
  const cutoff = new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);
  const recent = rows.filter((r) => r.date >= cutoff);
  const agg: Snapshot = {
    spend: 0,
    impressions: 0,
    clicks: 0,
    conversions: 0,
    revenue: 0,
    ctr: 0,
    cpc: 0,
    cpm: 0,
    roas: 0,
  };
  for (const r of recent) {
    agg.spend += Number(r.spend || 0);
    agg.impressions += Number(r.impressions || 0);
    agg.clicks += Number(r.clicks || 0);
    agg.conversions += Number(r.conversions || 0);
    agg.revenue += Number(r.revenue || 0);
  }
  agg.ctr = agg.impressions > 0 ? agg.clicks / agg.impressions : 0;
  agg.cpc = agg.clicks > 0 ? agg.spend / agg.clicks : 0;
  agg.cpm = agg.impressions > 0 ? agg.spend / (agg.impressions / 1000) : 0;
  agg.roas = agg.spend > 0 ? agg.revenue / agg.spend : 0;
  return agg;
}

type Proposal =
  | { kind: "scale_up"; delta_pct: number }
  | { kind: "scale_down"; delta_pct: number }
  | { kind: "no_op"; reason: string };

function proposeEfficiency(s: Snapshot): Proposal {
  const { MIN_ROAS_TO_SCALE, MAX_CPC_TO_SCALE, ROAS_FLOOR_TO_PAUSE } = AD_ENGINE.EFFICIENCY;
  if (s.spend < 25) return { kind: "no_op", reason: "insufficient spend to judge" };
  if (s.roas >= MIN_ROAS_TO_SCALE && (s.cpc <= MAX_CPC_TO_SCALE || s.cpc === 0)) {
    return { kind: "scale_up", delta_pct: AD_ENGINE.DEFAULT_SCALING_STEP_PCT };
  }
  if (s.roas < ROAS_FLOOR_TO_PAUSE) {
    return { kind: "scale_down", delta_pct: AD_ENGINE.DEFAULT_SCALING_STEP_PCT };
  }
  return { kind: "no_op", reason: "within acceptable ROAS band" };
}

function proposeVolume(s: Snapshot): Proposal {
  const { MIN_CTR_TO_SCALE, MAX_CPM_TO_SCALE, CTR_FLOOR_TO_PAUSE } = AD_ENGINE.VOLUME;
  if (s.impressions < 1000) return { kind: "no_op", reason: "insufficient impressions" };
  if (s.ctr >= MIN_CTR_TO_SCALE && (s.cpm <= MAX_CPM_TO_SCALE || s.cpm === 0)) {
    return { kind: "scale_up", delta_pct: AD_ENGINE.DEFAULT_SCALING_STEP_PCT };
  }
  if (s.ctr < CTR_FLOOR_TO_PAUSE) {
    return { kind: "scale_down", delta_pct: AD_ENGINE.DEFAULT_SCALING_STEP_PCT };
  }
  return { kind: "no_op", reason: "within acceptable CTR band" };
}

function propose(mode: CampaignMode, s: Snapshot): Proposal {
  if (mode === "volume") return proposeVolume(s);
  if (mode === "efficiency") return proposeEfficiency(s);
  return { kind: "no_op", reason: "manual mode — no auto decisions" };
}

function clampDelta(kind: "scale_up" | "scale_down", pct: number): number {
  const cap = kind === "scale_up" ? AD_ENGINE.MAX_SCALE_UP_STEP_PCT : AD_ENGINE.MAX_SCALE_DOWN_STEP_PCT;
  return Math.min(Math.max(pct, 0), cap);
}

/* ──────────────────────────────────────────────────────────── */
/*  Main evaluator — pure decision for one campaign              */
/* ──────────────────────────────────────────────────────────── */

export type CampaignDecision = {
  campaign_id: string;
  outcome: DecisionOutcome;
  decision_type: "scale_up" | "scale_down" | "no_op";
  confidence: "high" | "medium" | "low";
  new_daily_budget: number | null;
  reason: string;
  snapshot: Snapshot;
};

export async function evaluateCampaign(campaign: Campaign): Promise<CampaignDecision> {
  const db = createAdminClient();

  // (A) overrides
  const overrides = await getActiveOverrides({
    event_id: campaign.event_id,
    campaign_id: campaign.id,
  });
  const frozen = overrides.some((o) => o.kind === "freeze_campaign");
  const optDisabled = overrides.some((o) => o.kind === "disable_optimization");
  const budgetLocked = overrides.some((o) => o.kind === "lock_budget") || campaign.budget_locked;

  if (frozen || optDisabled) {
    return {
      campaign_id: campaign.id,
      outcome: "blocked",
      decision_type: "no_op",
      confidence: "low",
      new_daily_budget: null,
      reason: frozen ? "campaign frozen by operator" : "optimization disabled by operator",
      snapshot: { spend: 0, impressions: 0, clicks: 0, conversions: 0, revenue: 0, ctr: 0, cpc: 0, cpm: 0, roas: 0 },
    };
  }

  // (B) freshness gate
  const age = await getMetricsAgeHours(campaign.id);
  const stale = age === null || age > AD_ENGINE.METRICS_MAX_AGE_HOURS;

  // (C) snapshot from aggregated daily table
  const { data: metricsRows } = await db
    .from("ad_engine_daily_metrics")
    .select("*")
    .eq("campaign_id", campaign.id)
    .order("date", { ascending: false })
    .limit(14);
  const snapshot = rollupRecent((metricsRows ?? []) as DailyMetric[]);

  // (D) propose
  const proposal = propose(campaign.mode, snapshot);
  const confidence = scoreConfidence({ impressions: snapshot.impressions, clicks: snapshot.clicks });

  // no-op short circuit
  if (proposal.kind === "no_op") {
    return {
      campaign_id: campaign.id,
      outcome: "logged_only",
      decision_type: "no_op",
      confidence,
      new_daily_budget: null,
      reason: proposal.reason,
      snapshot,
    };
  }

  // (E) cooldown checks
  const hrsSinceLaunch = await hoursSinceLaunch(campaign.id);
  if (hrsSinceLaunch !== null && hrsSinceLaunch < AD_ENGINE.LAUNCH_COOLDOWN_HOURS) {
    return {
      campaign_id: campaign.id,
      outcome: "logged_only",
      decision_type: proposal.kind,
      confidence,
      new_daily_budget: null,
      reason: `launch cooldown (${hrsSinceLaunch.toFixed(1)}h < ${AD_ENGINE.LAUNCH_COOLDOWN_HOURS}h)`,
      snapshot,
    };
  }
  const busy = await hasRecentBudgetAdjustment(campaign.id);
  if (busy) {
    return {
      campaign_id: campaign.id,
      outcome: "logged_only",
      decision_type: proposal.kind,
      confidence,
      new_daily_budget: null,
      reason: `budget adjustment cooldown (≤${AD_ENGINE.BUDGET_ADJ_COOLDOWN_HOURS}h)`,
      snapshot,
    };
  }

  // (F) stale metrics → log-only
  if (stale) {
    return {
      campaign_id: campaign.id,
      outcome: "logged_only",
      decision_type: proposal.kind,
      confidence,
      new_daily_budget: null,
      reason: `metrics stale (${age?.toFixed(1) ?? "∞"}h > ${AD_ENGINE.METRICS_MAX_AGE_HOURS}h)`,
      snapshot,
    };
  }

  // (G) confidence gating
  if (confidence === "low") {
    return {
      campaign_id: campaign.id,
      outcome: "blocked",
      decision_type: proposal.kind,
      confidence,
      new_daily_budget: null,
      reason: "low confidence — insufficient sample",
      snapshot,
    };
  }
  if (confidence === "medium") {
    return {
      campaign_id: campaign.id,
      outcome: "logged_only",
      decision_type: proposal.kind,
      confidence,
      new_daily_budget: null,
      reason: "medium confidence — log only per spec",
      snapshot,
    };
  }

  // (H) budget locked
  if (budgetLocked) {
    return {
      campaign_id: campaign.id,
      outcome: "blocked",
      decision_type: proposal.kind,
      confidence,
      new_daily_budget: null,
      reason: "budget locked by operator",
      snapshot,
    };
  }

  // (I) compute proposed budget (clamped)
  const cappedDelta = clampDelta(proposal.kind, proposal.delta_pct);
  const currentBudget = Number(campaign.current_daily_budget || 0);
  const newBudget =
    proposal.kind === "scale_up"
      ? currentBudget * (1 + cappedDelta)
      : currentBudget * (1 - cappedDelta);

  // (J) hard-wall check
  const wall = await checkBudgetWalls(campaign, newBudget);
  if (!wall.ok) {
    return {
      campaign_id: campaign.id,
      outcome: "blocked",
      decision_type: proposal.kind,
      confidence,
      new_daily_budget: null,
      reason: `hard wall: ${wall.reason}`,
      snapshot,
    };
  }

  // (K) execute
  return {
    campaign_id: campaign.id,
    outcome: "executed",
    decision_type: proposal.kind,
    confidence,
    new_daily_budget: Math.round(newBudget * 100) / 100,
    reason: proposal.kind === "scale_up" ? "ROAS/CTR above scale floor" : "below pause floor",
    snapshot,
  };
}

/* ──────────────────────────────────────────────────────────── */
/*  Executor (cron entry point)                                  */
/* ──────────────────────────────────────────────────────────── */

export async function runOptimizationJob(): Promise<OptimizationRunResult> {
  const db = createAdminClient();
  const errors: OptimizationRunResult["errors"] = [];
  let executed = 0;
  let loggedOnly = 0;
  let blocked = 0;
  let evaluated = 0;

  const { data: camps } = await db
    .from("ad_engine_campaigns")
    .select("*, identity:ad_engine_identities(access_token,external_id)")
    .eq("status", "active")
    .neq("mode", "manual");

  for (const row of (camps ?? []) as Array<
    Campaign & { identity?: { access_token: string | null; external_id: string } | null }
  >) {
    evaluated += 1;
    try {
      const decision = await evaluateCampaign(row);

      await logDecision({
        campaign_id: decision.campaign_id,
        event_id: row.event_id,
        decision_type: decision.decision_type,
        confidence: decision.confidence,
        outcome: decision.outcome,
        reason: decision.reason,
        proposed_delta:
          decision.new_daily_budget !== null
            ? {
                daily_budget_from: row.current_daily_budget,
                daily_budget_to: decision.new_daily_budget,
              }
            : null,
        metrics_snapshot: decision.snapshot as unknown as Record<string, unknown>,
        mode: row.mode,
      });

      if (decision.outcome === "executed" && decision.new_daily_budget !== null) {
        const adapter = getAdapter(row.platform);
        if (adapter.configured && row.external_campaign_id) {
          try {
            await adapter.updateBudget(
              row.external_campaign_id,
              row.identity?.access_token ?? "",
              decision.new_daily_budget
            );
          } catch (e) {
            // Platform push failed — revert to logged-only state
            await logDecision({
              campaign_id: row.id,
              event_id: row.event_id,
              decision_type: "no_op",
              confidence: "low",
              outcome: "blocked",
              reason: `adapter.updateBudget failed: ${(e as Error).message}`,
              proposed_delta: null,
              metrics_snapshot: null,
              mode: row.mode,
            });
            blocked += 1;
            continue;
          }
        }
        await db
          .from("ad_engine_campaigns")
          .update({
            current_daily_budget: decision.new_daily_budget,
            updated_at: new Date().toISOString(),
          })
          .eq("id", row.id);
        executed += 1;
      } else if (decision.outcome === "blocked") {
        blocked += 1;
      } else {
        loggedOnly += 1;
      }
    } catch (e) {
      errors.push({ campaign_id: row.id, error: (e as Error).message });
    }
  }

  return {
    campaignsEvaluated: evaluated,
    decisionsExecuted: executed,
    decisionsLoggedOnly: loggedOnly,
    decisionsBlocked: blocked,
    errors,
    ranAt: new Date().toISOString(),
  };
}

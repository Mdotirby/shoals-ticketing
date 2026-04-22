/**
 * Email Engine — optimization layer.
 *
 * Pure rule-based (no AI). Reads ee_campaign_metrics and writes
 * ee_optimization_flags + ee_campaigns.performance_tier.
 *
 * Rules (see EMAIL_ENGINE.THRESHOLDS in constants.ts):
 *   • Low open rate              → suggest subject-line tweaks
 *   • Low click rate             → flag content / CTA
 *   • High conversion rate       → mark as high_performer
 *   • Low conversion             → flag for follow-up nurture
 *   • High bounce/complaint rate → critical — suspend sender reputation
 *
 * Suggestion pools are static arrays — deterministic, no model calls.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { EMAIL_ENGINE } from "../constants";
import type { EeOptimizationFlag, EeOptimizationFlagKind } from "../types";

const SUBJECT_SUGGESTIONS = [
  "Lead with a question — drive curiosity",
  "Add scarcity: quantity remaining, countdown, or 'last chance'",
  "Drop the brand name — start with the value/hook",
  "Include the recipient's first name — '{{first_name}}, ...'",
  "Try a shorter subject (< 42 chars) for mobile preview",
  "Mention a specific artist, genre, or date",
  "Use one emoji at most — test 0 vs 1 emoji",
];

const CONTENT_SUGGESTIONS = [
  "Move the primary CTA above the fold",
  "Make the CTA a button, not a text link",
  "Reduce copy to one hook + one CTA",
  "Add a short preview text (preheader) summarizing value",
  "Include a hero image that's crop-safe for mobile (600x400)",
  "Cut secondary links — focus attention on the ticket CTA",
  "Remove jargon — aim for 6th-grade reading level",
];

const CONVERSION_SUGGESTIONS = [
  "Offer a promo code for urgency",
  "Add an 'Only N tickets left' scarcity line",
  "Include social proof — venue or artist reviews",
  "Re-send to non-openers with a different subject 48h later",
  "Add event details (date, time, address) in the first paragraph",
];

// ────────────────────────────────────────────────────────────────────
//  Public entry point
// ────────────────────────────────────────────────────────────────────

export type OptimizeResult = {
  campaigns_evaluated: number;
  flags_created: number;
  performance_tier_assigned: number;
};

export async function evaluateAllCampaigns(
  client: SupabaseClient,
): Promise<OptimizeResult> {
  // Only evaluate campaigns that finished sending in the last 30 days AND
  // have computed metrics — otherwise we'd flag empty rollups as low.
  const cutoff = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const { data: campaigns } = await client
    .from("ee_campaigns")
    .select("id")
    .in("status", ["sent", "paused"])
    .gte("sent_at", cutoff)
    .limit(200);

  let flags = 0;
  let tiers = 0;
  for (const c of (campaigns ?? []) as { id: string }[]) {
    const res = await evaluateCampaign(client, c.id);
    flags += res.flags_created;
    if (res.performance_tier) tiers++;
  }

  return {
    campaigns_evaluated: (campaigns ?? []).length,
    flags_created: flags,
    performance_tier_assigned: tiers,
  };
}

export type CampaignEvaluation = {
  flags_created: number;
  performance_tier: "high_performer" | "normal" | "low_engagement" | "low_conversion" | null;
};

export async function evaluateCampaign(
  client: SupabaseClient,
  campaignId: string,
): Promise<CampaignEvaluation> {
  const { data: m } = await client
    .from("ee_campaign_metrics")
    .select("*")
    .eq("campaign_id", campaignId)
    .maybeSingle();
  if (!m || !m.delivered || m.delivered < 25) {
    // Not enough volume to draw conclusions — leave untouched
    return { flags_created: 0, performance_tier: null };
  }

  const T = EMAIL_ENGINE.THRESHOLDS;
  const flags: Omit<EeOptimizationFlag, "id" | "created_at" | "resolved_at">[] = [];

  // Open-rate rule
  if (m.open_rate !== null && m.open_rate < T.LOW_OPEN_RATE) {
    flags.push({
      campaign_id: campaignId,
      kind: "low_open_rate",
      severity: "warn",
      details: { open_rate: m.open_rate, threshold: T.LOW_OPEN_RATE },
      suggestions: pickSuggestions(SUBJECT_SUGGESTIONS, 3, campaignId),
    });
    flags.push({
      campaign_id: campaignId,
      kind: "suggest_subject",
      severity: "info",
      details: { reason: "open_rate below threshold" },
      suggestions: pickSuggestions(SUBJECT_SUGGESTIONS, 3, campaignId + "-a"),
    });
  }

  // Click-rate rule
  if (m.click_rate !== null && m.click_rate < T.LOW_CLICK_RATE) {
    flags.push({
      campaign_id: campaignId,
      kind: "low_click_rate",
      severity: "warn",
      details: { click_rate: m.click_rate, threshold: T.LOW_CLICK_RATE },
      suggestions: pickSuggestions(CONTENT_SUGGESTIONS, 3, campaignId + "-c"),
    });
    flags.push({
      campaign_id: campaignId,
      kind: "suggest_content",
      severity: "info",
      details: { reason: "click_rate below threshold" },
      suggestions: pickSuggestions(CONTENT_SUGGESTIONS, 3, campaignId + "-c2"),
    });
  }

  // Conversion rule (both sides)
  if (m.conversion_rate !== null && m.conversion_rate >= T.HIGH_CONVERSION_RATE) {
    flags.push({
      campaign_id: campaignId,
      kind: "high_performer",
      severity: "info",
      details: {
        conversion_rate: m.conversion_rate,
        revenue_per_email: m.revenue_per_email,
      },
      suggestions: [
        "Clone this campaign and run against adjacent segments",
        "Re-use the subject line structure for similar events",
        "Export as custom audience seed for Ad Engine",
      ],
    });
  } else if (m.conversion_rate !== null && m.conversion_rate < T.LOW_CONVERSION_RATE && m.click_rate && m.click_rate >= T.LOW_CLICK_RATE) {
    // People clicked but didn't buy — content/landing problem
    flags.push({
      campaign_id: campaignId,
      kind: "low_conversion",
      severity: "warn",
      details: {
        conversion_rate: m.conversion_rate,
        click_rate: m.click_rate,
        reason: "clicks healthy but conversions below threshold",
      },
      suggestions: pickSuggestions(CONVERSION_SUGGESTIONS, 3, campaignId + "-x"),
    });
  }

  // Deliverability rules
  const bounceRate = m.delivered ? (Number(m.bounces || 0) / m.delivered) : 0;
  if (bounceRate > T.HIGH_BOUNCE_RATE) {
    flags.push({
      campaign_id: campaignId,
      kind: "high_bounce",
      severity: "critical",
      details: { bounce_rate: bounceRate, bounces: m.bounces, delivered: m.delivered },
      suggestions: [
        "Rebuild the segment — prune contacts older than 12 months",
        "Run list hygiene: remove role-based addresses (info@, admin@)",
        "Consider a re-engagement campaign before broadcasting again",
      ],
    });
  }
  const complaintRate = m.delivered ? (Number(m.complaints || 0) / m.delivered) : 0;
  if (complaintRate > T.HIGH_COMPLAINT_RATE) {
    flags.push({
      campaign_id: campaignId,
      kind: "suppression_spike",
      severity: "critical",
      details: { complaint_rate: complaintRate, complaints: m.complaints },
      suggestions: [
        "Pause all sending to this segment for 72h",
        "Confirm double opt-in for all new additions",
        "Check that the unsubscribe footer renders correctly",
      ],
    });
  }

  // Write flags — we wipe unresolved flags for this campaign first so runs
  // idempotent rather than piling up duplicates across reruns.
  await client
    .from("ee_optimization_flags")
    .delete()
    .is("resolved_at", null)
    .eq("campaign_id", campaignId);
  if (flags.length > 0) {
    const { error } = await client.from("ee_optimization_flags").insert(flags);
    if (error) console.warn("[EmailEngine] flag insert failed", error.message);
  }

  // Assign performance tier
  let tier: CampaignEvaluation["performance_tier"] = "normal";
  if (flags.some((f) => f.kind === "high_performer")) tier = "high_performer";
  else if (flags.some((f) => f.kind === "low_open_rate" || f.kind === "low_click_rate")) tier = "low_engagement";
  else if (flags.some((f) => f.kind === "low_conversion")) tier = "low_conversion";

  await client
    .from("ee_campaigns")
    .update({ performance_tier: tier, flags: flags.map((f) => f.kind) })
    .eq("id", campaignId);

  return { flags_created: flags.length, performance_tier: tier };
}

// ────────────────────────────────────────────────────────────────────
//  Helpers
// ────────────────────────────────────────────────────────────────────

/**
 * Deterministic pick of N suggestions — we hash the seed to choose stable
 * suggestions per campaign so the UI shows the same thing every render.
 */
function pickSuggestions(pool: string[], n: number, seed: string): string[] {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const ordered = pool
    .map((s, i) => ({ s, rank: ((h >>> (i % 8)) ^ i) >>> 0 }))
    .sort((a, b) => a.rank - b.rank)
    .map((x) => x.s);
  return ordered.slice(0, Math.min(n, pool.length));
}

// Keep the kind type exported for UI consumers
export type { EeOptimizationFlagKind };

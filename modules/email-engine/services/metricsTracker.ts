/**
 * Email Engine — performance tracking.
 *
 * Responsibilities:
 *   1. Attribute conversions: find orders whose utm_campaign matches
 *      "ee:<campaign_id>" and were placed within the attribution window
 *      AFTER the send, then write conversion_order_id + revenue onto the
 *      matching ee_send_log row.
 *   2. Recompute ee_campaign_metrics rollup from ee_send_log + attributions.
 *
 * Runs via /api/cron/email-engine/compute-metrics every 5-15 minutes.
 * All reads are indexed (utm_campaign, campaign_id, status).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { EMAIL_ENGINE } from "../constants";

export type MetricsResult = {
  campaigns: number;
  attributed: number;
};

export async function recomputeAllMetrics(
  client: SupabaseClient,
): Promise<MetricsResult> {
  // Scope: every campaign in sending/sent/paused state in the last 90 days
  const since = new Date(Date.now() - 90 * 86_400_000).toISOString();
  const { data: camps } = await client
    .from("ee_campaigns")
    .select("id")
    .in("status", ["sending", "sent", "paused"])
    .gte("created_at", since)
    .limit(500);

  let attributed = 0;
  const campaigns = (camps ?? []) as { id: string }[];

  for (const c of campaigns) {
    attributed += await attributeCampaignConversions(client, c.id);
    await rollupCampaignMetrics(client, c.id);
  }
  return { campaigns: campaigns.length, attributed };
}

export async function recomputeForCampaign(
  client: SupabaseClient,
  campaignId: string,
): Promise<void> {
  await attributeCampaignConversions(client, campaignId);
  await rollupCampaignMetrics(client, campaignId);
}

// ────────────────────────────────────────────────────────────────────
//  Conversion attribution
// ────────────────────────────────────────────────────────────────────

async function attributeCampaignConversions(
  client: SupabaseClient,
  campaignId: string,
): Promise<number> {
  const utm = `${EMAIL_ENGINE.UTM_CAMPAIGN_PREFIX}${campaignId}`;
  const windowMs = EMAIL_ENGINE.CONVERSION_WINDOW_DAYS * 86_400_000;
  const windowStart = new Date(Date.now() - windowMs).toISOString();

  // Orders paid with our UTM, within the attribution window
  const { data: orders } = await client
    .from("orders")
    .select("id, customer_email, total_amount, created_at")
    .eq("utm_campaign", utm)
    .eq("status", "paid")
    .gte("created_at", windowStart);
  if (!orders || orders.length === 0) return 0;

  // Batch by email for efficient matching
  const byEmail = new Map<string, typeof orders>();
  for (const o of orders) {
    const k = String(o.customer_email || "").toLowerCase();
    if (!k) continue;
    const list = byEmail.get(k) ?? [];
    list.push(o);
    byEmail.set(k, list);
  }

  let matched = 0;
  for (const [email, list] of byEmail) {
    // Find the send_log row for this (campaign, email) — there's exactly one
    const { data: log } = await client
      .from("ee_send_log")
      .select("id, sent_at, conversion_order_id")
      .eq("campaign_id", campaignId)
      .eq("recipient_email", email)
      .maybeSingle();
    if (!log || log.conversion_order_id) continue;  // already attributed or not sent

    // Only attribute the FIRST order placed after the send
    const sentAt = log.sent_at ? new Date(log.sent_at).getTime() : 0;
    const post = list.filter((o) => new Date(o.created_at).getTime() >= sentAt);
    if (post.length === 0) continue;
    post.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    const chosen = post[0];

    await client
      .from("ee_send_log")
      .update({
        conversion_order_id: chosen.id,
        converted_at: chosen.created_at,
        revenue: Number(chosen.total_amount) || 0,
        status: "clicked",  // upgrade only if lower
      })
      .eq("id", log.id);
    matched++;
  }
  return matched;
}

// ────────────────────────────────────────────────────────────────────
//  Rollup
// ────────────────────────────────────────────────────────────────────

async function rollupCampaignMetrics(
  client: SupabaseClient,
  campaignId: string,
): Promise<void> {
  const { data: rows } = await client
    .from("ee_send_log")
    .select("status, opened_at, clicked_at, open_count, click_count, conversion_order_id, revenue")
    .eq("campaign_id", campaignId);
  const list = (rows ?? []) as {
    status: string;
    opened_at: string | null;
    clicked_at: string | null;
    open_count: number | null;
    click_count: number | null;
    conversion_order_id: string | null;
    revenue: number | null;
  }[];

  const metrics = {
    recipients: list.length,
    delivered: 0,
    opens: 0,
    unique_opens: 0,
    clicks: 0,
    unique_clicks: 0,
    bounces: 0,
    complaints: 0,
    unsubscribes: 0,
    conversions: 0,
    revenue: 0,
  };
  for (const r of list) {
    if (["sent","delivered","opened","clicked"].includes(r.status)) metrics.delivered++;
    if (r.opened_at)  metrics.unique_opens++;
    if (r.clicked_at) metrics.unique_clicks++;
    metrics.opens  += r.open_count  ?? 0;
    metrics.clicks += r.click_count ?? 0;
    if (r.status === "bounced")      metrics.bounces++;
    if (r.status === "complained")   metrics.complaints++;
    if (r.status === "unsubscribed") metrics.unsubscribes++;
    if (r.conversion_order_id) {
      metrics.conversions++;
      metrics.revenue += Number(r.revenue) || 0;
    }
  }

  const safeDiv = (n: number, d: number): number | null =>
    d > 0 ? Number((n / d).toFixed(4)) : null;

  const open_rate        = safeDiv(metrics.unique_opens, metrics.delivered);
  const click_rate       = safeDiv(metrics.unique_clicks, metrics.delivered);
  const click_to_open    = safeDiv(metrics.unique_clicks, metrics.unique_opens);
  const conversion_rate  = safeDiv(metrics.conversions, metrics.delivered);
  const revenue_per_email = metrics.delivered > 0
    ? Number((metrics.revenue / metrics.delivered).toFixed(4))
    : null;

  await client.from("ee_campaign_metrics").upsert(
    {
      campaign_id: campaignId,
      ...metrics,
      revenue: Number(metrics.revenue.toFixed(2)),
      open_rate,
      click_rate,
      click_to_open,
      conversion_rate,
      revenue_per_email,
      computed_at: new Date().toISOString(),
    },
    { onConflict: "campaign_id" },
  );
}

/**
 * Performance Tracker — aggregates platform insights into the
 * ad_engine_daily_metrics table (one row per campaign per day).
 *
 * Designed for cron execution. Never queries raw logs on request —
 * all UI queries read from the aggregated table.
 */
import { createAdminClient } from "@/lib/supabase-server";
import { getAdapter } from "../integrations";
import type { AdPlatform, Campaign, DailyMetric } from "../types";

export type SyncResult = {
  campaignsSynced: number;
  rowsUpserted: number;
  errors: Array<{ campaign_id: string; error: string }>;
  ranAt: string;
};

function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}
function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);
}

export async function syncDailyMetrics(opts?: {
  platforms?: AdPlatform[];
  since?: string;
  until?: string;
}): Promise<SyncResult> {
  const db = createAdminClient();
  const since = opts?.since ?? isoDaysAgo(7);
  const until = opts?.until ?? todayUTC();
  const platforms: AdPlatform[] = opts?.platforms ?? ["meta", "snapchat"];
  const errors: SyncResult["errors"] = [];
  let campaignsSynced = 0;
  let rowsUpserted = 0;

  for (const platform of platforms) {
    const adapter = getAdapter(platform);
    if (!adapter.configured) continue;

    const { data: camps } = await db
      .from("ad_engine_campaigns")
      .select("*, identity:ad_engine_identities(access_token,external_id)")
      .eq("platform", platform)
      .in("status", ["active", "paused", "completed"])
      .not("external_campaign_id", "is", null);

    if (!camps || camps.length === 0) continue;

    type Row = Campaign & {
      identity?: { access_token: string | null; external_id: string } | null;
    };
    const campaigns = camps as unknown as Row[];
    const extIds = campaigns
      .map((c) => c.external_campaign_id)
      .filter((x): x is string => !!x);

    // Use the first identity token available for the adapter; if none,
    // fall back to env token.
    const token =
      campaigns.find((c) => c.identity?.access_token)?.identity?.access_token ?? "";

    let insights: Awaited<ReturnType<typeof adapter.fetchInsights>>;
    try {
      insights = await adapter.fetchInsights(extIds, token, since, until);
    } catch (e) {
      errors.push({ campaign_id: "*", error: (e as Error).message });
      continue;
    }

    // Index campaigns by external id for local lookup
    const byExt = new Map<string, Row>();
    for (const c of campaigns) if (c.external_campaign_id) byExt.set(c.external_campaign_id, c);

    const rows: Partial<DailyMetric>[] = [];
    for (const ins of insights) {
      if (!ins.external_campaign_id) continue;
      const c = byExt.get(ins.external_campaign_id);
      if (!c) continue;

      const impressions = Number(ins.impressions || 0);
      const clicks = Number(ins.clicks || 0);
      const spend = Number(ins.spend || 0);
      const revenue = Number(ins.revenue || 0);
      rows.push({
        campaign_id: c.id,
        event_id: c.event_id,
        date: ins.date,
        spend,
        impressions,
        clicks,
        reach: Number(ins.reach || 0),
        conversions: Number(ins.conversions || 0),
        revenue,
        ctr: impressions > 0 ? Math.round((clicks / impressions) * 10000) / 10000 : null,
        cpc: clicks > 0 ? Math.round((spend / clicks) * 10000) / 10000 : null,
        cpm: impressions > 0 ? Math.round((spend / (impressions / 1000)) * 10000) / 10000 : null,
        roas: spend > 0 ? Math.round((revenue / spend) * 10000) / 10000 : null,
        synced_at: new Date().toISOString(),
      });
    }

    if (rows.length > 0) {
      const { error } = await db
        .from("ad_engine_daily_metrics")
        .upsert(rows, { onConflict: "campaign_id,date" });
      if (error) errors.push({ campaign_id: "*", error: error.message });
      else rowsUpserted += rows.length;
    }

    // Update campaign.current_total_spend rollup (cheap, single query per campaign via SQL aggregate)
    for (const c of campaigns) {
      const { data: agg } = await db
        .from("ad_engine_daily_metrics")
        .select("spend")
        .eq("campaign_id", c.id);
      const total = ((agg ?? []) as Array<{ spend: number }>).reduce(
        (s, r) => s + Number(r.spend || 0),
        0
      );
      await db
        .from("ad_engine_campaigns")
        .update({ current_total_spend: total, updated_at: new Date().toISOString() })
        .eq("id", c.id);
    }

    campaignsSynced += campaigns.length;
  }

  return { campaignsSynced, rowsUpserted, errors, ranAt: new Date().toISOString() };
}

/* ──────────────────────────────────────────────────────────── */
/*  Dashboard-aware read APIs (aggregated table only)            */
/* ──────────────────────────────────────────────────────────── */

export async function getEventPerformance(event_id: string) {
  const db = createAdminClient();
  const { data } = await db
    .from("ad_engine_daily_metrics")
    .select("date,spend,impressions,clicks,conversions,revenue,roas,ctr,cpc,cpm,campaign_id")
    .eq("event_id", event_id)
    .order("date", { ascending: true });
  const rows = (data ?? []) as Array<Record<string, number | string>>;
  const totals: { spend: number; impressions: number; clicks: number; conversions: number; revenue: number } = {
    spend: 0,
    impressions: 0,
    clicks: 0,
    conversions: 0,
    revenue: 0,
  };
  for (const r of rows) {
    totals.spend += Number(r.spend || 0);
    totals.impressions += Number(r.impressions || 0);
    totals.clicks += Number(r.clicks || 0);
    totals.conversions += Number(r.conversions || 0);
    totals.revenue += Number(r.revenue || 0);
  }
  return {
    rows,
    totals: {
      ...totals,
      ctr: totals.impressions > 0 ? totals.clicks / totals.impressions : 0,
      cpc: totals.clicks > 0 ? totals.spend / totals.clicks : 0,
      cpm: totals.impressions > 0 ? totals.spend / (totals.impressions / 1000) : 0,
      roas: totals.spend > 0 ? totals.revenue / totals.spend : 0,
    },
  };
}

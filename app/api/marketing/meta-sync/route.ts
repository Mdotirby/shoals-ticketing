import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

/* ------------------------------------------------------------------ */
/*  GET — Return current sync status                                   */
/* ------------------------------------------------------------------ */

export async function GET() {
  const token = process.env.META_SYSTEM_TOKEN;
  const adAccountId = process.env.META_AD_ACCOUNT_ID;

  const configured = !!(token && adAccountId);

  // Try to get last sync info from ad_campaigns table
  let lastSync: string | null = null;
  let campaignCount = 0;

  if (configured) {
    try {
      const supabase = createAdminClient();
      const { data } = await supabase
        .from("ad_campaigns")
        .select("updated_at")
        .order("updated_at", { ascending: false })
        .limit(1);

      if (data && data.length > 0) {
        lastSync = (data[0] as Record<string, unknown>).updated_at as string;
      }

      const { count } = await supabase
        .from("ad_campaigns")
        .select("id", { count: "exact", head: true });

      campaignCount = count || 0;
    } catch {
      // ad_campaigns table may not exist yet
    }
  }

  return NextResponse.json({
    configured,
    last_sync: lastSync,
    campaign_count: campaignCount,
    instructions: configured
      ? undefined
      : "Set META_SYSTEM_TOKEN and META_AD_ACCOUNT_ID in Vercel env vars",
  });
}

/* ------------------------------------------------------------------ */
/*  POST — Sync campaigns from Meta Marketing API                      */
/* ------------------------------------------------------------------ */

export async function POST() {
  const token = process.env.META_SYSTEM_TOKEN;
  const adAccountId = process.env.META_AD_ACCOUNT_ID;

  if (!token || !adAccountId) {
    return NextResponse.json(
      {
        error: "Meta API not configured",
        instructions:
          "Set META_SYSTEM_TOKEN and META_AD_ACCOUNT_ID in Vercel env vars",
      },
      { status: 400 }
    );
  }

  try {
    /* ── Fetch campaign insights from Meta ─────────────────── */
    const today = new Date().toISOString().split("T")[0];
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0];

    const timeRange = JSON.stringify({
      since: thirtyDaysAgo,
      until: today,
    });

    const fields = [
      "campaign_id",
      "campaign_name",
      "spend",
      "impressions",
      "clicks",
      "reach",
      "actions",
      "purchase_roas",
    ].join(",");

    const url = new URL(
      `https://graph.facebook.com/v21.0/act_${adAccountId}/insights`
    );
    url.searchParams.set("fields", fields);
    url.searchParams.set("level", "campaign");
    url.searchParams.set("time_range", timeRange);
    url.searchParams.set("time_increment", "1");
    url.searchParams.set("access_token", token);

    const response = await fetch(url.toString());

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      const metaError = (errorBody as Record<string, unknown>)?.error as
        | Record<string, unknown>
        | undefined;

      // Handle common Meta API errors
      if (response.status === 190 || (metaError?.code as number) === 190) {
        return NextResponse.json(
          {
            error: "Meta API token expired",
            details:
              "Your Meta System User token has expired. Generate a new one in Meta Business Manager → System Users.",
          },
          { status: 401 }
        );
      }

      if ((metaError?.code as number) === 10) {
        return NextResponse.json(
          {
            error: "Insufficient permissions",
            details:
              "The Meta System User needs ads_read permission on the ad account.",
          },
          { status: 403 }
        );
      }

      if (response.status === 429 || (metaError?.code as number) === 32) {
        return NextResponse.json(
          {
            error: "Meta API rate limit reached",
            details: "Too many requests. Wait a few minutes and try again.",
          },
          { status: 429 }
        );
      }

      return NextResponse.json(
        {
          error: "Meta API error",
          details: metaError?.message || `HTTP ${response.status}`,
        },
        { status: 502 }
      );
    }

    const metaData = (await response.json()) as {
      data: Array<Record<string, unknown>>;
    };
    const insights = metaData.data || [];

    /* ── Parse & aggregate campaigns ───────────────────────── */
    interface CampaignAgg {
      campaign_id: string;
      campaign_name: string;
      event_id: string | null;
      spend: number;
      impressions: number;
      clicks: number;
      reach: number;
      purchases: number;
      roas: number;
    }

    const campaignMap: Record<string, CampaignAgg> = {};

    for (const row of insights) {
      const cid = row.campaign_id as string;
      const name = (row.campaign_name as string) || "";

      if (!campaignMap[cid]) {
        // Try to extract event ID from campaign name (pattern: VC-{event_id}-{name})
        let eventId: string | null = null;
        const match = name.match(/^VC-([a-f0-9-]+)-/i);
        if (match) {
          eventId = match[1];
        }

        campaignMap[cid] = {
          campaign_id: cid,
          campaign_name: name,
          event_id: eventId,
          spend: 0,
          impressions: 0,
          clicks: 0,
          reach: 0,
          purchases: 0,
          roas: 0,
        };
      }

      const c = campaignMap[cid];
      c.spend += parseFloat((row.spend as string) || "0");
      c.impressions += parseInt((row.impressions as string) || "0", 10);
      c.clicks += parseInt((row.clicks as string) || "0", 10);
      c.reach += parseInt((row.reach as string) || "0", 10);

      // Extract purchases from actions array
      const actions = (row.actions as Array<{ action_type: string; value: string }>) || [];
      for (const action of actions) {
        if (
          action.action_type === "purchase" ||
          action.action_type === "offsite_conversion.fb_pixel_purchase"
        ) {
          c.purchases += parseInt(action.value || "0", 10);
        }
      }

      // ROAS
      const roasArr = (row.purchase_roas as Array<{ value: string }>) || [];
      if (roasArr.length > 0) {
        c.roas = parseFloat(roasArr[0].value || "0");
      }
    }

    const campaigns = Object.values(campaignMap);

    /* ── Upsert into ad_campaigns table ────────────────────── */
    let synced = 0;
    const supabase = createAdminClient();

    try {
      for (const c of campaigns) {
        const { error: upsertError } = await supabase
          .from("ad_campaigns")
          .upsert(
            {
              meta_campaign_id: c.campaign_id,
              campaign_name: c.campaign_name,
              event_id: c.event_id,
              platform: "meta",
              spend: Math.round(c.spend * 100) / 100,
              impressions: c.impressions,
              clicks: c.clicks,
              reach: c.reach,
              purchases: c.purchases,
              roas: Math.round(c.roas * 100) / 100,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "meta_campaign_id" }
          );

        if (!upsertError) synced++;
      }
    } catch {
      console.warn(
        "ad_campaigns table may not exist. Run the marketing migration to create it."
      );
    }

    /* ── Summary ───────────────────────────────────────────── */
    const totalSpend = campaigns.reduce((s, c) => s + c.spend, 0);
    const totalImpressions = campaigns.reduce((s, c) => s + c.impressions, 0);

    return NextResponse.json({
      success: true,
      campaigns_found: campaigns.length,
      campaigns_synced: synced,
      total_spend: Math.round(totalSpend * 100) / 100,
      total_impressions: totalImpressions,
      synced_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error("Meta sync error:", err);
    return NextResponse.json(
      {
        error: "Sync failed",
        details: err instanceof Error ? err.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

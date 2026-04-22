/**
 * Snapchat Marketing API adapter.
 *
 * Env:
 *   SNAP_ACCESS_TOKEN
 *   SNAP_AD_ACCOUNT_ID
 *
 * If env vars are absent the adapter reports `configured=false` and
 * returns deterministic stubs. Per the GLOBAL safety rules, the
 * optimization engine will never take destructive action against a
 * non-configured adapter.
 */
import type {
  PlatformAdapter,
  PlatformCampaignInit,
  PlatformInsights,
} from "./types";

const SNAP_API = "https://adsapi.snapchat.com/v1";

export class SnapchatAdapter implements PlatformAdapter {
  readonly platform = "snapchat" as const;
  readonly configured: boolean;
  private readonly token: string;
  private readonly adAccount: string;

  constructor() {
    this.token = process.env.SNAP_ACCESS_TOKEN ?? "";
    this.adAccount = process.env.SNAP_AD_ACCOUNT_ID ?? "";
    this.configured = Boolean(this.token && this.adAccount);
  }

  async createCampaign(init: PlatformCampaignInit) {
    if (!this.configured) {
      return {
        external_campaign_id: `stub-snap-${init.campaign.id}`,
        external_ad_ids: Object.fromEntries(
          init.creatives.map((c) => [c.id, `stub-ad-${c.id}`])
        ),
      };
    }
    const name = `VC-${init.campaign.event_id}-${init.campaign.name}`.slice(0, 400);
    const res = await fetch(`${SNAP_API}/adaccounts/${this.adAccount}/campaigns`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${init.access_token || this.token}`,
      },
      body: JSON.stringify({
        campaigns: [
          {
            name,
            ad_account_id: this.adAccount,
            status: "PAUSED",
            objective: "WEB_CONVERSION",
            daily_budget_micro: Math.round(init.campaign.daily_budget_cap * 1_000_000),
          },
        ],
      }),
    });
    if (!res.ok) throw new Error(`snap.createCampaign ${res.status}`);
    const body = (await res.json()) as { campaigns?: Array<{ campaign: { id: string } }> };
    const cid = body.campaigns?.[0]?.campaign?.id ?? `unknown-${init.campaign.id}`;
    return {
      external_campaign_id: cid,
      external_ad_ids: Object.fromEntries(init.creatives.map((c) => [c.id, ""])),
    };
  }

  async updateBudget(external_campaign_id: string, access_token: string, new_daily_budget: number) {
    if (!this.configured || external_campaign_id.startsWith("stub-")) return;
    await fetch(`${SNAP_API}/campaigns/${external_campaign_id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${access_token || this.token}`,
      },
      body: JSON.stringify({
        campaigns: [{ id: external_campaign_id, daily_budget_micro: Math.round(new_daily_budget * 1_000_000) }],
      }),
    });
  }

  async pauseCampaign(external_campaign_id: string, access_token: string) {
    if (!this.configured || external_campaign_id.startsWith("stub-")) return;
    await fetch(`${SNAP_API}/campaigns/${external_campaign_id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${access_token || this.token}`,
      },
      body: JSON.stringify({ campaigns: [{ id: external_campaign_id, status: "PAUSED" }] }),
    });
  }

  async resumeCampaign(external_campaign_id: string, access_token: string) {
    if (!this.configured || external_campaign_id.startsWith("stub-")) return;
    await fetch(`${SNAP_API}/campaigns/${external_campaign_id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${access_token || this.token}`,
      },
      body: JSON.stringify({ campaigns: [{ id: external_campaign_id, status: "ACTIVE" }] }),
    });
  }

  async fetchInsights(
    external_campaign_ids: string[],
    access_token: string,
    since: string,
    until: string
  ): Promise<PlatformInsights[]> {
    if (!this.configured) return [];
    const valid = external_campaign_ids.filter((id) => id && !id.startsWith("stub-"));
    if (valid.length === 0) return [];

    const results: PlatformInsights[] = [];
    for (const cid of valid) {
      const url = new URL(`${SNAP_API}/campaigns/${cid}/stats`);
      url.searchParams.set("granularity", "DAY");
      url.searchParams.set("start_time", `${since}T00:00:00Z`);
      url.searchParams.set("end_time", `${until}T23:59:59Z`);
      url.searchParams.set(
        "fields",
        "impressions,swipes,spend,conversion_purchases,conversion_purchases_value"
      );
      const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${access_token || this.token}` },
      });
      if (!res.ok) continue;
      const body = (await res.json()) as {
        timeseries_stats?: Array<{
          timeseries_stat?: { timeseries?: Array<{ start_time: string; stats: Record<string, number> }> };
        }>;
      };
      const ts = body.timeseries_stats?.[0]?.timeseries_stat?.timeseries ?? [];
      for (const row of ts) {
        const s = row.stats ?? {};
        const spendMicro = Number(s.spend ?? 0);
        results.push({
          campaign_id: "",
          external_campaign_id: cid,
          date: row.start_time.slice(0, 10),
          spend: spendMicro / 1_000_000,
          impressions: Number(s.impressions ?? 0),
          clicks: Number(s.swipes ?? 0),
          reach: 0,
          conversions: Number(s.conversion_purchases ?? 0),
          revenue: Number(s.conversion_purchases_value ?? 0),
        });
      }
    }
    return results;
  }
}

export const snapchatAdapter = new SnapchatAdapter();

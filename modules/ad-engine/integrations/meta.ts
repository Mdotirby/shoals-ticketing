/**
 * Meta Marketing API adapter.
 *
 * Uses the same env vars as the legacy marketing/meta-sync route:
 *   META_SYSTEM_TOKEN       — service-user access token
 *   META_AD_ACCOUNT_ID      — without the "act_" prefix
 *
 * Calls are wrapped with error isolation; the optimization engine
 * treats any failure as "unknown" and blocks destructive actions.
 */
import type {
  PlatformAdapter,
  PlatformCampaignInit,
  PlatformInsights,
} from "./types";

const META_API = "https://graph.facebook.com/v21.0";

export class MetaAdapter implements PlatformAdapter {
  readonly platform = "meta" as const;
  readonly configured: boolean;
  private readonly token: string;
  private readonly adAccount: string;

  constructor() {
    this.token = process.env.META_SYSTEM_TOKEN ?? "";
    this.adAccount = process.env.META_AD_ACCOUNT_ID ?? "";
    this.configured = Boolean(this.token && this.adAccount);
  }

  async createCampaign(init: PlatformCampaignInit) {
    if (!this.configured) {
      // Abstracted contract — surface a deterministic stub so the DB layer
      // still persists a record. Caller must check `configured`.
      return {
        external_campaign_id: `stub-meta-${init.campaign.id}`,
        external_ad_ids: Object.fromEntries(
          init.creatives.map((c) => [c.id, `stub-ad-${c.id}`])
        ),
      };
    }
    const name = `VC-${init.campaign.event_id}-${init.campaign.name}`.slice(0, 400);
    const res = await fetch(
      `${META_API}/act_${this.adAccount}/campaigns`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          objective: "OUTCOME_SALES",
          status: "PAUSED",
          special_ad_categories: [],
          access_token: init.access_token || this.token,
          daily_budget: Math.round(init.campaign.daily_budget_cap * 100), // cents
        }),
      }
    );
    if (!res.ok) throw new Error(`meta.createCampaign ${res.status}`);
    const body = (await res.json()) as { id: string };
    // NOTE: ad-set + ad creation intentionally minimal for MVP — handled by
    // downstream workflows; we persist the campaign id + placeholders.
    return {
      external_campaign_id: body.id,
      external_ad_ids: Object.fromEntries(init.creatives.map((c) => [c.id, ""])),
    };
  }

  async updateBudget(external_campaign_id: string, access_token: string, new_daily_budget: number) {
    if (!this.configured || external_campaign_id.startsWith("stub-")) return;
    const res = await fetch(`${META_API}/${external_campaign_id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        daily_budget: Math.round(new_daily_budget * 100),
        access_token: access_token || this.token,
      }),
    });
    if (!res.ok) throw new Error(`meta.updateBudget ${res.status}`);
  }

  async pauseCampaign(external_campaign_id: string, access_token: string) {
    if (!this.configured || external_campaign_id.startsWith("stub-")) return;
    const res = await fetch(`${META_API}/${external_campaign_id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "PAUSED", access_token: access_token || this.token }),
    });
    if (!res.ok) throw new Error(`meta.pauseCampaign ${res.status}`);
  }

  async resumeCampaign(external_campaign_id: string, access_token: string) {
    if (!this.configured || external_campaign_id.startsWith("stub-")) return;
    const res = await fetch(`${META_API}/${external_campaign_id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "ACTIVE", access_token: access_token || this.token }),
    });
    if (!res.ok) throw new Error(`meta.resumeCampaign ${res.status}`);
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

    const url = new URL(`${META_API}/act_${this.adAccount}/insights`);
    url.searchParams.set(
      "fields",
      "campaign_id,spend,impressions,clicks,reach,actions,action_values"
    );
    url.searchParams.set("level", "campaign");
    url.searchParams.set("time_increment", "1");
    url.searchParams.set("time_range", JSON.stringify({ since, until }));
    url.searchParams.set(
      "filtering",
      JSON.stringify([{ field: "campaign.id", operator: "IN", value: valid }])
    );
    url.searchParams.set("access_token", access_token || this.token);

    const res = await fetch(url.toString());
    if (!res.ok) return [];
    const body = (await res.json()) as { data?: Array<Record<string, unknown>> };
    const rows = body.data ?? [];

    return rows.map((r) => {
      const actions = (r.actions as Array<{ action_type: string; value: string }>) ?? [];
      const values = (r.action_values as Array<{ action_type: string; value: string }>) ?? [];
      const purchase = actions.find((a) => a.action_type === "purchase");
      const purchaseVal = values.find((a) => a.action_type === "purchase");
      return {
        campaign_id: "", // caller maps
        external_campaign_id: String(r.campaign_id ?? ""),
        date: String((r as Record<string, unknown>).date_start ?? ""),
        spend: Number(r.spend ?? 0),
        impressions: Number(r.impressions ?? 0),
        clicks: Number(r.clicks ?? 0),
        reach: Number((r as Record<string, unknown>).reach ?? 0),
        conversions: purchase ? Number(purchase.value) : 0,
        revenue: purchaseVal ? Number(purchaseVal.value) : 0,
      } as PlatformInsights;
    });
  }
}

export const metaAdapter = new MetaAdapter();

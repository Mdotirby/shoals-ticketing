/**
 * Abstracted ad-platform adapter contract.
 * Both Meta and Snapchat implementations must satisfy this.
 */
import type { AdPlatform, Campaign, Creative } from "../types";

export type PlatformCampaignInit = {
  campaign: Campaign;
  creatives: Creative[];
  identity_external_id: string;
  access_token: string;
};

export type PlatformInsights = {
  campaign_id: string;            // local id
  external_campaign_id: string | null;
  date: string;                    // YYYY-MM-DD
  spend: number;
  impressions: number;
  clicks: number;
  reach: number;
  conversions: number;
  revenue: number;                 // attributed revenue (platform-reported)
};

export interface PlatformAdapter {
  readonly platform: AdPlatform;
  readonly configured: boolean;

  /** Create the campaign on the external platform. */
  createCampaign(init: PlatformCampaignInit): Promise<{
    external_campaign_id: string;
    external_ad_ids: Record<string, string>;          // creative_id -> external ad id
  }>;

  /** Pause / resume / update daily budget. No hard hits to the wall. */
  updateBudget(
    external_campaign_id: string,
    access_token: string,
    new_daily_budget: number
  ): Promise<void>;

  pauseCampaign(external_campaign_id: string, access_token: string): Promise<void>;
  resumeCampaign(external_campaign_id: string, access_token: string): Promise<void>;

  /** Pull insights for the supplied dates. */
  fetchInsights(
    external_campaign_ids: string[],
    access_token: string,
    since: string,
    until: string
  ): Promise<PlatformInsights[]>;
}

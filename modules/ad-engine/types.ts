/**
 * modules/ad-engine/types.ts — shared module types.
 * No DB writes happen in this file.
 */

export type AdPlatform = "meta" | "snapchat";
export type CampaignMode = "efficiency" | "volume" | "manual";
export type CampaignStatus =
  | "draft"
  | "pending_validation"
  | "active"
  | "paused"
  | "frozen"
  | "completed"
  | "failed";

export type AssetKind = "image" | "video";
export type AssetEnergy = "low" | "medium" | "high";
export type AssetContext =
  | "crowd"
  | "performance"
  | "venue"
  | "promo"
  | "behind_scenes"
  | "other";
export type AssetSource = "in_house" | "artist" | "upload" | "stock";

export type Asset = {
  id: string;
  venue_id: string | null;
  event_id: string | null;
  kind: AssetKind;
  url: string;
  thumbnail_url: string | null;
  file_name: string | null;
  mime_type: string | null;
  file_size: number | null;
  duration_sec: number | null;
  width: number | null;
  height: number | null;
  energy: AssetEnergy;
  context: AssetContext;
  source: AssetSource;
  tags: string[];
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type Hook = {
  id: string;
  venue_id: string | null;
  event_id: string | null;
  text: string;
  style: "urgency" | "fomo" | "social_proof" | "value" | "neutral";
  active: boolean;
  created_at: string;
};

export type CopyVariant = {
  id: string;
  venue_id: string | null;
  event_id: string | null;
  body: string;
  cta: string | null;
  tone: "hype" | "classy" | "casual" | "raw";
  active: boolean;
  created_at: string;
};

export type Creative = {
  id: string;
  event_id: string;
  venue_id: string | null;
  asset_id: string;
  hook_id: string | null;
  copy_variant_id: string | null;
  combo_hash: string;
  status: "draft" | "active" | "paused" | "archived";
  created_at: string;
};

export type Identity = {
  id: string;
  venue_id: string | null;
  kind: "venue" | "artist" | "partner";
  platform: AdPlatform;
  display_name: string;
  external_id: string;
  access_token: string | null;
  active: boolean;
  created_at: string;
};

export type Campaign = {
  id: string;
  event_id: string;
  venue_id: string | null;
  identity_id: string | null;
  platform: AdPlatform;
  external_campaign_id: string | null;
  name: string;
  mode: CampaignMode;
  status: CampaignStatus;
  daily_budget_cap: number;
  total_budget_cap: number;
  current_daily_budget: number;
  current_total_spend: number;
  launched_at: string | null;
  paused_at: string | null;
  optimization_disabled: boolean;
  budget_locked: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type DailyMetric = {
  id: string;
  campaign_id: string;
  event_id: string | null;
  date: string; // YYYY-MM-DD
  spend: number;
  impressions: number;
  clicks: number;
  reach: number;
  conversions: number;
  revenue: number;
  ctr: number | null;
  cpc: number | null;
  cpm: number | null;
  roas: number | null;
  synced_at: string;
};

export type BudgetCap = {
  id: string;
  event_id: string;
  daily_cap_total: number;
  campaign_cap_total: number;
  scaling_step_pct: number;
};

export type DecisionOutcome = "executed" | "logged_only" | "blocked";
export type Confidence = "high" | "medium" | "low";

export type DecisionLog = {
  id: string;
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
  reason: string | null;
  proposed_delta: Record<string, unknown> | null;
  metrics_snapshot: Record<string, unknown> | null;
  mode: string | null;
  created_at: string;
};

export type Override = {
  id: string;
  event_id: string | null;
  campaign_id: string | null;
  kind: "freeze_campaign" | "disable_optimization" | "lock_budget";
  active: boolean;
  note: string | null;
  created_by: string | null;
  created_at: string;
  expires_at: string | null;
};

export type PreLaunchValidation = {
  ready: boolean;
  checks: {
    creatives: { required: 3; have: number; ok: boolean };
    videos: { required: 1; have: number; ok: boolean };
    hooks: { required: 2; have: number; ok: boolean };
    budget_cap_set: { ok: boolean };
    identity_selected: { ok: boolean };
  };
  missing: string[];
};

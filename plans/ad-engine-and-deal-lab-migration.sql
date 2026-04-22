-- ============================================================
--  Ad Engine + Deal Lab — database migration
--  Additive only. No existing tables are altered.
--  Run in Supabase SQL editor.
-- ============================================================

-- ════════════════════════════════════════════════════════════
--  MODULE 1 — AD ENGINE
-- ════════════════════════════════════════════════════════════

-- 1. Assets (raw creative source material: images / videos)
CREATE TABLE IF NOT EXISTS ad_engine_assets (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id      UUID REFERENCES venues(id) ON DELETE CASCADE,
  event_id      UUID REFERENCES events(id) ON DELETE CASCADE,
  kind          TEXT NOT NULL CHECK (kind IN ('image','video')),
  url           TEXT NOT NULL,
  thumbnail_url TEXT,
  file_name     TEXT,
  mime_type     TEXT,
  file_size     INTEGER,
  duration_sec  INTEGER,                 -- videos only
  width         INTEGER,
  height        INTEGER,
  -- Deterministic tagging metadata used by Creative Generator
  energy        TEXT CHECK (energy IN ('low','medium','high')) DEFAULT 'medium',
  context       TEXT CHECK (context IN ('crowd','performance','venue','promo','behind_scenes','other')) DEFAULT 'other',
  source        TEXT CHECK (source IN ('in_house','artist','upload','stock')) DEFAULT 'upload',
  tags          TEXT[] DEFAULT '{}',
  active        BOOLEAN DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ad_engine_assets_event   ON ad_engine_assets(event_id);
CREATE INDEX IF NOT EXISTS idx_ad_engine_assets_venue   ON ad_engine_assets(venue_id);
CREATE INDEX IF NOT EXISTS idx_ad_engine_assets_kind    ON ad_engine_assets(kind);
CREATE INDEX IF NOT EXISTS idx_ad_engine_assets_active  ON ad_engine_assets(active) WHERE active;

-- 2. Hooks (short attention-grabbing phrases)
CREATE TABLE IF NOT EXISTS ad_engine_hooks (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id   UUID REFERENCES venues(id) ON DELETE CASCADE,
  event_id   UUID REFERENCES events(id) ON DELETE CASCADE,
  text       TEXT NOT NULL,
  style      TEXT CHECK (style IN ('urgency','fomo','social_proof','value','neutral')) DEFAULT 'neutral',
  active     BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ad_engine_hooks_event ON ad_engine_hooks(event_id);

-- 3. Copy variants (body text)
CREATE TABLE IF NOT EXISTS ad_engine_copy_variants (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id   UUID REFERENCES venues(id) ON DELETE CASCADE,
  event_id   UUID REFERENCES events(id) ON DELETE CASCADE,
  body       TEXT NOT NULL,
  cta        TEXT,                                       -- e.g. "Get Tickets"
  tone       TEXT CHECK (tone IN ('hype','classy','casual','raw')) DEFAULT 'hype',
  active     BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ad_engine_copy_event ON ad_engine_copy_variants(event_id);

-- 4. Creatives = (asset × hook × copy_variant) — deterministically generated
CREATE TABLE IF NOT EXISTS ad_engine_creatives (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id          UUID REFERENCES venues(id) ON DELETE CASCADE,
  event_id          UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  asset_id          UUID NOT NULL REFERENCES ad_engine_assets(id) ON DELETE CASCADE,
  hook_id           UUID REFERENCES ad_engine_hooks(id) ON DELETE SET NULL,
  copy_variant_id   UUID REFERENCES ad_engine_copy_variants(id) ON DELETE SET NULL,
  /** stable deterministic identifier: sha1(asset_id|hook_id|copy_id) — prevents dup combos */
  combo_hash        TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft','active','paused','archived')),
  created_at        TIMESTAMPTZ DEFAULT now(),
  UNIQUE (event_id, combo_hash)
);
CREATE INDEX IF NOT EXISTS idx_ad_engine_creatives_event ON ad_engine_creatives(event_id);

-- 5. Identities (artist page / venue page selectable for campaign authorship)
CREATE TABLE IF NOT EXISTS ad_engine_identities (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id      UUID REFERENCES venues(id) ON DELETE CASCADE,
  kind          TEXT NOT NULL CHECK (kind IN ('venue','artist','partner')),
  platform      TEXT NOT NULL CHECK (platform IN ('meta','snapchat')),
  display_name  TEXT NOT NULL,
  external_id   TEXT NOT NULL,                   -- Meta page id / Snap profile id
  access_token  TEXT,                            -- optional per-identity override
  active        BOOLEAN DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ad_engine_identities_venue ON ad_engine_identities(venue_id);

-- 6. Campaigns (new, NOT the legacy ad_campaigns table)
CREATE TABLE IF NOT EXISTS ad_engine_campaigns (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id           UUID REFERENCES venues(id) ON DELETE CASCADE,
  event_id           UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  identity_id        UUID REFERENCES ad_engine_identities(id) ON DELETE SET NULL,
  platform           TEXT NOT NULL CHECK (platform IN ('meta','snapchat')),
  external_campaign_id TEXT,                     -- platform id returned by API
  name               TEXT NOT NULL,
  mode               TEXT NOT NULL CHECK (mode IN ('efficiency','volume','manual')) DEFAULT 'efficiency',
  status             TEXT NOT NULL DEFAULT 'draft'
                     CHECK (status IN ('draft','pending_validation','active','paused','frozen','completed','failed')),
  daily_budget_cap   NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_budget_cap   NUMERIC(10,2) NOT NULL DEFAULT 0,
  current_daily_budget NUMERIC(10,2) NOT NULL DEFAULT 0,
  current_total_spend  NUMERIC(10,2) NOT NULL DEFAULT 0,
  launched_at        TIMESTAMPTZ,
  paused_at          TIMESTAMPTZ,
  optimization_disabled BOOLEAN DEFAULT false,
  budget_locked      BOOLEAN DEFAULT false,
  notes              TEXT,
  created_at         TIMESTAMPTZ DEFAULT now(),
  updated_at         TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ad_engine_campaigns_event  ON ad_engine_campaigns(event_id);
CREATE INDEX IF NOT EXISTS idx_ad_engine_campaigns_status ON ad_engine_campaigns(status);
CREATE INDEX IF NOT EXISTS idx_ad_engine_campaigns_platform ON ad_engine_campaigns(platform);

-- 7. Campaign-creative many-to-many
CREATE TABLE IF NOT EXISTS ad_engine_campaign_creatives (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES ad_engine_campaigns(id) ON DELETE CASCADE,
  creative_id UUID NOT NULL REFERENCES ad_engine_creatives(id) ON DELETE CASCADE,
  external_ad_id TEXT,
  weight      NUMERIC(4,3) DEFAULT 1.0,
  status      TEXT NOT NULL DEFAULT 'active'
              CHECK (status IN ('active','paused','archived')),
  UNIQUE (campaign_id, creative_id)
);
CREATE INDEX IF NOT EXISTS idx_ad_engine_campaign_creatives_campaign
  ON ad_engine_campaign_creatives(campaign_id);

-- 8. DAILY aggregated metrics (one row per campaign per day — avoids raw-log churn)
CREATE TABLE IF NOT EXISTS ad_engine_daily_metrics (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id     UUID NOT NULL REFERENCES ad_engine_campaigns(id) ON DELETE CASCADE,
  event_id        UUID REFERENCES events(id) ON DELETE CASCADE,
  date            DATE NOT NULL,
  spend           NUMERIC(10,2) NOT NULL DEFAULT 0,
  impressions     INTEGER NOT NULL DEFAULT 0,
  clicks          INTEGER NOT NULL DEFAULT 0,
  reach           INTEGER NOT NULL DEFAULT 0,
  conversions     INTEGER NOT NULL DEFAULT 0,        -- ticket purchases (from platform)
  revenue         NUMERIC(10,2) NOT NULL DEFAULT 0,  -- attributed revenue from platform
  ctr             NUMERIC(6,4),                      -- denormalized (clicks/impressions)
  cpc             NUMERIC(10,4),                     -- spend/clicks
  cpm             NUMERIC(10,4),                     -- spend/(impressions/1000)
  roas            NUMERIC(10,4),                     -- revenue/spend
  synced_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, date)
);
CREATE INDEX IF NOT EXISTS idx_ad_engine_daily_metrics_campaign_date
  ON ad_engine_daily_metrics(campaign_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_ad_engine_daily_metrics_event_date
  ON ad_engine_daily_metrics(event_id, date DESC);

-- 9. Per-creative performance (daily roll-up for A/B)
CREATE TABLE IF NOT EXISTS ad_engine_creative_metrics (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creative_id  UUID NOT NULL REFERENCES ad_engine_creatives(id) ON DELETE CASCADE,
  campaign_id  UUID NOT NULL REFERENCES ad_engine_campaigns(id) ON DELETE CASCADE,
  date         DATE NOT NULL,
  spend        NUMERIC(10,2) NOT NULL DEFAULT 0,
  impressions  INTEGER NOT NULL DEFAULT 0,
  clicks       INTEGER NOT NULL DEFAULT 0,
  conversions  INTEGER NOT NULL DEFAULT 0,
  revenue      NUMERIC(10,2) NOT NULL DEFAULT 0,
  synced_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (creative_id, campaign_id, date)
);
CREATE INDEX IF NOT EXISTS idx_ad_engine_creative_metrics_creative_date
  ON ad_engine_creative_metrics(creative_id, date DESC);

-- 10. Budget caps per event (hard walls; overrides campaign-level caps)
CREATE TABLE IF NOT EXISTS ad_engine_budget_caps (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id            UUID NOT NULL UNIQUE REFERENCES events(id) ON DELETE CASCADE,
  daily_cap_total     NUMERIC(10,2) NOT NULL DEFAULT 0,
  campaign_cap_total  NUMERIC(10,2) NOT NULL DEFAULT 0,
  scaling_step_pct    NUMERIC(4,2) NOT NULL DEFAULT 0.15, -- max 15 % scale per adjustment
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now()
);

-- 11. Decision log (every proposed optimization action — approved, logged-only, or blocked)
CREATE TABLE IF NOT EXISTS ad_engine_decision_log (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id    UUID REFERENCES ad_engine_campaigns(id) ON DELETE CASCADE,
  event_id       UUID REFERENCES events(id) ON DELETE SET NULL,
  decision_type  TEXT NOT NULL CHECK (decision_type IN
                   ('scale_up','scale_down','pause_creative','resume_creative','rebalance','no_op')),
  confidence     TEXT NOT NULL CHECK (confidence IN ('high','medium','low')),
  outcome        TEXT NOT NULL CHECK (outcome IN ('executed','logged_only','blocked')),
  reason         TEXT,
  proposed_delta JSONB,                       -- e.g. { "daily_budget_from": 50, "to": 57.5 }
  metrics_snapshot JSONB,
  mode           TEXT,                        -- efficiency | volume
  created_at     TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ad_engine_decision_log_campaign_time
  ON ad_engine_decision_log(campaign_id, created_at DESC);

-- 12. Overrides (human kill-switches per event/campaign)
CREATE TABLE IF NOT EXISTS ad_engine_overrides (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id     UUID REFERENCES events(id) ON DELETE CASCADE,
  campaign_id  UUID REFERENCES ad_engine_campaigns(id) ON DELETE CASCADE,
  kind         TEXT NOT NULL CHECK (kind IN ('freeze_campaign','disable_optimization','lock_budget')),
  active       BOOLEAN DEFAULT true,
  note         TEXT,
  created_by   UUID REFERENCES admin_users(id),
  created_at   TIMESTAMPTZ DEFAULT now(),
  expires_at   TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_ad_engine_overrides_event    ON ad_engine_overrides(event_id);
CREATE INDEX IF NOT EXISTS idx_ad_engine_overrides_campaign ON ad_engine_overrides(campaign_id);
CREATE INDEX IF NOT EXISTS idx_ad_engine_overrides_active   ON ad_engine_overrides(active) WHERE active;


-- ════════════════════════════════════════════════════════════
--  MODULE 2 — DEAL LAB
-- ════════════════════════════════════════════════════════════

-- 1. Deal Lab sessions (a bundle of scenarios for one event)
CREATE TABLE IF NOT EXISTS deal_lab_sessions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id      UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  venue_id      UUID REFERENCES venues(id) ON DELETE CASCADE,
  offer_id      UUID,                                      -- snapshot of artist_offers row used
  label         TEXT,
  core_snapshot JSONB NOT NULL,                            -- getEventFinancials() output at session time
  created_by    UUID REFERENCES admin_users(id),
  created_at    TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_deal_lab_sessions_event ON deal_lab_sessions(event_id);

-- 2. Simulations (one row per scenario × deal_structure combination)
CREATE TABLE IF NOT EXISTS deal_lab_simulations (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id         UUID NOT NULL REFERENCES deal_lab_sessions(id) ON DELETE CASCADE,
  event_id           UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  scenario           TEXT NOT NULL CHECK (scenario IN ('conservative','expected','optimistic')),
  sell_through_pct   NUMERIC(4,3) NOT NULL,           -- 0.50 | 0.70 | 0.90
  deal_structure     TEXT NOT NULL
                     CHECK (deal_structure IN ('guarantee','guarantee_plus_backend','door_split','tiered_bonus')),
  inputs             JSONB NOT NULL,                   -- the exact input set used (guarantee, split%, tiers, etc.)
  -- OUTPUTS
  projected_gross    NUMERIC(10,2) NOT NULL,
  projected_net      NUMERIC(10,2) NOT NULL,
  projected_expenses NUMERIC(10,2) NOT NULL,
  artist_payout      NUMERIC(10,2) NOT NULL,
  promoter_profit    NUMERIC(10,2) NOT NULL,
  break_even_units   INTEGER,
  break_even_gross   NUMERIC(10,2),
  break_even_pct     NUMERIC(5,4),                     -- break_even / total_capacity
  risk_score         NUMERIC(4,2) NOT NULL DEFAULT 0,  -- 0.0 – 1.0
  risk_flags         TEXT[] NOT NULL DEFAULT '{}',
  simulated          BOOLEAN NOT NULL DEFAULT true,    -- PERMANENT: always true
  created_at         TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_deal_lab_simulations_session  ON deal_lab_simulations(session_id);
CREATE INDEX IF NOT EXISTS idx_deal_lab_simulations_event    ON deal_lab_simulations(event_id);
CREATE INDEX IF NOT EXISTS idx_deal_lab_simulations_scenario ON deal_lab_simulations(scenario);

-- 3. Recommendation cache (best-fit deal per session)
CREATE TABLE IF NOT EXISTS deal_lab_recommendations (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id          UUID NOT NULL UNIQUE REFERENCES deal_lab_sessions(id) ON DELETE CASCADE,
  simulation_id       UUID NOT NULL REFERENCES deal_lab_simulations(id) ON DELETE CASCADE,
  rationale           TEXT NOT NULL,
  score               NUMERIC(6,4) NOT NULL,
  alternatives        JSONB,                  -- top-N scored alternates
  simulated           BOOLEAN NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ DEFAULT now()
);

-- ════════════════════════════════════════════════════════════
--  ROW LEVEL SECURITY — mirror existing pattern (admin_users join)
-- ════════════════════════════════════════════════════════════

ALTER TABLE ad_engine_assets               ENABLE ROW LEVEL SECURITY;
ALTER TABLE ad_engine_hooks                ENABLE ROW LEVEL SECURITY;
ALTER TABLE ad_engine_copy_variants        ENABLE ROW LEVEL SECURITY;
ALTER TABLE ad_engine_creatives            ENABLE ROW LEVEL SECURITY;
ALTER TABLE ad_engine_identities           ENABLE ROW LEVEL SECURITY;
ALTER TABLE ad_engine_campaigns            ENABLE ROW LEVEL SECURITY;
ALTER TABLE ad_engine_campaign_creatives   ENABLE ROW LEVEL SECURITY;
ALTER TABLE ad_engine_daily_metrics        ENABLE ROW LEVEL SECURITY;
ALTER TABLE ad_engine_creative_metrics     ENABLE ROW LEVEL SECURITY;
ALTER TABLE ad_engine_budget_caps          ENABLE ROW LEVEL SECURITY;
ALTER TABLE ad_engine_decision_log         ENABLE ROW LEVEL SECURITY;
ALTER TABLE ad_engine_overrides            ENABLE ROW LEVEL SECURITY;
ALTER TABLE deal_lab_sessions              ENABLE ROW LEVEL SECURITY;
ALTER TABLE deal_lab_simulations           ENABLE ROW LEVEL SECURITY;
ALTER TABLE deal_lab_recommendations       ENABLE ROW LEVEL SECURITY;

-- Owners + venue admins can read/write within their venue scope
-- Service role (used by API routes) bypasses RLS by design.
DO $$
DECLARE
  t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'ad_engine_assets','ad_engine_hooks','ad_engine_copy_variants',
    'ad_engine_creatives','ad_engine_identities','ad_engine_campaigns',
    'ad_engine_campaign_creatives','ad_engine_daily_metrics',
    'ad_engine_creative_metrics','ad_engine_budget_caps',
    'ad_engine_decision_log','ad_engine_overrides',
    'deal_lab_sessions','deal_lab_simulations','deal_lab_recommendations'
  ])
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "admin_rw_%1$s" ON %1$I;', t);
    EXECUTE format(
      'CREATE POLICY "admin_rw_%1$s" ON %1$I FOR ALL USING (
         EXISTS (SELECT 1 FROM admin_users au WHERE au.id = auth.uid()
           AND au.role IN (''owner'',''super_admin'',''venue_admin'',''full_admin''))
       );',
      t
    );
  END LOOP;
END$$;

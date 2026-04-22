-- ════════════════════════════════════════════════════════════════════
--  EMAIL ENGINE — Phase 2 core data model migration
--  Additive only. No existing tables are altered.
--  All objects prefixed ee_* and isolated to /modules/email-engine.
--  Run in Supabase SQL editor. Idempotent — safe to re-run.
-- ════════════════════════════════════════════════════════════════════

-- ── Required extensions ──────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS citext;     -- case-insensitive email
CREATE EXTENSION IF NOT EXISTS pg_trgm;    -- trigram search on names

-- ── Shared updated_at trigger helper ────────────────────────────────
CREATE OR REPLACE FUNCTION ee_set_updated_at() RETURNS trigger AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END
$$ LANGUAGE plpgsql;


-- ════════════════════════════════════════════════════════════════════
--  1. ee_contacts — VIEW (no duplication — unions existing tables)
-- ════════════════════════════════════════════════════════════════════
-- One row per unique lower(email). Source precedence:
--    customer_profiles > newsletter_subscribers > orders
-- Performance: wrapping with MATERIALIZED VIEW (refreshed hourly) keeps
-- segment evaluation O(1) and avoids heavy UNION scans at request time.

CREATE MATERIALIZED VIEW IF NOT EXISTS ee_contacts AS
WITH union_rows AS (
  -- Profiles already have rollups
  SELECT
    lower(cp.email)           AS email,
    cp.first_name,
    cp.last_name,
    cp.phone,
    cp.zip_code,
    NULL::uuid                AS venue_id,
    'customer_profile'::text  AS primary_source,
    cp.created_at
  FROM customer_profiles cp
  WHERE cp.email IS NOT NULL

  UNION ALL

  -- Newsletter-only subscribers (no purchase yet)
  SELECT
    lower(ns.email),
    ns.first_name,
    ns.last_name,
    ns.phone,
    NULL,
    ns.venue_id,
    'newsletter'::text,
    ns.created_at
  FROM newsletter_subscribers ns
  WHERE ns.email IS NOT NULL
    AND ns.unsubscribed_at IS NULL

  UNION ALL

  -- Any order email not already represented
  SELECT
    lower(o.customer_email),
    split_part(o.customer_name, ' ', 1),
    NULLIF(trim(substring(o.customer_name FROM position(' ' IN o.customer_name))), ''),
    o.customer_phone,
    o.customer_zip,
    NULL::uuid,
    'order'::text,
    o.created_at
  FROM orders o
  WHERE o.customer_email IS NOT NULL
    AND o.status = 'paid'
)
SELECT DISTINCT ON (email)
  email,
  first_name,
  last_name,
  phone,
  zip_code,
  venue_id,
  primary_source,
  created_at
FROM union_rows
ORDER BY email,
         -- prefer richer source if duplicates
         CASE primary_source WHEN 'customer_profile' THEN 1
                             WHEN 'newsletter'        THEN 2
                             ELSE 3 END,
         created_at;

CREATE UNIQUE INDEX IF NOT EXISTS ux_ee_contacts_email ON ee_contacts (email);
CREATE INDEX        IF NOT EXISTS idx_ee_contacts_zip   ON ee_contacts (zip_code);
CREATE INDEX        IF NOT EXISTS idx_ee_contacts_venue ON ee_contacts (venue_id);


-- ════════════════════════════════════════════════════════════════════
--  2. ee_contact_attributes — derived engagement + purchase rollup
-- ════════════════════════════════════════════════════════════════════
-- One row per email. Refreshed nightly by the attribute cron.
-- Stores ONLY derived signals; never raw PII beyond the email key.

CREATE TABLE IF NOT EXISTS ee_contact_attributes (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email                     CITEXT NOT NULL UNIQUE,

  -- Purchase rollup (derived from orders + tickets)
  total_events_attended     INTEGER NOT NULL DEFAULT 0,
  total_orders              INTEGER NOT NULL DEFAULT 0,
  total_spent               NUMERIC(12,2) NOT NULL DEFAULT 0,
  first_order_at            TIMESTAMPTZ,
  last_event_date           TIMESTAMPTZ,
  last_order_at             TIMESTAMPTZ,
  favorite_event_type       TEXT,   -- mode(event_type) across attended events
  favorite_venue_id         UUID,   -- mode(venue_id) across attended events

  -- Email engagement rollup (derived from ee_send_log + email_sends)
  emails_received           INTEGER NOT NULL DEFAULT 0,
  emails_opened             INTEGER NOT NULL DEFAULT 0,
  emails_clicked            INTEGER NOT NULL DEFAULT 0,
  last_email_sent_at        TIMESTAMPTZ,
  last_email_opened_at      TIMESTAMPTZ,
  last_email_clicked_at     TIMESTAMPTZ,
  open_rate                 NUMERIC(5,4),   -- 0..1
  click_rate                NUMERIC(5,4),   -- 0..1

  -- Flags (denormalised from other tables for fast segment evaluation)
  is_fwb_subscriber         BOOLEAN NOT NULL DEFAULT false,
  is_unsubscribed           BOOLEAN NOT NULL DEFAULT false,
  is_suppressed             BOOLEAN NOT NULL DEFAULT false, -- bounce/complaint
  has_cart_abandonment      BOOLEAN NOT NULL DEFAULT false,
  lfv_segment               TEXT,  -- mirrors customer_profiles.lfv_segment
  tags                      JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- Bookkeeping
  computed_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_ee_contact_attrs_updated
  BEFORE UPDATE ON ee_contact_attributes
  FOR EACH ROW EXECUTE FUNCTION ee_set_updated_at();

CREATE INDEX IF NOT EXISTS idx_ee_attrs_total_spent       ON ee_contact_attributes (total_spent);
CREATE INDEX IF NOT EXISTS idx_ee_attrs_events_attended   ON ee_contact_attributes (total_events_attended);
CREATE INDEX IF NOT EXISTS idx_ee_attrs_last_event        ON ee_contact_attributes (last_event_date);
CREATE INDEX IF NOT EXISTS idx_ee_attrs_last_sent         ON ee_contact_attributes (last_email_sent_at);
CREATE INDEX IF NOT EXISTS idx_ee_attrs_lfv               ON ee_contact_attributes (lfv_segment);
CREATE INDEX IF NOT EXISTS idx_ee_attrs_fwb               ON ee_contact_attributes (is_fwb_subscriber) WHERE is_fwb_subscriber;
CREATE INDEX IF NOT EXISTS idx_ee_attrs_suppressed        ON ee_contact_attributes (is_suppressed) WHERE is_suppressed;
CREATE INDEX IF NOT EXISTS idx_ee_attrs_tags_gin          ON ee_contact_attributes USING gin (tags jsonb_path_ops);
CREATE INDEX IF NOT EXISTS idx_ee_attrs_fav_event_type    ON ee_contact_attributes (favorite_event_type);


-- ════════════════════════════════════════════════════════════════════
--  3. ee_segments — rule-based dynamic audiences
-- ════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS ee_segments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id        UUID REFERENCES venues(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  description     TEXT,
  -- Canonical rule tree (AND/OR of conditions) — shape defined in
  -- modules/email-engine/types.ts as SegmentRuleGroup.
  rules           JSONB NOT NULL DEFAULT '{"op":"AND","conditions":[]}'::jsonb,
  -- Cached audience size + last evaluation for UI surfaces
  last_count      INTEGER,
  last_evaluated  TIMESTAMPTZ,
  is_system       BOOLEAN NOT NULL DEFAULT false,
  created_by      UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_ee_segments_updated
  BEFORE UPDATE ON ee_segments
  FOR EACH ROW EXECUTE FUNCTION ee_set_updated_at();

CREATE INDEX IF NOT EXISTS idx_ee_segments_venue ON ee_segments (venue_id);
CREATE INDEX IF NOT EXISTS idx_ee_segments_rules_gin ON ee_segments USING gin (rules);


-- ════════════════════════════════════════════════════════════════════
--  4. ee_campaigns
-- ════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS ee_campaigns (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id          UUID REFERENCES venues(id) ON DELETE CASCADE,
  segment_id        UUID REFERENCES ee_segments(id) ON DELETE SET NULL,
  event_id          UUID REFERENCES events(id) ON DELETE SET NULL, -- optional, for {{event_*}} variables

  name              TEXT NOT NULL,
  subject           TEXT NOT NULL,
  preview_text      TEXT,
  from_name         TEXT,
  from_email        TEXT,
  reply_to          TEXT,

  status            TEXT NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft','scheduled','sending','sent','paused','failed','cancelled')),
  scheduled_at      TIMESTAMPTZ,
  sent_at           TIMESTAMPTZ,

  total_recipients  INTEGER NOT NULL DEFAULT 0,
  total_sent        INTEGER NOT NULL DEFAULT 0,
  total_failed      INTEGER NOT NULL DEFAULT 0,

  -- Optimization flags written by modules/email-engine/services/optimization.ts
  performance_tier  TEXT CHECK (performance_tier IN ('high_performer','normal','low_engagement','low_conversion')),
  flags             JSONB NOT NULL DEFAULT '[]'::jsonb,

  created_by        UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_ee_campaigns_updated
  BEFORE UPDATE ON ee_campaigns
  FOR EACH ROW EXECUTE FUNCTION ee_set_updated_at();

CREATE INDEX IF NOT EXISTS idx_ee_campaigns_venue        ON ee_campaigns (venue_id);
CREATE INDEX IF NOT EXISTS idx_ee_campaigns_segment      ON ee_campaigns (segment_id);
CREATE INDEX IF NOT EXISTS idx_ee_campaigns_event        ON ee_campaigns (event_id);
CREATE INDEX IF NOT EXISTS idx_ee_campaigns_status       ON ee_campaigns (status);
CREATE INDEX IF NOT EXISTS idx_ee_campaigns_scheduled    ON ee_campaigns (scheduled_at)
  WHERE status IN ('scheduled','sending');


-- ════════════════════════════════════════════════════════════════════
--  5. ee_campaign_messages — rendered content (1 row per campaign; HTML + text)
-- ════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS ee_campaign_messages (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id    UUID NOT NULL REFERENCES ee_campaigns(id) ON DELETE CASCADE,
  content_html   TEXT NOT NULL,
  content_text   TEXT,
  body_json      JSONB,                   -- optional block-builder JSON
  template_key   TEXT,                    -- matches templates/*.ts for re-renders
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (campaign_id)
);

CREATE TRIGGER trg_ee_campaign_messages_updated
  BEFORE UPDATE ON ee_campaign_messages
  FOR EACH ROW EXECUTE FUNCTION ee_set_updated_at();


-- ════════════════════════════════════════════════════════════════════
--  6. ee_campaign_metrics — per-campaign rollup (fast dashboard reads)
-- ════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS ee_campaign_metrics (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id      UUID NOT NULL REFERENCES ee_campaigns(id) ON DELETE CASCADE,

  recipients       INTEGER NOT NULL DEFAULT 0,
  delivered        INTEGER NOT NULL DEFAULT 0,
  opens            INTEGER NOT NULL DEFAULT 0,       -- total opens
  unique_opens     INTEGER NOT NULL DEFAULT 0,
  clicks           INTEGER NOT NULL DEFAULT 0,       -- total clicks
  unique_clicks    INTEGER NOT NULL DEFAULT 0,
  bounces          INTEGER NOT NULL DEFAULT 0,
  complaints       INTEGER NOT NULL DEFAULT 0,
  unsubscribes     INTEGER NOT NULL DEFAULT 0,
  conversions      INTEGER NOT NULL DEFAULT 0,       -- paid orders attributed
  revenue          NUMERIC(12,2) NOT NULL DEFAULT 0, -- sum(total_amount) attributed

  open_rate        NUMERIC(5,4),                     -- 0..1 = unique_opens / delivered
  click_rate       NUMERIC(5,4),                     -- unique_clicks / delivered
  click_to_open    NUMERIC(5,4),                     -- unique_clicks / unique_opens
  conversion_rate  NUMERIC(5,4),                     -- conversions / delivered
  revenue_per_email NUMERIC(12,4),                   -- revenue / delivered

  computed_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (campaign_id)
);

CREATE INDEX IF NOT EXISTS idx_ee_metrics_rates ON ee_campaign_metrics (open_rate, click_rate, conversion_rate);


-- ════════════════════════════════════════════════════════════════════
--  7. ee_send_log — one row per (campaign, recipient)
-- ════════════════════════════════════════════════════════════════════
-- Mirrors the legacy email_sends shape so the existing Resend webhook
-- at app/api/webhooks/resend/route.ts can be extended to also upsert
-- here by resend_message_id — no second webhook needed.

CREATE TABLE IF NOT EXISTS ee_send_log (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id        UUID REFERENCES ee_campaigns(id) ON DELETE CASCADE,
  automation_run_id  UUID,   -- FK added after ee_automation_runs below
  resend_message_id  TEXT,
  recipient_email    CITEXT NOT NULL,
  recipient_name     TEXT,

  status             TEXT NOT NULL DEFAULT 'queued'
                     CHECK (status IN (
                       'queued','sent','delivered','opened','clicked',
                       'bounced','complained','failed','unsubscribed','suppressed'
                     )),

  sent_at            TIMESTAMPTZ,
  delivered_at       TIMESTAMPTZ,
  opened_at          TIMESTAMPTZ,
  clicked_at         TIMESTAMPTZ,
  bounced_at         TIMESTAMPTZ,
  complained_at      TIMESTAMPTZ,
  failed_at          TIMESTAMPTZ,

  open_count         INTEGER NOT NULL DEFAULT 0,
  click_count        INTEGER NOT NULL DEFAULT 0,

  -- Attribution helpers (populated on send, read on metrics refresh)
  utm_campaign       TEXT,   -- "ee:<campaign_id>"
  conversion_order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  converted_at       TIMESTAMPTZ,
  revenue            NUMERIC(12,2),

  error              TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ee_sendlog_campaign       ON ee_send_log (campaign_id);
CREATE INDEX IF NOT EXISTS idx_ee_sendlog_automation     ON ee_send_log (automation_run_id);
CREATE INDEX IF NOT EXISTS idx_ee_sendlog_email          ON ee_send_log (recipient_email);
CREATE INDEX IF NOT EXISTS idx_ee_sendlog_resend_id      ON ee_send_log (resend_message_id);
CREATE INDEX IF NOT EXISTS idx_ee_sendlog_status         ON ee_send_log (status);
CREATE INDEX IF NOT EXISTS idx_ee_sendlog_utm            ON ee_send_log (utm_campaign);
CREATE INDEX IF NOT EXISTS idx_ee_sendlog_campaign_stat  ON ee_send_log (campaign_id, status);


-- ════════════════════════════════════════════════════════════════════
--  8. ee_dispatch_queue — batched outbound queue drained by cron
-- ════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS ee_dispatch_queue (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id     UUID REFERENCES ee_campaigns(id) ON DELETE CASCADE,
  automation_run_id UUID,
  send_log_id     UUID REFERENCES ee_send_log(id) ON DELETE CASCADE,
  recipient_email CITEXT NOT NULL,
  recipient_name  TEXT,
  subject         TEXT NOT NULL,
  content_html    TEXT NOT NULL,
  content_text    TEXT,
  from_email      TEXT,
  from_name       TEXT,
  reply_to        TEXT,
  priority        SMALLINT NOT NULL DEFAULT 5,   -- 1 = highest
  available_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  attempts        INTEGER NOT NULL DEFAULT 0,
  last_error      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ee_queue_available
  ON ee_dispatch_queue (available_at, priority)
  WHERE attempts < 5;


-- ════════════════════════════════════════════════════════════════════
--  9. ee_automation_flows — event-triggered drip definitions
-- ════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS ee_automation_flows (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id        UUID REFERENCES venues(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  description     TEXT,
  -- Trigger is declarative. Known values (modules/email-engine/constants.ts):
  --   new_event_announcement
  --   cart_abandonment
  --   post_event_followup
  --   repeat_buyer_nurture
  --   welcome_series
  --   reengagement
  trigger_type    TEXT NOT NULL,
  -- Optional segment restriction (only contacts in this segment fire)
  segment_id      UUID REFERENCES ee_segments(id) ON DELETE SET NULL,
  -- Sequence of steps, each a small JSON object:
  --   { "delay_minutes": 60,
  --     "template_key": "cart_recovery_v1",
  --     "subject": "You left something behind",
  --     "content_html": "...",
  --     "content_text": "..." }
  steps           JSONB NOT NULL DEFAULT '[]'::jsonb,
  config          JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_by      UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_ee_flows_updated
  BEFORE UPDATE ON ee_automation_flows
  FOR EACH ROW EXECUTE FUNCTION ee_set_updated_at();

CREATE INDEX IF NOT EXISTS idx_ee_flows_venue        ON ee_automation_flows (venue_id);
CREATE INDEX IF NOT EXISTS idx_ee_flows_trigger      ON ee_automation_flows (trigger_type) WHERE is_active;


-- ════════════════════════════════════════════════════════════════════
-- 10. ee_automation_runs — per-contact execution instances
-- ════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS ee_automation_runs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id          UUID NOT NULL REFERENCES ee_automation_flows(id) ON DELETE CASCADE,
  recipient_email  CITEXT NOT NULL,
  trigger_ref      JSONB NOT NULL DEFAULT '{}'::jsonb,  -- e.g. {event_id, order_id, cart_id}
  current_step     INTEGER NOT NULL DEFAULT 0,
  status           TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','running','completed','cancelled','failed')),
  next_run_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at     TIMESTAMPTZ,
  last_error       TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Dedup guard: one active run per (flow, recipient, trigger_ref hash)
  dedup_key        TEXT GENERATED ALWAYS AS (
                     md5(flow_id::text || ':' || lower(recipient_email) || ':' ||
                         coalesce(trigger_ref->>'event_id','') || ':' ||
                         coalesce(trigger_ref->>'order_id',''))
                   ) STORED,
  UNIQUE (dedup_key, status)
);

CREATE TRIGGER trg_ee_runs_updated
  BEFORE UPDATE ON ee_automation_runs
  FOR EACH ROW EXECUTE FUNCTION ee_set_updated_at();

CREATE INDEX IF NOT EXISTS idx_ee_runs_flow          ON ee_automation_runs (flow_id);
CREATE INDEX IF NOT EXISTS idx_ee_runs_email         ON ee_automation_runs (recipient_email);
CREATE INDEX IF NOT EXISTS idx_ee_runs_status        ON ee_automation_runs (status);
CREATE INDEX IF NOT EXISTS idx_ee_runs_due
  ON ee_automation_runs (next_run_at)
  WHERE status IN ('pending','running');

-- Wire the deferred FK from ee_send_log now that ee_automation_runs exists
DO $$ BEGIN
  ALTER TABLE ee_send_log
    ADD CONSTRAINT fk_ee_sendlog_automation_run
    FOREIGN KEY (automation_run_id)
    REFERENCES ee_automation_runs(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE ee_dispatch_queue
    ADD CONSTRAINT fk_ee_queue_automation_run
    FOREIGN KEY (automation_run_id)
    REFERENCES ee_automation_runs(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ════════════════════════════════════════════════════════════════════
-- 11. ee_suppressions — deliverability safety (bounce, complaint, unsub)
-- ════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS ee_suppressions (
  email       CITEXT PRIMARY KEY,
  reason      TEXT NOT NULL CHECK (reason IN ('bounce','complaint','unsubscribe','manual')),
  campaign_id UUID REFERENCES ee_campaigns(id) ON DELETE SET NULL,
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- ════════════════════════════════════════════════════════════════════
-- 12. ee_unsubscribe_tokens — signed one-click unsubscribe links
-- ════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS ee_unsubscribe_tokens (
  token        TEXT PRIMARY KEY,
  email        CITEXT NOT NULL,
  venue_id     UUID REFERENCES venues(id) ON DELETE CASCADE,
  campaign_id  UUID REFERENCES ee_campaigns(id) ON DELETE SET NULL,
  used_at      TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ee_unsub_email ON ee_unsubscribe_tokens (email);


-- ════════════════════════════════════════════════════════════════════
-- 13. ee_optimization_flags — per-campaign post-send recommendations
-- ════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS ee_optimization_flags (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id    UUID NOT NULL REFERENCES ee_campaigns(id) ON DELETE CASCADE,
  kind           TEXT NOT NULL CHECK (kind IN (
                    'low_open_rate','low_click_rate','high_performer',
                    'low_conversion','suggest_subject','suggest_content',
                    'suppression_spike','high_bounce'
                  )),
  severity       TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info','warn','critical')),
  details        JSONB NOT NULL DEFAULT '{}'::jsonb,
  suggestions    JSONB NOT NULL DEFAULT '[]'::jsonb,  -- array of strings
  resolved_at    TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ee_flags_campaign ON ee_optimization_flags (campaign_id);
CREATE INDEX IF NOT EXISTS idx_ee_flags_open     ON ee_optimization_flags (campaign_id) WHERE resolved_at IS NULL;


-- ════════════════════════════════════════════════════════════════════
-- 13b. ee_contact_full — JOIN view consumed by the segmentation engine
-- ════════════════════════════════════════════════════════════════════
-- Regular view (not materialized) so segment evaluation sees live attributes.
-- The underlying ee_contact_attributes table is the hot path; ee_contacts is
-- materialized & indexed, so this view is cheap.
CREATE OR REPLACE VIEW ee_contact_full AS
SELECT
  c.email                              AS email,
  c.first_name                         AS first_name,
  c.last_name                          AS last_name,
  c.phone                              AS phone,
  c.zip_code                           AS zip_code,
  c.venue_id                           AS venue_id,
  c.primary_source                     AS primary_source,
  c.created_at                         AS created_at,

  COALESCE(a.total_events_attended, 0) AS total_events_attended,
  COALESCE(a.total_orders, 0)          AS total_orders,
  COALESCE(a.total_spent, 0)           AS total_spent,
  a.first_order_at                     AS first_order_at,
  a.last_event_date                    AS last_event_date,
  a.last_order_at                      AS last_order_at,
  a.favorite_event_type                AS favorite_event_type,
  a.favorite_venue_id                  AS favorite_venue_id,

  COALESCE(a.emails_received, 0)       AS emails_received,
  COALESCE(a.emails_opened, 0)         AS emails_opened,
  COALESCE(a.emails_clicked, 0)        AS emails_clicked,
  a.last_email_sent_at                 AS last_email_sent_at,
  a.last_email_opened_at               AS last_email_opened_at,
  a.last_email_clicked_at              AS last_email_clicked_at,
  a.open_rate                          AS open_rate,
  a.click_rate                         AS click_rate,

  COALESCE(a.is_fwb_subscriber, false) AS is_fwb_subscriber,
  COALESCE(a.is_unsubscribed, false)   AS is_unsubscribed,
  COALESCE(a.is_suppressed, false)     AS is_suppressed,
  COALESCE(a.has_cart_abandonment, false) AS has_cart_abandonment,
  a.lfv_segment                        AS lfv_segment,
  COALESCE(a.tags, '[]'::jsonb)        AS tags
FROM ee_contacts c
LEFT JOIN ee_contact_attributes a ON a.email = c.email
WHERE COALESCE(a.is_unsubscribed, false) = false
  AND COALESCE(a.is_suppressed, false)   = false;

-- ════════════════════════════════════════════════════════════════════
-- 14. Helper: refresh materialized view
-- ════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION ee_refresh_contacts() RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY ee_contacts;
EXCEPTION WHEN feature_not_supported THEN
  -- No unique index yet on first run? Fall back to non-concurrent
  REFRESH MATERIALIZED VIEW ee_contacts;
END
$$ LANGUAGE plpgsql;


-- ════════════════════════════════════════════════════════════════════
-- 15. RLS — admin-only access to all ee_* tables
-- ════════════════════════════════════════════════════════════════════
ALTER TABLE ee_contact_attributes   ENABLE ROW LEVEL SECURITY;
ALTER TABLE ee_segments             ENABLE ROW LEVEL SECURITY;
ALTER TABLE ee_campaigns            ENABLE ROW LEVEL SECURITY;
ALTER TABLE ee_campaign_messages    ENABLE ROW LEVEL SECURITY;
ALTER TABLE ee_campaign_metrics     ENABLE ROW LEVEL SECURITY;
ALTER TABLE ee_send_log             ENABLE ROW LEVEL SECURITY;
ALTER TABLE ee_dispatch_queue       ENABLE ROW LEVEL SECURITY;
ALTER TABLE ee_automation_flows     ENABLE ROW LEVEL SECURITY;
ALTER TABLE ee_automation_runs      ENABLE ROW LEVEL SECURITY;
ALTER TABLE ee_suppressions         ENABLE ROW LEVEL SECURITY;
ALTER TABLE ee_unsubscribe_tokens   ENABLE ROW LEVEL SECURITY;
ALTER TABLE ee_optimization_flags   ENABLE ROW LEVEL SECURITY;

-- Shared policy macro: owner / super_admin / venue_admin / full_admin
DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'ee_contact_attributes','ee_segments','ee_campaigns','ee_campaign_messages',
    'ee_campaign_metrics','ee_send_log','ee_dispatch_queue',
    'ee_automation_flows','ee_automation_runs','ee_suppressions',
    'ee_unsubscribe_tokens','ee_optimization_flags'
  ])
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I;', 'admin_manage_' || t, t);
    EXECUTE format($p$
      CREATE POLICY %I ON %I
        FOR ALL USING (
          EXISTS (SELECT 1 FROM admin_users au
                  WHERE au.id = auth.uid()
                    AND au.role IN ('owner','super_admin','venue_admin','full_admin'))
        ) WITH CHECK (
          EXISTS (SELECT 1 FROM admin_users au
                  WHERE au.id = auth.uid()
                    AND au.role IN ('owner','super_admin','venue_admin','full_admin'))
        );
    $p$, 'admin_manage_' || t, t);
  END LOOP;
END $$;

-- Service role bypass (cron, server-side workers)
DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'ee_contact_attributes','ee_segments','ee_campaigns','ee_campaign_messages',
    'ee_campaign_metrics','ee_send_log','ee_dispatch_queue',
    'ee_automation_flows','ee_automation_runs','ee_suppressions',
    'ee_unsubscribe_tokens','ee_optimization_flags'
  ])
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I;', 'service_manage_' || t, t);
    EXECUTE format($p$
      CREATE POLICY %I ON %I
        FOR ALL TO service_role USING (true) WITH CHECK (true);
    $p$, 'service_manage_' || t, t);
  END LOOP;
END $$;

-- Public can insert suppression via unsubscribe flow (consumed by unsub route)
DROP POLICY IF EXISTS "public_insert_suppression" ON ee_suppressions;
-- Intentionally NOT creating a public policy: unsubscribe is handled by a
-- server route using the service role. Tokens are the only public surface.

-- ════════════════════════════════════════════════════════════════════
-- DONE. Email Engine schema is ready.
-- ════════════════════════════════════════════════════════════════════

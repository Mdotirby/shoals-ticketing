-- ============================================================================
-- TRACKABLE TICKET LINKS — Migration
-- ============================================================================
--
-- ARCHITECTURE OVERVIEW
--
-- This feature allows admins to generate unique trackable URLs for marketing
-- campaigns directly from the edit event page. Each link tracks views/clicks
-- and conversions/ticket purchases with full attribution.
--
-- REDIRECT FLOW:
--   1. Admin creates a trackable link with slug e.g. "fb-spring-fest"
--   2. The public URL is: /t/fb-spring-fest
--   3. When a user visits /t/[slug]:
--      a. A Next.js route handler looks up the slug in trackable_links
--      b. Inserts a row into trackable_link_events with event_type = 'click'
--      c. Increments trackable_links.clicks via an UPDATE
--      d. Redirects (302) to the destination_url with ?ref=[slug] appended
--   4. The event page renders normally; the ref param is stored in a cookie
--      or session for later attribution.
--
-- CONVERSION TRACKING:
--   1. During checkout, the app checks for a ref param in the URL or cookie
--   2. If present, it looks up the trackable_link by slug
--   3. After successful payment, a row is inserted into trackable_link_events
--      with event_type = 'conversion', the order_id, and revenue_amount
--   4. trackable_links.conversions and .revenue are incremented
--
-- DENORMALIZED COUNTS:
--   The clicks, conversions, and revenue columns on trackable_links are
--   denormalized for fast dashboard reads. They are updated atomically
--   when tracking events are recorded. The trackable_link_events table
--   serves as the source of truth for detailed analytics and auditing.
--
-- ============================================================================

-- =========================
-- TABLE: trackable_links
-- =========================
CREATE TABLE IF NOT EXISTS trackable_links (
  id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id        UUID            NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  venue_id        UUID            REFERENCES venues(id),
  slug            TEXT            UNIQUE NOT NULL,
  label           TEXT            NOT NULL,
  source          TEXT,           -- e.g. facebook, instagram, email, flyer, radio
  medium          TEXT,           -- e.g. paid, organic, cpc
  campaign        TEXT,           -- campaign name
  destination_url TEXT,           -- full URL to the event page
  is_active       BOOLEAN         DEFAULT true,
  clicks          INTEGER         DEFAULT 0,
  conversions     INTEGER         DEFAULT 0,
  revenue         NUMERIC(10,2)   DEFAULT 0,
  created_at      TIMESTAMPTZ     DEFAULT now(),
  updated_at      TIMESTAMPTZ     DEFAULT now()
);

-- =========================
-- TABLE: trackable_link_events
-- =========================
CREATE TABLE IF NOT EXISTS trackable_link_events (
  id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
  link_id         UUID            NOT NULL REFERENCES trackable_links(id) ON DELETE CASCADE,
  event_type      TEXT            NOT NULL CHECK (event_type IN ('click', 'conversion')),
  ip_address      TEXT,
  user_agent      TEXT,
  referrer        TEXT,
  order_id        UUID,           -- references orders(id) if conversion
  revenue_amount  NUMERIC(10,2),  -- order amount if conversion
  metadata        JSONB           DEFAULT '{}',
  created_at      TIMESTAMPTZ     DEFAULT now()
);

-- =========================
-- INDEXES
-- =========================
CREATE INDEX IF NOT EXISTS idx_trackable_links_event_id
  ON trackable_links(event_id);

CREATE INDEX IF NOT EXISTS idx_trackable_link_events_link_id
  ON trackable_link_events(link_id);

CREATE INDEX IF NOT EXISTS idx_trackable_link_events_event_type
  ON trackable_link_events(event_type);

CREATE INDEX IF NOT EXISTS idx_trackable_link_events_created_at
  ON trackable_link_events(created_at);

-- =========================
-- UPDATED_AT TRIGGER
-- =========================
CREATE OR REPLACE FUNCTION update_trackable_links_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_trackable_links_updated_at ON trackable_links;
CREATE TRIGGER trg_trackable_links_updated_at
  BEFORE UPDATE ON trackable_links
  FOR EACH ROW
  EXECUTE FUNCTION update_trackable_links_updated_at();

-- =========================
-- ROW LEVEL SECURITY
-- =========================

-- Enable RLS on both tables
ALTER TABLE trackable_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE trackable_link_events ENABLE ROW LEVEL SECURITY;

-- trackable_links: admin full access (SELECT, INSERT, UPDATE, DELETE)
CREATE POLICY trackable_links_admin_select ON trackable_links
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM admin_users au
      WHERE au.id = auth.uid()
    )
  );

CREATE POLICY trackable_links_admin_insert ON trackable_links
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM admin_users au
      WHERE au.id = auth.uid()
    )
  );

CREATE POLICY trackable_links_admin_update ON trackable_links
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM admin_users au
      WHERE au.id = auth.uid()
    )
  );

CREATE POLICY trackable_links_admin_delete ON trackable_links
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM admin_users au
      WHERE au.id = auth.uid()
    )
  );

-- trackable_links: public SELECT for the redirect handler (lookup by slug)
CREATE POLICY trackable_links_public_select ON trackable_links
  FOR SELECT USING (true);

-- trackable_links: allow service role / anon to increment counters
-- (the API route uses supabase service role for atomic counter updates)
CREATE POLICY trackable_links_public_update ON trackable_links
  FOR UPDATE USING (true);

-- trackable_link_events: public INSERT for tracking clicks and conversions
CREATE POLICY trackable_link_events_public_insert ON trackable_link_events
  FOR INSERT WITH CHECK (true);

-- trackable_link_events: admin SELECT for analytics dashboard
CREATE POLICY trackable_link_events_admin_select ON trackable_link_events
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM admin_users au
      WHERE au.id = auth.uid()
    )
  );

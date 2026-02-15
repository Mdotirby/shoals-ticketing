-- ============================================================
-- VENUECORE FULL MIGRATION — COPY/PASTE INTO SUPABASE SQL EDITOR
-- Run this entire script at once.
-- Safe to re-run (uses IF NOT EXISTS / IF EXISTS everywhere)
-- ============================================================


-- ============================================================
-- 1) VENUES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS venues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  logo_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_venues_slug ON venues(slug);

ALTER TABLE venues ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_venues" ON venues;
CREATE POLICY "public_read_venues" ON venues FOR SELECT USING (true);

DROP POLICY IF EXISTS "admin_manage_venues" ON venues;
CREATE POLICY "admin_manage_venues" ON venues FOR ALL USING (
  auth.uid() IN (SELECT id FROM admin_users WHERE role IN ('owner', 'super_admin'))
);

DROP POLICY IF EXISTS "service_manage_venues" ON venues;
CREATE POLICY "service_manage_venues" ON venues FOR ALL WITH CHECK (true);


-- ============================================================
-- 2) VENUES — Settings Columns
-- ============================================================
ALTER TABLE venues ADD COLUMN IF NOT EXISTS nickname TEXT;
ALTER TABLE venues ADD COLUMN IF NOT EXISTS capacity INTEGER;
ALTER TABLE venues ADD COLUMN IF NOT EXISTS address_street TEXT;
ALTER TABLE venues ADD COLUMN IF NOT EXISTS address_city TEXT;
ALTER TABLE venues ADD COLUMN IF NOT EXISTS address_state TEXT;
ALTER TABLE venues ADD COLUMN IF NOT EXISTS address_zip TEXT;
ALTER TABLE venues ADD COLUMN IF NOT EXISTS buyer_name TEXT;
ALTER TABLE venues ADD COLUMN IF NOT EXISTS contract_signatory TEXT;
ALTER TABLE venues ADD COLUMN IF NOT EXISTS buyer_phone TEXT;
ALTER TABLE venues ADD COLUMN IF NOT EXISTS buyer_email TEXT;
ALTER TABLE venues ADD COLUMN IF NOT EXISTS promoter_address TEXT;
ALTER TABLE venues ADD COLUMN IF NOT EXISTS primary_color TEXT DEFAULT '#d0c290';
ALTER TABLE venues ADD COLUMN IF NOT EXISTS secondary_color TEXT DEFAULT '#0b0d1d';
ALTER TABLE venues ADD COLUMN IF NOT EXISTS accent_color TEXT DEFAULT '#202045';
ALTER TABLE venues ADD COLUMN IF NOT EXISTS default_radius_distance TEXT;
ALTER TABLE venues ADD COLUMN IF NOT EXISTS default_radius_days_prior INTEGER;
ALTER TABLE venues ADD COLUMN IF NOT EXISTS default_radius_days_after INTEGER;
ALTER TABLE venues ADD COLUMN IF NOT EXISTS ticketing_fee NUMERIC(10,2) DEFAULT 3.00;
ALTER TABLE venues ADD COLUMN IF NOT EXISTS venue_rebate NUMERIC(10,2) DEFAULT 0;
ALTER TABLE venues ADD COLUMN IF NOT EXISTS tax_rate NUMERIC(5,4) DEFAULT 0.09;


-- ============================================================
-- 3) EVENTS — Add venue_id FK
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'events' AND column_name = 'venue_id'
  ) THEN
    ALTER TABLE events ADD COLUMN venue_id UUID REFERENCES venues(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_events_venue_id ON events(venue_id);


-- ============================================================
-- 4) ADMIN_USERS — Expanded roles + venue_id FK + name + buyer fields + defaults
-- ============================================================
DO $$
BEGIN
  ALTER TABLE admin_users DROP CONSTRAINT IF EXISTS admin_users_role_check;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

ALTER TABLE admin_users ADD CONSTRAINT admin_users_role_check
  CHECK (role IN ('owner', 'super_admin', 'venue_admin', 'promoter', 'full_admin', 'box_office', 'read_only', 'door_greeter'));

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'admin_users' AND column_name = 'venue_id'
  ) THEN
    ALTER TABLE admin_users ADD COLUMN venue_id UUID DEFAULT NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_admin_users_role ON admin_users(role);
CREATE INDEX IF NOT EXISTS idx_admin_users_venue_id ON admin_users(venue_id);

ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS first_name TEXT;
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS last_name TEXT;
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS buyer_name TEXT;
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS contract_signatory TEXT;
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS buyer_phone TEXT;
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS buyer_email TEXT;
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS promoter_address TEXT;
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS default_radius_distance TEXT;
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS default_radius_days_prior INTEGER;
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS default_radius_days_after INTEGER;
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS default_ticketing_fee NUMERIC(10,2) DEFAULT 3.00;


-- ============================================================
-- 5) TICKET TIERS
-- ============================================================
CREATE TABLE IF NOT EXISTS ticket_tiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  tier_name TEXT NOT NULL,
  price NUMERIC(10,2) NOT NULL DEFAULT 0,
  capacity INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ticket_tiers_event_id ON ticket_tiers(event_id);
CREATE INDEX IF NOT EXISTS idx_ticket_tiers_created_at ON ticket_tiers(created_at);

ALTER TABLE ticket_tiers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_ticket_tiers" ON ticket_tiers;
CREATE POLICY "public_read_ticket_tiers" ON ticket_tiers FOR SELECT USING (true);

DROP POLICY IF EXISTS "admin_manage_ticket_tiers" ON ticket_tiers;
CREATE POLICY "admin_manage_ticket_tiers" ON ticket_tiers FOR ALL USING (
  auth.uid() IN (SELECT id FROM admin_users WHERE role IN ('owner', 'super_admin', 'full_admin'))
);

DROP POLICY IF EXISTS "service_manage_ticket_tiers" ON ticket_tiers;
CREATE POLICY "service_manage_ticket_tiers" ON ticket_tiers FOR ALL WITH CHECK (true);


-- ============================================================
-- 6) SPONSORS
-- ============================================================
CREATE TABLE IF NOT EXISTS sponsors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  logo_url TEXT,
  website_url TEXT,
  tier TEXT NOT NULL DEFAULT 'supporting' CHECK (tier IN ('title', 'presenting', 'supporting')),
  event_id UUID REFERENCES events(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sponsors_event_id ON sponsors(event_id);
CREATE INDEX IF NOT EXISTS idx_sponsors_tier ON sponsors(tier);

ALTER TABLE sponsors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_sponsors" ON sponsors;
CREATE POLICY "public_read_sponsors" ON sponsors FOR SELECT USING (true);

DROP POLICY IF EXISTS "admin_manage_sponsors" ON sponsors;
CREATE POLICY "admin_manage_sponsors" ON sponsors FOR ALL USING (
  auth.uid() IN (SELECT id FROM admin_users WHERE role IN ('owner', 'super_admin', 'full_admin'))
);

DROP POLICY IF EXISTS "service_manage_sponsors" ON sponsors;
CREATE POLICY "service_manage_sponsors" ON sponsors FOR ALL WITH CHECK (true);


-- ============================================================
-- 7) AGENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency TEXT NOT NULL,
  agent_name TEXT NOT NULL,
  agent_phone TEXT,
  agent_email TEXT,
  venue_id UUID REFERENCES venues(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agents_venue_id ON agents(venue_id);
CREATE INDEX IF NOT EXISTS idx_agents_agency ON agents(agency);

ALTER TABLE agents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_manage_agents" ON agents;
CREATE POLICY "admin_manage_agents" ON agents FOR ALL USING (true);


-- ============================================================
-- 8) ARTIST_OFFERS — Expanded fields
-- ============================================================
ALTER TABLE artist_offers ADD COLUMN IF NOT EXISTS agency TEXT;
ALTER TABLE artist_offers ADD COLUMN IF NOT EXISTS agent_name TEXT;
ALTER TABLE artist_offers ADD COLUMN IF NOT EXISTS agent_phone TEXT;
ALTER TABLE artist_offers ADD COLUMN IF NOT EXISTS agent_email TEXT;
ALTER TABLE artist_offers ADD COLUMN IF NOT EXISTS day_of_event TEXT;
ALTER TABLE artist_offers ADD COLUMN IF NOT EXISTS num_shows INTEGER DEFAULT 1;
ALTER TABLE artist_offers ADD COLUMN IF NOT EXISTS show_length TEXT;
ALTER TABLE artist_offers ADD COLUMN IF NOT EXISTS show_time TEXT;
ALTER TABLE artist_offers ADD COLUMN IF NOT EXISTS billing TEXT DEFAULT '100% Headline';
ALTER TABLE artist_offers ADD COLUMN IF NOT EXISTS show_lineup JSONB DEFAULT '[]'::jsonb;
ALTER TABLE artist_offers ADD COLUMN IF NOT EXISTS other_terms TEXT;
ALTER TABLE artist_offers ADD COLUMN IF NOT EXISTS radius_distance TEXT;
ALTER TABLE artist_offers ADD COLUMN IF NOT EXISTS radius_days_prior INTEGER;
ALTER TABLE artist_offers ADD COLUMN IF NOT EXISTS radius_days_after INTEGER;
ALTER TABLE artist_offers ADD COLUMN IF NOT EXISTS production_by TEXT;
ALTER TABLE artist_offers ADD COLUMN IF NOT EXISTS deposit_pct NUMERIC(5,2);
ALTER TABLE artist_offers ADD COLUMN IF NOT EXISTS deposit_amount NUMERIC(10,2);
ALTER TABLE artist_offers ADD COLUMN IF NOT EXISTS deposit_due TEXT;
ALTER TABLE artist_offers ADD COLUMN IF NOT EXISTS balance_due TEXT DEFAULT 'Day of Show';
ALTER TABLE artist_offers ADD COLUMN IF NOT EXISTS merch_split TEXT;
ALTER TABLE artist_offers ADD COLUMN IF NOT EXISTS merch_seller TEXT;
ALTER TABLE artist_offers ADD COLUMN IF NOT EXISTS comps INTEGER DEFAULT 0;
ALTER TABLE artist_offers ADD COLUMN IF NOT EXISTS ticket_scaling JSONB DEFAULT '[]'::jsonb;
ALTER TABLE artist_offers ADD COLUMN IF NOT EXISTS fixed_expenses JSONB DEFAULT '[]'::jsonb;
ALTER TABLE artist_offers ADD COLUMN IF NOT EXISTS variable_expenses JSONB DEFAULT '[]'::jsonb;
ALTER TABLE artist_offers ADD COLUMN IF NOT EXISTS total_fixed NUMERIC(10,2) DEFAULT 0;
ALTER TABLE artist_offers ADD COLUMN IF NOT EXISTS total_variable NUMERIC(10,2) DEFAULT 0;
ALTER TABLE artist_offers ADD COLUMN IF NOT EXISTS total_expenses NUMERIC(10,2) DEFAULT 0;
ALTER TABLE artist_offers ADD COLUMN IF NOT EXISTS gross_potential NUMERIC(10,2) DEFAULT 0;
ALTER TABLE artist_offers ADD COLUMN IF NOT EXISTS adj_gross NUMERIC(10,2) DEFAULT 0;
ALTER TABLE artist_offers ADD COLUMN IF NOT EXISTS tax_rate NUMERIC(5,4) DEFAULT 0;
ALTER TABLE artist_offers ADD COLUMN IF NOT EXISTS net_potential NUMERIC(10,2) DEFAULT 0;
ALTER TABLE artist_offers ADD COLUMN IF NOT EXISTS splitpoint NUMERIC(10,2) DEFAULT 0;
ALTER TABLE artist_offers ADD COLUMN IF NOT EXISTS artist_backend NUMERIC(10,2) DEFAULT 0;
ALTER TABLE artist_offers ADD COLUMN IF NOT EXISTS pot_walkout NUMERIC(10,2) DEFAULT 0;
ALTER TABLE artist_offers ADD COLUMN IF NOT EXISTS offer_valid_days INTEGER DEFAULT 14;
ALTER TABLE artist_offers ADD COLUMN IF NOT EXISTS venue_id UUID REFERENCES venues(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_artist_offers_venue_id ON artist_offers(venue_id);


-- ============================================================
-- 9) EVENT VIEWS (marketing analytics)
-- ============================================================
CREATE TABLE IF NOT EXISTS event_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  viewed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  purchased BOOLEAN NOT NULL DEFAULT false,
  session_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_event_views_event_id ON event_views(event_id);
CREATE INDEX IF NOT EXISTS idx_event_views_viewed_at ON event_views(viewed_at);

ALTER TABLE event_views ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_insert_views" ON event_views;
CREATE POLICY "public_insert_views" ON event_views FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "admin_read_views" ON event_views;
CREATE POLICY "admin_read_views" ON event_views FOR SELECT USING (true);


-- ============================================================
-- 10) PERFORMANCE INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_tickets_created_at ON tickets(created_at);
CREATE INDEX IF NOT EXISTS idx_tickets_event_id ON tickets(event_id);
CREATE INDEX IF NOT EXISTS idx_tickets_ticket_type_id ON tickets(ticket_type_id);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);
CREATE INDEX IF NOT EXISTS idx_events_date ON events(date);


-- ============================================================
-- DONE! All tables and columns are ready.
-- ============================================================

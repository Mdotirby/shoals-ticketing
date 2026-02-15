-- ============================================================
-- Venues Migration — Multi-Tenant Subdomain Support
-- Creates venues table, adds FK from events + admin_users.
-- Run in Supabase SQL Editor.
-- ============================================================

-- 1) Create venues table
CREATE TABLE IF NOT EXISTS venues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,  -- subdomain slug, e.g. 'renshoals', 'west72'
  logo_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_venues_slug ON venues(slug);

-- RLS
ALTER TABLE venues ENABLE ROW LEVEL SECURITY;

-- Public can read venues
DROP POLICY IF EXISTS "public_read_venues" ON venues;
CREATE POLICY "public_read_venues" ON venues
  FOR SELECT USING (true);

-- Admins can manage venues
DROP POLICY IF EXISTS "admin_manage_venues" ON venues;
CREATE POLICY "admin_manage_venues" ON venues
  FOR ALL USING (
    auth.uid() IN (
      SELECT id FROM admin_users WHERE role IN ('owner', 'super_admin')
    )
  );

-- Service role full access
DROP POLICY IF EXISTS "service_manage_venues" ON venues;
CREATE POLICY "service_manage_venues" ON venues
  FOR ALL WITH CHECK (true);

-- 2) Ensure events.venue_id exists and references venues
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

-- 3) Ensure admin_users.venue_id references venues
-- (column already exists from earlier migration, just add FK if missing)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'admin_users_venue_id_fkey'
  ) THEN
    ALTER TABLE admin_users
      ADD CONSTRAINT admin_users_venue_id_fkey
      FOREIGN KEY (venue_id) REFERENCES venues(id) ON DELETE SET NULL;
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL; -- ignore if constraint already exists
END $$;

-- ============================================================
-- SEED: Create your first venue
-- Replace values with your actual venue info:
-- ============================================================
-- INSERT INTO venues (name, slug)
-- VALUES ('Singin'' River Live', 'renshoals');
--
-- Then assign the venue to your admin user:
-- UPDATE admin_users SET venue_id = (SELECT id FROM venues WHERE slug = 'renshoals')
-- WHERE email = 'you@example.com';
--
-- And assign venue_id to existing events:
-- UPDATE events SET venue_id = (SELECT id FROM venues WHERE slug = 'renshoals');

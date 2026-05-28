-- ============================================================
-- Sponsors: new fields + junction table migration
-- Run in Supabase SQL Editor after sponsors-partners-migration.sql
-- ============================================================

-- 1. Rename name → sponsor_name (customer-facing display name)
ALTER TABLE sponsors RENAME COLUMN name TO sponsor_name;

-- 2. Add new billing/invoicing fields
ALTER TABLE sponsors
  ADD COLUMN IF NOT EXISTS client_name     TEXT,        -- Legal business name (internal, for invoicing)
  ADD COLUMN IF NOT EXISTS sponsor_address TEXT;        -- Billing address

-- 3. Create sponsor_events junction table (many sponsors ↔ many events)
CREATE TABLE IF NOT EXISTS sponsor_events (
  sponsor_id UUID NOT NULL REFERENCES sponsors(id) ON DELETE CASCADE,
  event_id   UUID NOT NULL REFERENCES events(id)   ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (sponsor_id, event_id)
);

CREATE INDEX IF NOT EXISTS idx_sponsor_events_event ON sponsor_events(event_id);

-- RLS
ALTER TABLE sponsor_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_sponsor_events" ON sponsor_events;
CREATE POLICY "public_read_sponsor_events" ON sponsor_events
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "admin_manage_sponsor_events" ON sponsor_events;
CREATE POLICY "admin_manage_sponsor_events" ON sponsor_events
  FOR ALL USING (
    auth.uid() IN (
      SELECT id FROM admin_users WHERE role IN ('owner', 'super_admin', 'full_admin')
    )
  );

DROP POLICY IF EXISTS "service_manage_sponsor_events" ON sponsor_events;
CREATE POLICY "service_manage_sponsor_events" ON sponsor_events
  FOR ALL WITH CHECK (true);

-- 4. Migrate existing single event_id → junction table
INSERT INTO sponsor_events (sponsor_id, event_id)
  SELECT id, event_id FROM sponsors WHERE event_id IS NOT NULL
  ON CONFLICT DO NOTHING;

-- 5. Drop the old single event_id column
ALTER TABLE sponsors DROP COLUMN IF EXISTS event_id;

-- 6. Update name-based index to sponsor_name
DROP INDEX IF EXISTS idx_sponsors_name;
CREATE INDEX IF NOT EXISTS idx_sponsors_sponsor_name ON sponsors(sponsor_name);

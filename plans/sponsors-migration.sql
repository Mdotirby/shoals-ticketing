-- ============================================================
-- Sponsors Migration
-- Creates sponsors table for sponsor management.
-- Run in Supabase SQL Editor.
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

-- Indexes
CREATE INDEX IF NOT EXISTS idx_sponsors_event_id ON sponsors(event_id);
CREATE INDEX IF NOT EXISTS idx_sponsors_tier ON sponsors(tier);
CREATE INDEX IF NOT EXISTS idx_sponsors_created_at ON sponsors(created_at);

-- RLS
ALTER TABLE sponsors ENABLE ROW LEVEL SECURITY;

-- Public can read sponsors (for event pages)
DROP POLICY IF EXISTS "public_read_sponsors" ON sponsors;
CREATE POLICY "public_read_sponsors" ON sponsors
  FOR SELECT USING (true);

-- Admins can manage sponsors
DROP POLICY IF EXISTS "admin_manage_sponsors" ON sponsors;
CREATE POLICY "admin_manage_sponsors" ON sponsors
  FOR ALL USING (
    auth.uid() IN (
      SELECT id FROM admin_users WHERE role IN ('owner', 'super_admin', 'full_admin')
    )
  );

-- Service role full access
DROP POLICY IF EXISTS "service_manage_sponsors" ON sponsors;
CREATE POLICY "service_manage_sponsors" ON sponsors
  FOR ALL WITH CHECK (true);

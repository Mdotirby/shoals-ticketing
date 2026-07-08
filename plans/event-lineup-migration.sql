-- ============================================================
-- Event Lineup Migration
-- Creates event_lineup table for supporting-act / lineup data.
-- Mirrors the sponsors table pattern (one-to-many child of events).
-- Run in Supabase SQL Editor.
-- ============================================================

CREATE TABLE IF NOT EXISTS event_lineup (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  artist_name TEXT NOT NULL,
  is_headliner BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_event_lineup_event_id ON event_lineup(event_id);
CREATE INDEX IF NOT EXISTS idx_event_lineup_sort_order ON event_lineup(event_id, sort_order);

-- RLS
ALTER TABLE event_lineup ENABLE ROW LEVEL SECURITY;

-- Public can read lineup (for event pages / emails)
DROP POLICY IF EXISTS "public_read_event_lineup" ON event_lineup;
CREATE POLICY "public_read_event_lineup" ON event_lineup
  FOR SELECT USING (true);

-- Admins can manage lineup
DROP POLICY IF EXISTS "admin_manage_event_lineup" ON event_lineup;
CREATE POLICY "admin_manage_event_lineup" ON event_lineup
  FOR ALL USING (
    auth.uid() IN (
      SELECT id FROM admin_users WHERE role IN ('owner', 'super_admin', 'full_admin')
    )
  );

-- Service role full access
DROP POLICY IF EXISTS "service_manage_event_lineup" ON event_lineup;
CREATE POLICY "service_manage_event_lineup" ON event_lineup
  FOR ALL WITH CHECK (true);

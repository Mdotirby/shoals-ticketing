-- ============================================================
-- Event Views Tracking
-- Run in Supabase SQL Editor.
-- ============================================================

CREATE TABLE IF NOT EXISTS event_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  viewed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  purchased BOOLEAN NOT NULL DEFAULT false,
  session_id TEXT -- anonymous session tracking
);

CREATE INDEX IF NOT EXISTS idx_event_views_event_id ON event_views(event_id);
CREATE INDEX IF NOT EXISTS idx_event_views_viewed_at ON event_views(viewed_at);

ALTER TABLE event_views ENABLE ROW LEVEL SECURITY;

-- Public can insert views (anonymous tracking)
DROP POLICY IF EXISTS "public_insert_views" ON event_views;
CREATE POLICY "public_insert_views" ON event_views FOR INSERT WITH CHECK (true);

-- Admins can read views
DROP POLICY IF EXISTS "admin_read_views" ON event_views;
CREATE POLICY "admin_read_views" ON event_views FOR SELECT USING (true);

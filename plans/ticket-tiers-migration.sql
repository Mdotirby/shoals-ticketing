-- ============================================================
-- Ticket Tiers Migration
-- Creates ticket_tiers table for multi-tier ticket support.
-- Run in Supabase SQL Editor.
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

-- Indexes
CREATE INDEX IF NOT EXISTS idx_ticket_tiers_event_id ON ticket_tiers(event_id);
CREATE INDEX IF NOT EXISTS idx_ticket_tiers_created_at ON ticket_tiers(created_at);

-- RLS
ALTER TABLE ticket_tiers ENABLE ROW LEVEL SECURITY;

-- Public can read ticket tiers (for the purchase page)
DROP POLICY IF EXISTS "public_read_ticket_tiers" ON ticket_tiers;
CREATE POLICY "public_read_ticket_tiers" ON ticket_tiers
  FOR SELECT USING (true);

-- Admins can manage ticket tiers
DROP POLICY IF EXISTS "admin_manage_ticket_tiers" ON ticket_tiers;
CREATE POLICY "admin_manage_ticket_tiers" ON ticket_tiers
  FOR ALL USING (
    auth.uid() IN (
      SELECT id FROM admin_users WHERE role IN ('owner', 'super_admin', 'full_admin')
    )
  );

-- Service role can insert/update (for API routes using service key)
DROP POLICY IF EXISTS "service_manage_ticket_tiers" ON ticket_tiers;
CREATE POLICY "service_manage_ticket_tiers" ON ticket_tiers
  FOR ALL WITH CHECK (true);

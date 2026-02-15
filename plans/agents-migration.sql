-- ============================================================
-- Agents Table + Owner Buyer Info
-- Run in Supabase SQL Editor.
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

-- Add buyer info to admin_users (for owner's personal buyer info)
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS buyer_name TEXT;
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS contract_signatory TEXT;
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS buyer_phone TEXT;
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS buyer_email TEXT;
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS promoter_address TEXT;

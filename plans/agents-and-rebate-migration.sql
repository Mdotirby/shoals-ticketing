-- ============================================================
-- Agents Portal + Assignments Migration
-- Run in Supabase SQL Editor.
-- ============================================================

-- 1. Add new columns to agents table for portal support
ALTER TABLE agents ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES admin_users(id);
ALTER TABLE agents ADD COLUMN IF NOT EXISTS first_name TEXT;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS last_name TEXT;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS email TEXT;

-- Backfill: split agent_name into first_name/last_name where missing
UPDATE agents
SET first_name = split_part(agent_name, ' ', 1),
    last_name  = CASE
      WHEN position(' ' IN agent_name) > 0
      THEN substring(agent_name FROM position(' ' IN agent_name) + 1)
      ELSE ''
    END
WHERE first_name IS NULL AND agent_name IS NOT NULL;

-- Backfill email from agent_email
UPDATE agents SET email = agent_email WHERE email IS NULL AND agent_email IS NOT NULL;

-- Add unique constraint on email (only for non-null emails)
CREATE UNIQUE INDEX IF NOT EXISTS idx_agents_email_unique ON agents(email) WHERE email IS NOT NULL;

-- 2. Agent-event assignments table
CREATE TABLE IF NOT EXISTS agent_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(agent_id, event_id)
);

CREATE INDEX IF NOT EXISTS idx_agent_assignments_agent ON agent_assignments(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_assignments_event ON agent_assignments(event_id);

ALTER TABLE agent_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_manage_agent_assignments" ON agent_assignments;
CREATE POLICY "admin_manage_agent_assignments" ON agent_assignments FOR ALL USING (true);

-- 3. Ensure admin_users supports 'agent' role
-- The role column is TEXT so any value is accepted; no ALTER needed.
-- Just document that valid roles now include: owner, venue_admin, full_admin,
-- read_only, box_office, door_greeter, artist, partner, agent

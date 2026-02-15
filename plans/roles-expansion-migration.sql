-- ============================================================
-- Roles Expansion Migration
-- Adds new roles: read_only, door_greeter
-- Run in Supabase SQL Editor.
-- ============================================================

-- Drop old constraint and add expanded one
DO $$
BEGIN
  ALTER TABLE admin_users DROP CONSTRAINT IF EXISTS admin_users_role_check;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

ALTER TABLE admin_users ADD CONSTRAINT admin_users_role_check
  CHECK (role IN ('owner', 'super_admin', 'venue_admin', 'promoter', 'full_admin', 'box_office', 'read_only', 'door_greeter'));

-- Add first_name and last_name to admin_users
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS first_name TEXT;
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS last_name TEXT;

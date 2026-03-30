-- ═══════════════════════════════════════════════════════════════
-- AGENT ROLE FIX — Add 'agent' to admin_users_role_check
-- Run this in Supabase SQL Editor. Idempotent — safe to re-run.
-- ═══════════════════════════════════════════════════════════════

-- The onboarding page inserts role='agent' into admin_users,
-- but the CHECK constraint was never updated to include 'agent'.
-- This migration fixes that.

DO $$ BEGIN
  ALTER TABLE admin_users DROP CONSTRAINT IF EXISTS admin_users_role_check;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

ALTER TABLE admin_users ADD CONSTRAINT admin_users_role_check
  CHECK (role IN (
    'owner','super_admin','venue_admin','promoter',
    'full_admin','box_office','read_only','door_greeter',
    'artist','partner','agent'
  ));

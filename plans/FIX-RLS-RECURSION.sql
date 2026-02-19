-- Fix: "infinite recursion detected in policy for relation admin_users"
-- The RLS policies on guest_list/artist_event_assignments check admin_users
-- which has its own RLS policies, causing a loop.
-- Solution: SECURITY DEFINER function bypasses RLS for role checks.
-- Run this in Supabase SQL Editor.

-- 1. Create a helper function that checks user role without RLS
CREATE OR REPLACE FUNCTION auth_user_role()
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT role FROM public.admin_users WHERE id = auth.uid() LIMIT 1;
$$;

-- 2. Create a helper to get user's venue_id
CREATE OR REPLACE FUNCTION auth_user_venue_id()
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT venue_id FROM public.admin_users WHERE id = auth.uid() LIMIT 1;
$$;

-- 3. Drop and recreate ALL policies that reference admin_users

-- ── guest_list ──
DROP POLICY IF EXISTS "artist_manage_own_guests" ON guest_list;
CREATE POLICY "artist_manage_own_guests" ON guest_list
  FOR ALL USING (artist_id = auth.uid());

DROP POLICY IF EXISTS "organizer_manage_guests" ON guest_list;
CREATE POLICY "organizer_manage_guests" ON guest_list
  FOR ALL USING (auth_user_role() IN ('owner','super_admin','venue_admin'));

-- ── artist_event_assignments ──
DROP POLICY IF EXISTS "organizer_manage_assignments" ON artist_event_assignments;
CREATE POLICY "organizer_manage_assignments" ON artist_event_assignments
  FOR ALL USING (auth_user_role() IN ('owner','super_admin','venue_admin'));

DROP POLICY IF EXISTS "artist_read_own_assignments" ON artist_event_assignments;
CREATE POLICY "artist_read_own_assignments" ON artist_event_assignments
  FOR SELECT USING (artist_id = auth.uid());

-- ── contracts ──
DROP POLICY IF EXISTS "admin_manage_contracts" ON contracts;
CREATE POLICY "admin_manage_contracts" ON contracts
  FOR ALL USING (
    auth_user_role() IN ('owner','super_admin')
    OR (auth_user_role() = 'venue_admin' AND venue_id = auth_user_venue_id())
  );

-- ── settlements ──
DROP POLICY IF EXISTS "admin_manage_settlements" ON settlements;
CREATE POLICY "admin_manage_settlements" ON settlements
  FOR ALL USING (
    auth_user_role() IN ('owner','super_admin')
    OR (auth_user_role() = 'venue_admin' AND venue_id = auth_user_venue_id())
  );

-- ── settlement_expenses ──
DROP POLICY IF EXISTS "admin_manage_settlement_expenses" ON settlement_expenses;
CREATE POLICY "admin_manage_settlement_expenses" ON settlement_expenses
  FOR ALL USING (
    EXISTS (SELECT 1 FROM settlements s WHERE s.id = settlement_expenses.settlement_id
      AND (auth_user_role() IN ('owner','super_admin')
           OR (auth_user_role() = 'venue_admin' AND s.venue_id = auth_user_venue_id())))
  );

-- ── settlement_deposits ──
DROP POLICY IF EXISTS "admin_manage_settlement_deposits" ON settlement_deposits;
CREATE POLICY "admin_manage_settlement_deposits" ON settlement_deposits
  FOR ALL USING (
    EXISTS (SELECT 1 FROM settlements s WHERE s.id = settlement_deposits.settlement_id
      AND (auth_user_role() IN ('owner','super_admin')
           OR (auth_user_role() = 'venue_admin' AND s.venue_id = auth_user_venue_id())))
  );

-- ── stripe_events ──
DROP POLICY IF EXISTS "admin_read_stripe_events" ON stripe_events;
CREATE POLICY "admin_read_stripe_events" ON stripe_events
  FOR SELECT USING (auth_user_role() IN ('owner','super_admin','venue_admin'));

-- ── settlement_ledger ──
DROP POLICY IF EXISTS "admin_read_ledger" ON settlement_ledger;
CREATE POLICY "admin_read_ledger" ON settlement_ledger
  FOR SELECT USING (
    auth_user_role() IN ('owner','super_admin')
    OR (auth_user_role() = 'venue_admin' AND venue_id = auth_user_venue_id())
  );

-- ── venue_faqs ──
DROP POLICY IF EXISTS "venue_admin_manage_faqs" ON venue_faqs;
CREATE POLICY "venue_admin_manage_faqs" ON venue_faqs
  FOR ALL USING (
    auth_user_role() IN ('owner','super_admin')
    OR (auth_user_role() = 'venue_admin' AND venue_id = auth_user_venue_id())
  );

-- ── sidebar_permissions ──
DROP POLICY IF EXISTS "admin_manage_sidebar_perms" ON sidebar_permissions;
CREATE POLICY "admin_manage_sidebar_perms" ON sidebar_permissions
  FOR ALL USING (auth_user_role() IN ('owner','super_admin','venue_admin'));

-- Done. All policies now use auth_user_role() instead of subquerying admin_users directly.

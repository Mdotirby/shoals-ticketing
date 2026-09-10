-- ============================================================
-- Check a guest-list name in at the door
-- Run in Supabase SQL Editor.
--
-- `guest_list` records who is on the list (first_name, last_name, quantity,
-- notes) but has no way to record that they turned up. The box office panel
-- could show the list and nothing else — a comp is issued, the person walks
-- in, and the row looks the same afterwards as it did before doors.
--
-- That matters beyond tidiness: comps occupy capacity and appear in the drop
-- count, so "18 on the list" and "11 of them came" are different numbers and
-- only the second one reconciles against a headcount.
--
-- SAFE TO RUN WHILE SELLING: two nullable columns and one index on a table the
-- checkout path never touches.
-- ============================================================

BEGIN;

-- Null means "not here yet". A timestamp, not a boolean, because when someone
-- arrived is worth knowing at the door and a boolean throws it away.
ALTER TABLE guest_list
  ADD COLUMN IF NOT EXISTS checked_in_at TIMESTAMPTZ;

-- Who let them in. ON DELETE SET NULL so removing a staff member never
-- deletes the record that a guest arrived.
ALTER TABLE guest_list
  ADD COLUMN IF NOT EXISTS checked_in_by UUID REFERENCES admin_users(id) ON DELETE SET NULL;

-- The door reads "who on this list is still outstanding" all night.
CREATE INDEX IF NOT EXISTS idx_guest_list_event_checkin
  ON guest_list (event_id, checked_in_at);

COMMIT;

-- ── Verify ──────────────────────────────────────────────────
--   SELECT first_name, last_name, quantity, checked_in_at
--     FROM guest_list
--    ORDER BY created_at DESC
--    LIMIT 5;
--
-- Expected immediately after running: every checked_in_at is NULL — nobody has
-- been checked in yet, which is correct.

-- ============================================================
-- Role taxonomy migration — legacy staff strings to the six canonical levels
-- Run in Supabase SQL Editor.
--
-- Settled in handoff/ADMIN_MERGE_PLAN.md § 2 and § 8. Pairs with
-- lib/auth/roles.ts, which already normalises these strings in code — so the
-- application keeps working both before and after this runs, and this is a
-- cleanup rather than a flag day. Run it whenever; nothing waits on it.
--
-- NOT INCLUDED, DELIBERATELY: `read_only`. § 8 lists "read_only as a scope,
-- not a role?" as an open decision that blocks the role migration, so those
-- rows are left exactly as they are. Rewriting them into any staff level would
-- grant write access to accounts that have never had it. See the tail of this
-- file for the two options once that is decided.
-- ============================================================

-- 1) Inspect before touching anything. Run this first and keep the output —
--    it is the only record of what the distribution was.
--
--    SELECT role, count(*) FROM admin_users GROUP BY role ORDER BY count(*) DESC;

BEGIN;

-- 2) The four settled rewrites.

-- Platform level folds into Owner.
UPDATE admin_users SET role = 'owner'       WHERE role = 'super_admin';

-- full_admin folds into Venue Admin. NOTE: this is a widening — these users
-- gain sign_payout and view_settlement at full, because Venue Admin is where
-- settlement-signing authority now lives. Intentional, per § 8.
UPDATE admin_users SET role = 'venue_admin' WHERE role = 'full_admin';

-- Closest fit for the booking role.
UPDATE admin_users SET role = 'talent_buyer' WHERE role = 'promoter';

-- door_greeter becomes Box Office; the scan-only narrowing is expressed in the
-- capability matrix, not by having a separate role for it.
UPDATE admin_users SET role = 'box_office'  WHERE role = 'door_greeter';

-- 3) Verify inside the transaction. Expect zero rows; if not, ROLLBACK.
--
--    SELECT role, count(*) FROM admin_users
--     WHERE role IN ('super_admin','full_admin','promoter','door_greeter')
--     GROUP BY role;

COMMIT;

-- 4) After committing, confirm only canonical values remain (plus read_only,
--    and the external identities artist / partner / agent, which are NOT staff
--    levels and are intentionally untouched):
--
--    SELECT DISTINCT role FROM admin_users ORDER BY role;
--
--    Expected: agent, artist, box_office, events_manager, finance, owner,
--              partner, read_only, talent_buyer, venue_admin
--
--    `finance` and `events_manager` are net-new levels and will have zero
--    users until somebody is assigned one — that is expected, not a failure.

-- ============================================================
-- WHEN read_only IS DECIDED — do NOT run either of these yet
-- ============================================================
--
-- Option A — read_only becomes a scope on top of a level (the plan's
-- preference: "a read-only Finance user sees settlements but can't sign").
-- Needs a column, and every read_only user needs a level chosen for them:
--
--    ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS read_only BOOLEAN NOT NULL DEFAULT false;
--    UPDATE admin_users SET read_only = true, role = '<level chosen per user>'
--     WHERE role = 'read_only';
--
-- Option B — read_only stays its own level. Then it needs a row in the
-- capability matrix granting `read`-state capabilities only, and
-- lib/auth/roles.ts needs it added to STAFF_LEVELS.
--
-- Option A is the one the plan favours and the one the design's matrix is
-- shaped for. Either way, until it is chosen these users keep exactly the
-- access they have today: can() grants them nothing.

-- ============================================================
-- Per-venue capability overrides (ADMIN_MERGE_PLAN.md § 3.1)
-- Run in Supabase SQL Editor.
--
-- lib/auth/capabilities.ts holds the DEFAULT 16 x 6 matrix, taken verbatim
-- from the design. Those defaults are correct for a venue that has not asked
-- for anything different — and every venue is one exception away from needing
-- to. This table is where an exception lives.
--
-- SAFE TO RUN WHILE SELLING. It creates one empty table. Nothing reads it
-- until a row exists, and can() falls back to the compiled defaults for every
-- (venue, role, capability) with no override — so an empty table behaves
-- exactly like today.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS role_capabilities (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id        UUID REFERENCES venues(id) ON DELETE CASCADE,
  -- The staff level, as lib/auth/roles.ts STAFF_LEVELS spells it.
  role            TEXT NOT NULL,
  -- The capability key, as lib/auth/capabilities.ts CAPABILITIES spells it.
  capability_key  TEXT NOT NULL,
  level           TEXT NOT NULL,
  updated_by      UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT role_capabilities_level_check
    CHECK (level IN ('full', 'scoped', 'read', 'none')),

  -- FOUR states, not three. The design's matrix has a distinct R / "Read"
  -- marker separate from S / "Scoped" and uses it in four places. Collapsing
  -- Read into Scoped would silently grant write where the design shows read.
  CONSTRAINT role_capabilities_role_check
    CHECK (role IN ('owner','venue_admin','talent_buyer','finance','events_manager','box_office'))
);

-- One override per venue / role / capability. NULLS NOT DISTINCT so a
-- platform-wide override (venue_id IS NULL) also cannot be duplicated —
-- without it Postgres treats every NULL venue_id as unique and the same
-- override could be inserted endlessly.
CREATE UNIQUE INDEX IF NOT EXISTS role_capabilities_unique
  ON role_capabilities (venue_id, role, capability_key) NULLS NOT DISTINCT;

CREATE INDEX IF NOT EXISTS idx_role_capabilities_lookup
  ON role_capabilities (venue_id, role);

-- ── The owner column is not editable, by construction ─────────────────
-- Owner holds every capability at `full` in the design, and the screen that
-- writes this table refuses to change that column. This is the same rule at
-- the database level: an owner who can be demoted by a venue admin is not an
-- owner. Without it, "assign_roles" plus one UPDATE is a complete takeover.
CREATE OR REPLACE FUNCTION reject_owner_capability_downgrade()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.role = 'owner' AND NEW.level <> 'full' THEN
    RAISE EXCEPTION 'owner capabilities cannot be reduced';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_reject_owner_capability_downgrade ON role_capabilities;
CREATE TRIGGER trg_reject_owner_capability_downgrade
  BEFORE INSERT OR UPDATE ON role_capabilities
  FOR EACH ROW EXECUTE FUNCTION reject_owner_capability_downgrade();

COMMIT;

-- ── Verify ──────────────────────────────────────────────────
--   SELECT venue_id, role, capability_key, level FROM role_capabilities
--    ORDER BY role, capability_key;
--
-- Expected immediately after running: zero rows. Every capability resolves
-- from the compiled defaults until somebody changes one.
--
--   -- should raise "owner capabilities cannot be reduced":
--   INSERT INTO role_capabilities (role, capability_key, level)
--   VALUES ('owner', 'sign_payout', 'none');

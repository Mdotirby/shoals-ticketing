-- ============================================================
-- audit_log — insert-only accountability trail
-- Run in Supabase SQL Editor.
--
-- ADMIN_MERGE_PLAN.md § 3.5. The design promises an immutable log with 7-year
-- retention, and the plan is explicit that this "has to be a database
-- constraint" rather than a convention.
-- ============================================================

CREATE TABLE IF NOT EXISTS audit_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id    UUID REFERENCES venues(id) ON DELETE SET NULL,
  actor_id    UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  action      TEXT NOT NULL,
  target_type TEXT,
  target_id   TEXT,
  detail      JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- actor_id and venue_id are ON DELETE SET NULL, never CASCADE. Deleting a
-- staff member must not delete the record of what they did — that is the whole
-- point of the log. The row survives with a null actor; `detail` should carry
-- the actor's email at write time so the trail is still readable afterwards.

CREATE INDEX IF NOT EXISTS audit_log_venue_created_idx
  ON audit_log (venue_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_actor_created_idx
  ON audit_log (actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_action_idx ON audit_log (action);

-- ── Immutability ────────────────────────────────────────────
-- RLS ALONE IS NOT ENOUGH HERE. This application talks to Postgres through
-- createAdminClient(), the service-role client, and the service role BYPASSES
-- RLS entirely. A policy that forbids UPDATE and DELETE would be silently
-- ignored by every query the app actually makes.
--
-- So immutability is enforced by a trigger, which the service role cannot
-- bypass, and RLS is applied as well for anything arriving over the anon key.
-- Both, not either.

CREATE OR REPLACE FUNCTION audit_log_is_append_only()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only: % is not permitted', TG_OP;
END;
$$;

DROP TRIGGER IF EXISTS audit_log_no_update ON audit_log;
CREATE TRIGGER audit_log_no_update
  BEFORE UPDATE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_log_is_append_only();

DROP TRIGGER IF EXISTS audit_log_no_delete ON audit_log;
CREATE TRIGGER audit_log_no_delete
  BEFORE DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_log_is_append_only();

-- Belt and braces for non-service-role connections.
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS audit_log_insert ON audit_log;
CREATE POLICY audit_log_insert ON audit_log
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- Deliberately NO update or delete policy, and no select policy: reads go
-- through the server, gated on the read_audit capability in lib/auth/can.ts.
-- Granting select to `authenticated` here would let any signed-in user read the
-- whole trail directly from the client.

REVOKE UPDATE, DELETE ON audit_log FROM authenticated, anon;

-- ── Verify ──────────────────────────────────────────────────
-- Both of these must fail. If either succeeds, the trigger did not attach and
-- the table is not immutable:
--
--   INSERT INTO audit_log (action) VALUES ('test.write');
--   UPDATE audit_log SET action = 'tampered' WHERE action = 'test.write';
--     -- expected: ERROR  audit_log is append-only: UPDATE is not permitted
--   DELETE FROM audit_log WHERE action = 'test.write';
--     -- expected: ERROR  audit_log is append-only: DELETE is not permitted
--
-- The test row cannot be removed afterwards, by design. Leave it; it is the
-- proof the constraint works.

-- ── Retention ───────────────────────────────────────────────
-- 7 years is a retention FLOOR, not a scheduled deletion — there is
-- deliberately no purge job here. Adding one would need a carve-out in the
-- delete trigger, and that carve-out is the exact hole an append-only log
-- exists to prevent. If retention trimming is ever genuinely required, do it as
-- an explicit, reviewed migration that drops the trigger, deletes, and
-- reinstates it, so the act of trimming is itself visible in the schema history.

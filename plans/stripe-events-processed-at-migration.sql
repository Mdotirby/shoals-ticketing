-- ============================================================
-- Fix the settlement-ledger foreign-key deadlock
-- Run in Supabase SQL Editor.
--
-- THE BUG, exactly:
--
--   settlement_ledger.stripe_event_id TEXT REFERENCES stripe_events(id)
--
-- The Stripe webhook writes the ledger row in the MIDDLE of processing an
-- event, and logged that event into stripe_events at the END — deliberately,
-- so a failed event could be retried. The foreign key therefore pointed at a
-- row that did not exist yet. Every insert was rejected with 23503, the
-- handler logged the failure and swallowed it (the sale is already complete,
-- so it must not throw), and the ledger row was silently lost.
--
-- Evidence: of 932 settlement_ledger rows, ZERO carry a stripe_event_id. Not
-- one, ever. Every row that exists came from a path that does not set one —
-- cash sales, free checkouts, comps, or a backfill. Broken since April.
--
-- ── WHAT THIS MIGRATION ACTUALLY HAS TO DO ─────────────────────────────────
-- `processed_at` ALREADY EXISTS on stripe_events — and carries DEFAULT now(),
-- which is the problem. The fix writes the event row FIRST so the foreign key
-- resolves, then stamps it when processing finishes. A column that stamps
-- itself on insert makes every event look finished the moment it starts, so a
-- handler that dies half way would be skipped on redelivery instead of
-- retried. That is exactly what logging late was protecting.
--
-- So: drop the default. Nothing else. The column is there, every existing row
-- is already stamped, and there is no created_at on this table to backfill
-- from — an earlier draft of this file assumed one and failed with 42703.
--
-- SAFE TO RUN WHILE SELLING. Dropping a default changes nothing about rows
-- that exist and nothing about reads. Writers that supply a value are
-- unaffected; the only writer that omits it is the webhook, which is the
-- caller this is for.
-- ============================================================

BEGIN;

-- The column exists already on this database; kept for a fresh environment.
ALTER TABLE stripe_events
  ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ;

-- The whole point. With DEFAULT now() the row stamps itself on insert, and
-- "started" becomes indistinguishable from "finished".
ALTER TABLE stripe_events
  ALTER COLUMN processed_at DROP DEFAULT;

CREATE INDEX IF NOT EXISTS idx_stripe_events_processed_at
  ON stripe_events (processed_at);

COMMIT;

-- ── Verify ──────────────────────────────────────────────────
-- 1) The default is gone:
--
--      SELECT column_name, column_default
--        FROM information_schema.columns
--       WHERE table_name = 'stripe_events' AND column_name = 'processed_at';
--
--    Expected: column_default IS NULL.
--
-- 2) Nothing was disturbed — every existing event is still marked finished:
--
--      SELECT count(*) FILTER (WHERE processed_at IS NULL)     AS unfinished,
--             count(*) FILTER (WHERE processed_at IS NOT NULL) AS done
--        FROM stripe_events;
--
--    Expected: unfinished 0, done 775.
--
-- 3) THE ONE THAT MATTERS. After the next card sale, this should return a row
--    for the first time since April:
--
--      SELECT id, order_id, stripe_event_id, gross_amount
--        FROM settlement_ledger
--       WHERE stripe_event_id IS NOT NULL
--       ORDER BY id DESC LIMIT 5;

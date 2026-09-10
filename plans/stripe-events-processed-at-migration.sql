-- ============================================================
-- Fix the settlement-ledger foreign-key deadlock
-- Run in Supabase SQL Editor.
--
-- THE BUG, exactly:
--
--   settlement_ledger.stripe_event_id TEXT REFERENCES stripe_events(id)
--
-- The Stripe webhook writes the ledger row in the MIDDLE of processing an
-- event, and logs that event into stripe_events at the END — deliberately,
-- so a failed event could be retried. The foreign key therefore points at a
-- row that does not exist yet. Every insert is rejected with 23503, the
-- handler logs the failure and swallows it (the sale is already complete, so
-- it must not throw), and the ledger row is silently lost.
--
-- Evidence: of 932 settlement_ledger rows, ZERO carry a stripe_event_id.
-- Not one, ever. Every row that exists came from a path that does not set it
-- — cash sales, free checkouts, comps, or a backfill.
--
-- WHY THIS IS NOT SOLVED BY LOGGING THE EVENT FIRST, ALONE. The late logging
-- is what makes a retry work: if the row is absent, Stripe's redelivery is
-- processed rather than skipped. Move the insert earlier without more, and a
-- handler that dies mid-way marks the event done and the retry is skipped.
--
-- So the event row gains a `processed_at`. It is written at the START (the
-- foreign key is satisfiable from then on) with processed_at NULL, and
-- stamped at the END. The dedupe check tests processed_at, not existence, so
-- a half-finished event is still retried.
--
-- SAFE TO RUN WHILE SELLING: one nullable column and one index. Existing rows
-- are backfilled to their created_at, which is correct — they were all
-- processed to completion.
-- ============================================================

BEGIN;

ALTER TABLE stripe_events
  ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ;

-- Every row that already exists got there by the old path, which only ever
-- inserted AFTER processing finished. So they are all complete.
UPDATE stripe_events
   SET processed_at = COALESCE(processed_at, created_at)
 WHERE processed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_stripe_events_processed_at
  ON stripe_events (processed_at);

COMMIT;

-- ── Verify ──────────────────────────────────────────────────
--   SELECT count(*) FILTER (WHERE processed_at IS NULL)  AS unfinished,
--          count(*) FILTER (WHERE processed_at IS NOT NULL) AS done
--     FROM stripe_events;
--
-- Expected immediately after running: unfinished 0, done = every row.
--
-- Then, after the next card sale, this should return a row WITH an event id
-- for the first time since April:
--
--   SELECT id, order_id, stripe_event_id, gross_amount
--     FROM settlement_ledger
--    WHERE stripe_event_id IS NOT NULL
--    ORDER BY created_at DESC LIMIT 5;

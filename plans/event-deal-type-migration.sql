-- ============================================================
-- Event model, round two — class vs deal type (ADMIN_MERGE_PLAN.md § 9.1)
-- Run in Supabase SQL Editor.
--
-- co_promote and rental_box_office were never event CLASSES. Class answers
-- "does this show sell through our ticketing"; those two answer "whose money
-- is it". Merging them is why the enum had six values that did not sort
-- cleanly, and why the dashboard band question (§ 8.4) had no clean answer.
--
-- Untangled:
--   event_type  → does it sell here      (5 values)
--   deal_type   → whose money is it      (4 values)
--
-- RUN THIS BEFORE THE FIRST CO-PROMOTE OR RENTAL SHOW IS CREATED. Today the
-- backfill below matches ZERO rows (43 events: 27 hard_ticket, 16 private), so
-- this is a schema change with no data migration. Every such show created
-- before it runs is a row somebody has to reclassify by hand afterwards.
-- ============================================================

BEGIN;

-- 1) deal_type — whose money the show is.
--
-- NAMING COLLISION, DELIBERATE AND FLAGGED: artist_offers.deal_type already
-- exists and means something else entirely — 'VS' | 'FLAT' | 'PLUS' | 'BONUS',
-- the ARTIST PAYMENT structure. This column is the venue-side risk model. They
-- are different axes on related tables and both are called deal_type, which is
-- the same conflation § 9.1 is untangling, one level up. Named per the plan;
-- if it is ever renamed, `promotion_model` reads less ambiguously.
ALTER TABLE events ADD COLUMN IF NOT EXISTS deal_type TEXT NOT NULL DEFAULT 'own_risk';

ALTER TABLE events DROP CONSTRAINT IF EXISTS events_deal_type_check;
ALTER TABLE events ADD CONSTRAINT events_deal_type_check
  CHECK (deal_type IN ('own_risk', 'co_promote', 'rental_box_office', 'guarantee'));

-- 2) Backfill: anything currently classed as a deal becomes a hard ticket that
--    HAS that deal. Zero rows today — written correctly so it stays safe if it
--    is run later than it should have been.
UPDATE events SET deal_type = 'co_promote',        event_type = 'hard_ticket'
  WHERE event_type = 'co_promote';
UPDATE events SET deal_type = 'rental_box_office', event_type = 'hard_ticket'
  WHERE event_type = 'rental_box_office';

-- 3) event_type — five classes.
--
-- Drops every existing check by name first: the constraint has been redefined
-- at least four times across CONSOLIDATED-, calendar-, private-events- and
-- streamline-migration, with different value sets each time, so which one is
-- live depends on which of those actually ran. This is written to be correct
-- from any of those starting points.
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT conname FROM pg_constraint
     WHERE conrelid = 'events'::regclass
       AND conname LIKE '%event_type%'
  LOOP
    EXECUTE 'ALTER TABLE events DROP CONSTRAINT ' || quote_ident(r.conname);
  END LOOP;
END $$;

ALTER TABLE events ADD CONSTRAINT events_event_type_check
  CHECK (event_type IN (
    'hard_ticket',        -- sells here
    'ticketed',           -- legacy synonym of hard_ticket, still allowed
    'non_ticketed',       -- happens here, no tickets
    'private',            -- rental / private booking
    'external_promotion'  -- NEW: promoted by us, sold on someone else's platform
  ));

-- 4) external_promotion support.
--
-- A show promoted in another city on someone else's ticketing. No inventory
-- here, no scan, no storefront, no Stripe — but real marketing spend, a deal,
-- and a settlement figure keyed in from their report, which has to reach the
-- combined ledger as a promoter P&L line. Today the model cannot express this,
-- so it either gets faked as a hard_ticket with no sales (poisoning every
-- revenue number) or never gets entered.
--
-- Only the fields § 9.1 names, nothing more. Venue name reuses events.venue,
-- which is already free text, so no column for it.
ALTER TABLE events ADD COLUMN IF NOT EXISTS external_city TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS external_marketing_spend NUMERIC(12,2);
ALTER TABLE events ADD COLUMN IF NOT EXISTS external_settlement_amount NUMERIC(12,2);

CREATE INDEX IF NOT EXISTS idx_events_deal_type ON events(deal_type);

COMMIT;

-- ── Verify ──────────────────────────────────────────────────
--   SELECT event_type, deal_type, count(*) FROM events
--    GROUP BY 1,2 ORDER BY 3 DESC;
--
-- Expected today: hard_ticket/own_risk 27, private/own_risk 16, nothing else.
-- No row should be left with event_type in ('co_promote','rental_box_office').

-- ── Not done here ───────────────────────────────────────────
-- No UI for external_promotion. Creating one needs a Create-a-show branch that
-- skips tiers, fees and on-sale entirely, which belongs with item 8 rather than
-- with a schema commit. The class and its columns exist so that screen has
-- something to write to.
--
-- OPEN QUESTION on the value set: 'guarantee' sits oddly beside the other
-- three. own_risk / co_promote / rental_box_office all describe whose money is
-- at stake; a guarantee describes how the ARTIST is paid, which is what
-- artist_offers.deal_type ('VS' | 'FLAT' | 'PLUS' | 'BONUS') already records.
-- Kept because § 9.1 lists it, but worth deciding whether it belongs on this
-- axis at all before anything starts writing it.

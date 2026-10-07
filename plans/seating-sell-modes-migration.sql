-- Five ways a section can sell, plus the sixth we need for tables
--
-- From handoff/screens/storefront-seatpicker.dc.html, build note 1:
--
--   "Add sections.seating_mode: assigned | first_come. Together with the
--    existing type (row / table / ga) that gives all five modes.
--    sells_as_table becomes type=table + assigned."
--
-- Two orthogonal axes rather than a five-value enum. This adds a THIRD,
-- because the design's two table modes both sell a whole table as one unit
-- and Matt needs to sell individual seats at a table as well:
--
--   sale_unit: seat | table   — what one purchase buys
--
--   type   mode         unit    what it is
--   ─────────────────────────────────────────────────────────────────────
--   row    assigned     seat    Assigned seat. Row and number on the ticket.
--   row    first_come   seat    Entry to a section; seats aren't numbered.
--   table  assigned     table   The whole table, one purchase. (= today's
--                               sells_as_table)
--   table  assigned     seat    Individual assigned seats AT a table. A party
--                               wanting all eight just picks all eight.
--   table  first_come   table   A table somewhere in the area.
--   ga     —            —       Standing. A capacity counter.
--
-- ── Pricing ─────────────────────────────────────────────────────────────
-- price_cents keeps meaning what it means today: the price of ONE TABLE on a
-- table section, which is why VIP Tables reads 80000. Selling that table by
-- the seat needs a second number, so seat_price_cents is added rather than
-- reinterpreting price_cents — flipping a unit must never silently resell an
-- $800 table as an $800 seat. A section with sale_unit='seat' and no
-- seat_price_cents is a configuration error and the server refuses to price
-- it rather than guessing 800/8.
--
-- ── Safe to run while selling ───────────────────────────────────────────
-- Every column is defaulted or nullable. sells_as_table is NOT dropped: it
-- is backfilled into sale_unit and kept so anything still reading it keeps
-- working. No existing row changes behaviour — every section today becomes
-- the mode it already had.
--
-- Run in the Supabase SQL editor. Safe to re-run.

ALTER TABLE sections
  ADD COLUMN IF NOT EXISTS seating_mode     text NOT NULL DEFAULT 'assigned',
  ADD COLUMN IF NOT EXISTS sale_unit        text NOT NULL DEFAULT 'seat',
  ADD COLUMN IF NOT EXISTS seat_price_cents integer;

-- Today's behaviour, stated explicitly: a sells_as_table section sells whole
-- tables; everything else sells seats. Only touches rows still on the default.
UPDATE sections SET sale_unit = 'table'
 WHERE sells_as_table IS TRUE AND sale_unit = 'seat';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sections_seating_mode_check') THEN
    ALTER TABLE sections ADD CONSTRAINT sections_seating_mode_check
      CHECK (seating_mode IN ('assigned', 'first_come'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sections_sale_unit_check') THEN
    ALTER TABLE sections ADD CONSTRAINT sections_sale_unit_check
      CHECK (sale_unit IN ('seat', 'table'));
  END IF;
  -- Only a table section can sell by the table.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sections_table_unit_check') THEN
    ALTER TABLE sections ADD CONSTRAINT sections_table_unit_check
      CHECK (sale_unit = 'seat' OR type = 'table');
  END IF;
END $$;

-- ── First-come inventory ────────────────────────────────────────────────
-- Build note 2: "First-come inventory is a section counter (capacity minus
-- sold minus held), not seat rows. Holds go in a new section_holds table
-- (section_id, qty, session, held_until) with the same 4-minute window and
-- cron release as seats."
CREATE TABLE IF NOT EXISTS section_holds (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id  uuid NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
  event_id    uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  qty         integer NOT NULL CHECK (qty > 0),
  session     text,
  order_id    uuid,
  held_until  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- The release cron and the availability count both scan by section and
-- expiry; a sold hold (order_id set, held_until null) is permanent.
CREATE INDEX IF NOT EXISTS section_holds_section_event_idx ON section_holds (section_id, event_id);
CREATE INDEX IF NOT EXISTS section_holds_expiry_idx ON section_holds (held_until) WHERE held_until IS NOT NULL;

COMMENT ON COLUMN sections.seating_mode IS
  'assigned | first_come — whether a ticket names a specific seat.';
COMMENT ON COLUMN sections.sale_unit IS
  'seat | table — what one purchase buys. table is only valid on type=table.';
COMMENT ON COLUMN sections.seat_price_cents IS
  'Per-seat price, in cents. Required when sale_unit=seat on a TABLE section, where price_cents means the whole table.';
COMMENT ON TABLE section_holds IS
  'First-come inventory: a counter per section per event, not seat rows. held_until null + order_id set means sold.';

-- Streamline Migration
-- 1. Link offers directly to events (fixes the venue+date fuzzy match bug)
-- 2. Expand event_type to include co_promote and rental_box_office

-- ── Part 1: Offer → Event FK ──────────────────────────────────────────────
ALTER TABLE artist_offers
  ADD COLUMN IF NOT EXISTS event_id UUID REFERENCES events(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_artist_offers_event_id ON artist_offers(event_id);

-- ── Part 2: Expand event_type constraint ─────────────────────────────────
-- Drop existing check constraint regardless of its auto-generated name
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
    WHERE rel.relname = 'events'
      AND att.attname = 'event_type'
      AND con.contype = 'c'
  LOOP
    EXECUTE 'ALTER TABLE events DROP CONSTRAINT ' || quote_ident(r.conname);
  END LOOP;
END $$;

ALTER TABLE events
  ADD CONSTRAINT events_event_type_check
  CHECK (event_type IN (
    'hard_ticket',
    'ticketed',
    'non_ticketed',
    'private',
    'co_promote',
    'rental_box_office'
  ));

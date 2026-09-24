-- Allow 'dwell' as a trackable link event type
--
-- trackable_link_events.event_type is constrained to view / click /
-- conversion. Recording how long someone stayed needs a fourth kind, and the
-- insert was being rejected by the CHECK — silently, because the endpoint
-- caught the error and still answered {tracked:true}. Both are fixed: this
-- widens the constraint, and the route no longer claims success it did not
-- have.
--
-- Why a separate event rather than a column on the view row: the view is
-- recorded on arrival and the duration is only known on departure, from a
-- sendBeacon that cannot wait for a response to find the earlier row. A
-- second row costs nothing and leaves the view count alone.
--
-- Run in the Supabase SQL editor. Safe to re-run, and safe while selling —
-- it only widens what is permitted.

DO $$
DECLARE
  con_name text;
BEGIN
  SELECT conname INTO con_name
  FROM pg_constraint
  WHERE conrelid = 'trackable_link_events'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%event_type%';

  IF con_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE trackable_link_events DROP CONSTRAINT %I', con_name);
  END IF;
END $$;

ALTER TABLE trackable_link_events
  ADD CONSTRAINT trackable_link_events_event_type_check
  CHECK (event_type IN ('view', 'click', 'conversion', 'dwell'));

COMMENT ON COLUMN trackable_link_events.metadata IS
  'For a dwell event: { "ms": <visible milliseconds> }. Visible time only — a backgrounded tab is not someone reading.';

-- Averaging dwell means scanning one link's events by type.
CREATE INDEX IF NOT EXISTS trackable_link_events_link_type_idx
  ON trackable_link_events (link_id, event_type);

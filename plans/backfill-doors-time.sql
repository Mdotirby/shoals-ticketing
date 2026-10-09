-- Backfill doors_time for ticketed shows that never had one: an hour before
-- the show time the date carries (lib/dates.ts DEFAULT_DOORS_LEAD_MINUTES).
-- Stored dates are wall-clock times written with a +00:00 offset, so the UTC
-- clock IS the venue-local show time.
--
-- Skipped on purpose:
--   * private events — they carry start/end times, not doors
--   * midnight dates — no show time was ever set
--   * noon dates — the date-only placeholder (safeDate's T12:00), not a real time
--
-- Run 2026-10-09 against production.

UPDATE events
SET doors_time = to_char((date AT TIME ZONE 'UTC') - interval '60 minutes', 'HH24:MI')
WHERE event_type = 'hard_ticket'
  AND (doors_time IS NULL OR doors_time = '')
  AND to_char(date AT TIME ZONE 'UTC', 'HH24:MI') NOT IN ('00:00', '12:00');

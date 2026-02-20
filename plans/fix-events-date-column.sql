-- ============================================================
-- Fix events.date column: change from DATE to TIMESTAMPTZ
-- so the time component (e.g., 7:00 PM) is preserved on save.
--
-- Run this in Supabase SQL Editor.
-- Existing events will get midnight (00:00) as their time.
-- After running, edit existing events to set the correct time.
-- ============================================================

ALTER TABLE events
  ALTER COLUMN date TYPE timestamptz
  USING date::timestamptz;

-- Calendar Holds: add hold_level column to events table
-- Supports H1 (highest priority), H2, H3 (lowest priority)
-- Only populated when booking_status = 'hold'

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS hold_level TEXT CHECK (hold_level IN ('H1', 'H2', 'H3'));

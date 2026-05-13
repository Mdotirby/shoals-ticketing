x-- Add tax_method to event_venues and venues so checkout and settlement
-- can respect divisor vs. multiplier per event/venue.
-- Default is 'multiplier' — customer pays tax on top of face price.

ALTER TABLE event_venues
  ADD COLUMN IF NOT EXISTS tax_method TEXT NOT NULL DEFAULT 'multiplier'
  CHECK (tax_method IN ('multiplier', 'divisor'));

ALTER TABLE venues
  ADD COLUMN IF NOT EXISTS tax_method TEXT NOT NULL DEFAULT 'multiplier'
  CHECK (tax_method IN ('multiplier', 'divisor'));

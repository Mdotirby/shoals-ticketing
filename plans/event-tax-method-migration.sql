-- Add event-level tax_method so each event can override the venue default.
-- NULL = inherit from event_venues → venues → default multiplier (no breaking change).
-- Valid values: 'multiplier' (tax added on top) | 'divisor' (tax baked into face price).

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS tax_method text
  CHECK (tax_method IN ('multiplier', 'divisor'));

-- All-In Pricing: let an event mark that its ticket price already has the
-- ticketing fee + facility fee baked in, so checkout doesn't add them again
-- on top and settlement backs the correct face value out of the sticker price.
--
-- Independent of tax_method (which already handles tax-inclusive pricing) —
-- a venue can bake in fees, tax, both, or neither.
--
-- Run in Supabase SQL Editor. Idempotent — safe to re-run.

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS fees_included_in_price BOOLEAN DEFAULT false;

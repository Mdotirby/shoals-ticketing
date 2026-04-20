-- Adds tax_amount and tax_method columns to artist_offers.
-- The offer edit page has been sending these fields in the PUT payload since
-- the tax-method feature landed, but the columns were never added to the
-- database. Without them, every offer save returns "column not found" which
-- the UI surfaces as "Failed to save."
--
-- Run in Supabase SQL Editor. Idempotent — safe to re-run.

ALTER TABLE artist_offers
  ADD COLUMN IF NOT EXISTS tax_amount NUMERIC(10,2) DEFAULT 0;

ALTER TABLE artist_offers
  ADD COLUMN IF NOT EXISTS tax_method TEXT DEFAULT 'divisor';

-- Sanity: valid values are 'divisor' or 'multiplier'
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name = 'artist_offers_tax_method_check'
  ) THEN
    ALTER TABLE artist_offers
      ADD CONSTRAINT artist_offers_tax_method_check
      CHECK (tax_method IN ('divisor', 'multiplier'));
  END IF;
END $$;

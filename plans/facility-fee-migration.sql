-- Facility Fee Migration
-- Adds facility_fee column to venues table (globally set per venue by owner)
-- The ticketing_fee, tax_rate columns already exist on venues table.

ALTER TABLE venues
ADD COLUMN IF NOT EXISTS facility_fee NUMERIC(10,2) DEFAULT 0;

-- Add comment for documentation
COMMENT ON COLUMN venues.facility_fee IS 'Per-ticket facility fee set by owner during onboarding. Included in ticket price on offers and shown separately on order summaries.';

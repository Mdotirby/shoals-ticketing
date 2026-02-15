-- ============================================================
-- Venues Settings Expansion
-- Adds capacity, nickname, buyer info, address, and color scheme.
-- Run in Supabase SQL Editor AFTER venues-migration.sql.
-- ============================================================

-- Venue details
ALTER TABLE venues ADD COLUMN IF NOT EXISTS nickname TEXT;
ALTER TABLE venues ADD COLUMN IF NOT EXISTS capacity INTEGER;
ALTER TABLE venues ADD COLUMN IF NOT EXISTS address_street TEXT;
ALTER TABLE venues ADD COLUMN IF NOT EXISTS address_city TEXT;
ALTER TABLE venues ADD COLUMN IF NOT EXISTS address_state TEXT;
ALTER TABLE venues ADD COLUMN IF NOT EXISTS address_zip TEXT;

-- Buyer / Promoter info
ALTER TABLE venues ADD COLUMN IF NOT EXISTS buyer_name TEXT;
ALTER TABLE venues ADD COLUMN IF NOT EXISTS contract_signatory TEXT;
ALTER TABLE venues ADD COLUMN IF NOT EXISTS buyer_phone TEXT;
ALTER TABLE venues ADD COLUMN IF NOT EXISTS buyer_email TEXT;
ALTER TABLE venues ADD COLUMN IF NOT EXISTS promoter_address TEXT;

-- Venue color scheme (for theming)
ALTER TABLE venues ADD COLUMN IF NOT EXISTS primary_color TEXT DEFAULT '#d0c290';
ALTER TABLE venues ADD COLUMN IF NOT EXISTS secondary_color TEXT DEFAULT '#0b0d1d';
ALTER TABLE venues ADD COLUMN IF NOT EXISTS accent_color TEXT DEFAULT '#202045';

-- Venue-level offer defaults (override owner's global defaults)
ALTER TABLE venues ADD COLUMN IF NOT EXISTS default_radius_distance TEXT;
ALTER TABLE venues ADD COLUMN IF NOT EXISTS default_radius_days_prior INTEGER;
ALTER TABLE venues ADD COLUMN IF NOT EXISTS default_radius_days_after INTEGER;

-- Venue-specific ticketing fee and rebate
ALTER TABLE venues ADD COLUMN IF NOT EXISTS ticketing_fee NUMERIC(10,2) DEFAULT 3.00;
ALTER TABLE venues ADD COLUMN IF NOT EXISTS venue_rebate NUMERIC(10,2) DEFAULT 0;

-- Venue-specific tax rate
ALTER TABLE venues ADD COLUMN IF NOT EXISTS tax_rate NUMERIC(5,4) DEFAULT 0.09;

-- OPTIONAL: Drop fee columns from events (after migrating to venue-based fees)
-- Only run this AFTER confirming venue fees are working:
-- ALTER TABLE events DROP COLUMN IF EXISTS ticketing_fee;
-- ALTER TABLE events DROP COLUMN IF EXISTS venue_rebate;
-- ALTER TABLE events DROP COLUMN IF EXISTS tax_rate;

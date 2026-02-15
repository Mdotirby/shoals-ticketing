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

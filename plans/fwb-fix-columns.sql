-- ============================================================================
-- FWB Fix: Ensure all necessary columns exist
-- Run this in the Supabase SQL Editor
-- ============================================================================

-- Ensure newsletter_subscribers has venue_id column
ALTER TABLE newsletter_subscribers ADD COLUMN IF NOT EXISTS venue_id UUID;

-- Ensure fwb_wallets has the extra columns for imported subscribers
ALTER TABLE fwb_wallets ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE fwb_wallets ADD COLUMN IF NOT EXISTS first_name TEXT;
ALTER TABLE fwb_wallets ADD COLUMN IF NOT EXISTS last_name TEXT;

-- Verify and show what venue IDs exist
-- The user should see their "West 72 Entertainment" venue here
SELECT id, name FROM venues;

-- Show current state of fwb_wallets
SELECT id, email, first_name, venue_id, current_tier, current_benefits_balance 
FROM fwb_wallets LIMIT 20;

-- Show admin_users to see what venue they're assigned to
SELECT id, email, role, venue_id FROM admin_users;

-- ============================================================================
-- IMPORTANT: If admin_users.venue_id is NULL for the owner, run:
--
-- UPDATE admin_users
-- SET venue_id = '<VENUE_UUID_FROM_ABOVE>'
-- WHERE email = '<OWNER_EMAIL>';
--
-- Replace <VENUE_UUID_FROM_ABOVE> with the id from the venues SELECT above
-- Replace <OWNER_EMAIL> with your owner login email
-- ============================================================================

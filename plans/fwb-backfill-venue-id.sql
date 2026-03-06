-- ============================================================================
-- FWB Backfill: Set venue_id on imported wallets with NULL venue_id
-- ============================================================================
-- 
-- CONTEXT:
-- The FWB subscriber import route was missing venue_id when creating wallets.
-- This resulted in 12 records with venue_id = NULL, which are invisible to the
-- FWB admin analytics (which filters by .eq('venue_id', venueId)).
--
-- INSTRUCTIONS:
-- 1. Replace 'YOUR_VENUE_ID_HERE' with your actual venue UUID.
--    You can find it by running:
--      SELECT id, name FROM venues LIMIT 10;
--
-- 2. Run this migration in the Supabase SQL Editor.
-- ============================================================================

-- Preview: see which wallets have NULL venue_id
SELECT id, email, first_name, last_name, venue_id, current_tier, current_benefits_balance
FROM fwb_wallets
WHERE venue_id IS NULL;

-- Backfill: set venue_id on all wallets where it's NULL
-- ⚠️  Replace YOUR_VENUE_ID_HERE with your actual venue UUID
UPDATE fwb_wallets
SET venue_id = '341ddebe-2666-4d1d-a279-4bc44b7f2700',
    updated_at = now()
WHERE venue_id IS NULL;

-- Verify: confirm no more NULL venue_id records remain
SELECT count(*) AS remaining_null FROM fwb_wallets WHERE venue_id IS NULL;

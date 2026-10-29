-- Let offers (and settlements) be door deals.
--
-- artist_offers.deal_type has a CHECK that only allows VS / FLAT / PLUS /
-- BONUS, so saving an offer as DOOR fails with
-- "violates check constraint artist_offers_deal_type_check". The app has
-- supported DOOR since 01b05b9; this lets the database store it.
--
-- settlements is included so a door offer can become a door settlement.
-- DROP ... IF EXISTS makes that half a no-op when it has no such check.
-- Every value on file today (offers: VS, PLUS, FLAT; settlements: FLAT, VS,
-- null) is in both lists, so neither ADD can fail on existing rows.
--
-- Run in the Supabase SQL editor.

ALTER TABLE artist_offers DROP CONSTRAINT IF EXISTS artist_offers_deal_type_check;
ALTER TABLE artist_offers ADD CONSTRAINT artist_offers_deal_type_check
  CHECK (deal_type IN ('VS', 'FLAT', 'PLUS', 'BONUS', 'DOOR'));

ALTER TABLE settlements DROP CONSTRAINT IF EXISTS settlements_deal_type_check;
ALTER TABLE settlements ADD CONSTRAINT settlements_deal_type_check
  CHECK (deal_type IS NULL OR deal_type IN ('VS', 'FLAT', 'PLUS', 'BONUS', 'DOOR', 'CO_PROMOTE'));

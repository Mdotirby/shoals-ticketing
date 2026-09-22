-- Tier-level fee treatment and unlock codes
--
-- Two things this platform could not express, both needed by the same case:
-- a wristband tier on an otherwise-free show, sold for $10, gated by a code,
-- with the venue's own fees WAIVED — not absorbed into the face.
--
-- ── Why "waived" is a new idea ──────────────────────────────────────────
-- Until now the only lever that could relieve the service fee was
-- events.fees_included_in_price, which does something different: the fee is
-- still computed and still EARNED, it just comes out of the face instead of
-- being added on top. That is "included", not "waived". There was no way to
-- say "do not charge this, and do not book it as revenue" for the service
-- fee at all — only facility_fee_enabled could do it, and only for the whole
-- event.
--
-- So each fee gets a mode with three genuinely different meanings:
--
--   'added'     charged on top of the face   (today's default)
--   'included'  comes out of the face        (today's fees_included_in_price)
--   'waived'    not charged, not earned      (the new one)
--
-- NULL means inherit: tier → event → venue. Every existing tier is NULL, so
-- nothing changes behaviour until someone sets a mode deliberately.
--
-- Card processing and sales tax are deliberately NOT modelled here. Card
-- processing is a real cost paid to Stripe, and tax is statutory — neither is
-- ours to waive. "Waive" only ever applies to the two fees the venue levies.
--
-- ── unlock_code ─────────────────────────────────────────────────────────
-- event_presales already gates a whole EVENT (and is UNIQUE per event+type,
-- so it cannot express per-tier anyway). This gates one tier: it shows on the
-- storefront and the box office as locked, and the code enables purchase.
-- Codes are compared case-insensitively, so they are stored upper-cased.
--
-- Run in the Supabase SQL editor. Safe to re-run.

ALTER TABLE ticket_tiers
  ADD COLUMN IF NOT EXISTS service_fee_mode  text,
  ADD COLUMN IF NOT EXISTS facility_fee_mode text,
  ADD COLUMN IF NOT EXISTS unlock_code       text;

-- Constrain to the three modes. NULL stays legal and means "inherit".
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ticket_tiers_service_fee_mode_check') THEN
    ALTER TABLE ticket_tiers ADD CONSTRAINT ticket_tiers_service_fee_mode_check
      CHECK (service_fee_mode IS NULL OR service_fee_mode IN ('added', 'included', 'waived'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ticket_tiers_facility_fee_mode_check') THEN
    ALTER TABLE ticket_tiers ADD CONSTRAINT ticket_tiers_facility_fee_mode_check
      CHECK (facility_fee_mode IS NULL OR facility_fee_mode IN ('added', 'included', 'waived'));
  END IF;
END $$;

COMMENT ON COLUMN ticket_tiers.service_fee_mode IS
  'added | included | waived. NULL inherits from the event, then the venue. "waived" means not charged AND not earned — unlike "included", which still earns the fee out of the face.';
COMMENT ON COLUMN ticket_tiers.facility_fee_mode IS
  'added | included | waived. NULL inherits from the event (facility_fee_enabled = false reads as waived), then the venue.';
COMMENT ON COLUMN ticket_tiers.unlock_code IS
  'When set, this tier is shown locked and needs this code to buy. Stored upper-cased; compared case-insensitively. Unrelated to promo_codes (a discount) and event_presales (early access to the whole event).';

-- The lookup the storefront and the box office do when a code is entered.
CREATE INDEX IF NOT EXISTS ticket_tiers_event_unlock_idx
  ON ticket_tiers (event_id, upper(unlock_code))
  WHERE unlock_code IS NOT NULL;

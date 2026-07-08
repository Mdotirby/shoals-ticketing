-- ============================================================
-- Promo Codes — Presale Fields Migration
-- Adds a presale window + identity flag to the existing promo_codes
-- table so the standalone announcement email can distinguish "the
-- presale code for this event" from any other discount code.
-- Additive only — does not touch existing rows/columns/checkout logic.
-- Run in Supabase SQL Editor.
-- ============================================================

ALTER TABLE promo_codes ADD COLUMN IF NOT EXISTS starts_at TIMESTAMPTZ;
ALTER TABLE promo_codes ADD COLUMN IF NOT EXISTS is_presale BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_promo_codes_is_presale ON promo_codes(event_id) WHERE is_presale = true;

-- Settlement Fee/Tax Breakdown Migration
-- Adds per-fee line items, comp tracking, and tax method support to settlements
-- so the settlement sheet (and PDF) can show:
--   • Total fees collected, broken down: CC fees, Ticketing fees, Facility fees
--   • Total tax collected (with divisor or multiplier method)
--   • Comp count + comp face value (excluded from gross)
--   • Per-ticket fee rates for transparency
--
-- Run in Supabase SQL Editor. Idempotent — safe to re-run.

-- ── Settlements: fee/tax breakdown columns ───────────────────────────
ALTER TABLE settlements ADD COLUMN IF NOT EXISTS cc_fees NUMERIC(10,2) DEFAULT 0;
ALTER TABLE settlements ADD COLUMN IF NOT EXISTS comp_count INTEGER DEFAULT 0;
ALTER TABLE settlements ADD COLUMN IF NOT EXISTS comp_face_value NUMERIC(10,2) DEFAULT 0;
ALTER TABLE settlements ADD COLUMN IF NOT EXISTS tickets_sold_count INTEGER DEFAULT 0;
ALTER TABLE settlements ADD COLUMN IF NOT EXISTS tax_method TEXT DEFAULT 'multiplier';
ALTER TABLE settlements ADD COLUMN IF NOT EXISTS event_date DATE;
ALTER TABLE settlements ADD COLUMN IF NOT EXISTS event_title TEXT;

-- Per-ticket-rate snapshots (for PDF "X tickets × $Y" line items)
ALTER TABLE settlements ADD COLUMN IF NOT EXISTS ticketing_fee_per_ticket NUMERIC(10,4) DEFAULT 0;
ALTER TABLE settlements ADD COLUMN IF NOT EXISTS facility_fee_per_ticket  NUMERIC(10,4) DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name = 'settlements_tax_method_check'
  ) THEN
    ALTER TABLE settlements
      ADD CONSTRAINT settlements_tax_method_check
      CHECK (tax_method IN ('divisor', 'multiplier'));
  END IF;
END $$;

-- Index for /api/settlements?event_id= lookups (used by Create Settlement button)
CREATE INDEX IF NOT EXISTS idx_settlements_event_id ON settlements(event_id);

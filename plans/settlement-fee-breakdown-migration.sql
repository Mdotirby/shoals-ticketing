-- Settlement Fee/Tax Breakdown + Merch Settlement Migration
-- Adds:
--   • Per-fee line items (CC fees, Ticketing fees, Facility fees)
--   • Total tax collected (with divisor or multiplier method)
--   • Comp count + comp face value (excluded from gross)
--   • Per-ticket fee rates
--   • Merch settlement: deal split, tax, seller fee, items, venue/artist shares
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

-- ── Merch Settlement ─────────────────────────────────────────────────
-- Lets the venue track merch sales, contracted split with the artist,
-- merch sales tax, and the cost of hiring a merch seller. The venue's
-- share of merch (and any artist-paid seller fee) is deducted from
-- "Balance Due to Artist" in the settlement calculation.
ALTER TABLE settlements ADD COLUMN IF NOT EXISTS merch_split_venue_pct  NUMERIC(5,4) DEFAULT 0;        -- e.g. 0.20 = venue keeps 20% of net merch
ALTER TABLE settlements ADD COLUMN IF NOT EXISTS merch_tax_rate         NUMERIC(5,4) DEFAULT 0;        -- e.g. 0.095 (can differ from ticket tax)
ALTER TABLE settlements ADD COLUMN IF NOT EXISTS merch_tax_method       TEXT DEFAULT 'multiplier';     -- 'multiplier' (added on top) or 'divisor' (gross is tax-incl.)
ALTER TABLE settlements ADD COLUMN IF NOT EXISTS merch_seller_fee       NUMERIC(10,2) DEFAULT 0;       -- cost to hire a merch seller for the night
ALTER TABLE settlements ADD COLUMN IF NOT EXISTS merch_seller_fee_payer TEXT DEFAULT 'venue';          -- 'venue' or 'artist'

-- Computed snapshots (also recomputed on save)
ALTER TABLE settlements ADD COLUMN IF NOT EXISTS merch_total_gross   NUMERIC(10,2) DEFAULT 0;
ALTER TABLE settlements ADD COLUMN IF NOT EXISTS merch_total_tax     NUMERIC(10,2) DEFAULT 0;
ALTER TABLE settlements ADD COLUMN IF NOT EXISTS merch_total_net     NUMERIC(10,2) DEFAULT 0;
ALTER TABLE settlements ADD COLUMN IF NOT EXISTS merch_venue_share   NUMERIC(10,2) DEFAULT 0;
ALTER TABLE settlements ADD COLUMN IF NOT EXISTS merch_artist_share  NUMERIC(10,2) DEFAULT 0;

-- Discounts: free merch given out at the show (band giveaways, comps, etc.)
ALTER TABLE settlements ADD COLUMN IF NOT EXISTS merch_discounts NUMERIC(10,2) DEFAULT 0;

-- Tax payer: who remits merch sales tax to the gov.
--   'artist' — artist retains the tax money (default; their problem to remit)
--   'venue'  — venue pays the tax. The tax amount is deducted from artist's
--              merch balance due (artist effectively reimburses the venue).
ALTER TABLE settlements ADD COLUMN IF NOT EXISTS merch_tax_payer TEXT DEFAULT 'artist';

-- Line items live in JSONB to avoid a third child table — pattern matches
-- other_ancillary. Each item: { name: string, units_sold: number,
-- unit_price: number, gross: number }
ALTER TABLE settlements ADD COLUMN IF NOT EXISTS merch_items JSONB DEFAULT '[]'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name = 'settlements_merch_tax_method_check'
  ) THEN
    ALTER TABLE settlements
      ADD CONSTRAINT settlements_merch_tax_method_check
      CHECK (merch_tax_method IN ('divisor', 'multiplier'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name = 'settlements_merch_seller_payer_check'
  ) THEN
    ALTER TABLE settlements
      ADD CONSTRAINT settlements_merch_seller_payer_check
      CHECK (merch_seller_fee_payer IN ('venue', 'artist'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name = 'settlements_merch_tax_payer_check'
  ) THEN
    ALTER TABLE settlements
      ADD CONSTRAINT settlements_merch_tax_payer_check
      CHECK (merch_tax_payer IN ('artist', 'venue'));
  END IF;
END $$;

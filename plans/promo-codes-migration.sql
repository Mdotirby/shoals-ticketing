-- ============================================================
-- Promo Codes + Orders Table Updates Migration
-- Run in Supabase SQL Editor
-- ============================================================

-- 1. Promo codes table
CREATE TABLE IF NOT EXISTS promo_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  discount_type TEXT NOT NULL DEFAULT 'fixed', -- 'fixed' or 'percentage'
  discount_value NUMERIC(10,2) NOT NULL, -- dollar amount or percentage
  max_uses INTEGER, -- null = unlimited
  current_uses INTEGER DEFAULT 0,
  active BOOLEAN DEFAULT true,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(event_id, code)
);

-- 2. Indexes
CREATE INDEX IF NOT EXISTS idx_promo_codes_event_id ON promo_codes(event_id);
CREATE INDEX IF NOT EXISTS idx_promo_codes_code ON promo_codes(code);
CREATE INDEX IF NOT EXISTS idx_promo_codes_active ON promo_codes(active) WHERE active = true;

-- 3. RLS policies
ALTER TABLE promo_codes ENABLE ROW LEVEL SECURITY;

-- Allow service role full access (used by API routes)
CREATE POLICY "Service role full access on promo_codes"
  ON promo_codes
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Allow public read for validation (only active codes)
CREATE POLICY "Public can validate active promo codes"
  ON promo_codes
  FOR SELECT
  USING (active = true);

-- 4. Orders table updates — add promo_code_id and source columns
ALTER TABLE orders ADD COLUMN IF NOT EXISTS promo_code_id UUID REFERENCES promo_codes(id);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'online'; -- 'online', 'box_office'

-- Index on source for filtering box office vs online sales
CREATE INDEX IF NOT EXISTS idx_orders_source ON orders(source);
CREATE INDEX IF NOT EXISTS idx_orders_promo_code_id ON orders(promo_code_id);

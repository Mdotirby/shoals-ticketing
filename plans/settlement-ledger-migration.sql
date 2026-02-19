-- Settlement Ledger + Stripe Events
-- Idempotent webhook processing + fee/revenue tracking per order.
-- Run in Supabase SQL Editor.

-- 1. Stripe event dedup table
CREATE TABLE IF NOT EXISTS stripe_events (
  id           TEXT PRIMARY KEY,            -- Stripe event ID (evt_...)
  type         TEXT NOT NULL,
  processed_at TIMESTAMPTZ DEFAULT now(),
  payload      JSONB
);

-- 2. Settlement ledger — one row per financial transaction
CREATE TABLE IF NOT EXISTS settlement_ledger (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id         UUID REFERENCES orders(id),
  event_id         UUID REFERENCES events(id),
  venue_id         UUID REFERENCES venues(id),
  stripe_session_id TEXT,
  stripe_event_id  TEXT REFERENCES stripe_events(id),
  gross_amount     NUMERIC(10,2) NOT NULL,
  ticket_revenue   NUMERIC(10,2) NOT NULL,
  ticketing_fee    NUMERIC(10,2) NOT NULL DEFAULT 0,
  venue_rebate     NUMERIC(10,2) NOT NULL DEFAULT 0,
  tax_collected    NUMERIC(10,2) NOT NULL DEFAULT 0,
  stripe_fee       NUMERIC(10,2) NOT NULL DEFAULT 0,
  net_to_venue     NUMERIC(10,2) NOT NULL DEFAULT 0,
  net_to_platform  NUMERIC(10,2) NOT NULL DEFAULT 0,
  type             TEXT NOT NULL DEFAULT 'sale',  -- sale, refund, dispute
  created_at       TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ledger_venue   ON settlement_ledger(venue_id);
CREATE INDEX IF NOT EXISTS idx_ledger_order   ON settlement_ledger(order_id);
CREATE INDEX IF NOT EXISTS idx_ledger_type    ON settlement_ledger(type);
CREATE INDEX IF NOT EXISTS idx_ledger_created ON settlement_ledger(created_at);

-- RLS: owners/venue_admins can read their ledger
ALTER TABLE settlement_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_read_ledger" ON settlement_ledger
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM admin_users au
      WHERE au.id = auth.uid()
        AND (au.role IN ('owner','super_admin')
             OR (au.role = 'venue_admin' AND au.venue_id = settlement_ledger.venue_id))
    )
  );

-- stripe_events: only service role writes, admins can read
ALTER TABLE stripe_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_read_stripe_events" ON stripe_events
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM admin_users au
      WHERE au.id = auth.uid()
        AND au.role IN ('owner','super_admin','venue_admin')
    )
  );

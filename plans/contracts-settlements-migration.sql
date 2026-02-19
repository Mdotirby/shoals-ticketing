-- Contracts & Settlements Migration
-- Run in Supabase SQL Editor after the settlement-ledger migration.

-- ═══════════════════════════════════════════
-- 1. CONTRACTS TABLE
-- ═══════════════════════════════════════════
CREATE TABLE IF NOT EXISTS contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id UUID REFERENCES offers(id) ON DELETE SET NULL,
  event_id UUID REFERENCES events(id) ON DELETE SET NULL,
  venue_id UUID REFERENCES venues(id) ON DELETE CASCADE,

  source TEXT NOT NULL DEFAULT 'generated' CHECK (source IN ('generated','uploaded')),

  -- Key terms snapshot
  guarantee NUMERIC(10,2),
  deal_type TEXT,
  backend_percentage TEXT,
  bonus_structure TEXT,
  radius_clause TEXT,
  deposit_amount NUMERIC(10,2),
  deposit_paid BOOLEAN DEFAULT false,

  -- File
  file_url TEXT,
  file_name TEXT,
  version INTEGER DEFAULT 1,

  -- Custom clauses override (JSONB array of {title, body})
  custom_clauses JSONB,

  -- Status
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent','signed','void')),
  signed_at TIMESTAMPTZ,
  signed_by_artist TEXT,
  signed_by_buyer TEXT,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contracts_venue ON contracts(venue_id);
CREATE INDEX IF NOT EXISTS idx_contracts_offer ON contracts(offer_id);
CREATE INDEX IF NOT EXISTS idx_contracts_event ON contracts(event_id);

-- ═══════════════════════════════════════════
-- 2. SETTLEMENTS TABLE
-- ═══════════════════════════════════════════
CREATE TABLE IF NOT EXISTS settlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  offer_id UUID REFERENCES offers(id) ON DELETE SET NULL,
  contract_id UUID REFERENCES contracts(id) ON DELETE SET NULL,
  venue_id UUID REFERENCES venues(id) ON DELETE CASCADE,

  -- Deal terms snapshot
  artist_name TEXT,
  guarantee NUMERIC(10,2) DEFAULT 0,
  deal_type TEXT,
  backend_percentage NUMERIC(5,2) DEFAULT 0,
  bonus_structure JSONB,
  radius_clause TEXT,

  -- Ticket audit: snapshot array [{tier, capacity, sold, comps, kills, price, facility_fee, gross}]
  ticket_audit JSONB DEFAULT '[]',

  -- Calculated financials
  total_gross NUMERIC(10,2) DEFAULT 0,
  ticketing_fees NUMERIC(10,2) DEFAULT 0,
  facility_fees NUMERIC(10,2) DEFAULT 0,
  adj_gross NUMERIC(10,2) DEFAULT 0,
  taxes NUMERIC(10,2) DEFAULT 0,
  tax_rate NUMERIC(5,4) DEFAULT 0,
  net_receipts NUMERIC(10,2) DEFAULT 0,
  total_expenses NUMERIC(10,2) DEFAULT 0,
  splitpoint NUMERIC(10,2) DEFAULT 0,
  artist_backend NUMERIC(10,2) DEFAULT 0,
  artist_total NUMERIC(10,2) DEFAULT 0,

  -- Deposits & advances
  deposit_paid NUMERIC(10,2) DEFAULT 0,
  cash_advance NUMERIC(10,2) DEFAULT 0,
  balance_due NUMERIC(10,2) DEFAULT 0,

  -- Ancillary revenue (venue settlement)
  bar_revenue NUMERIC(10,2) DEFAULT 0,
  concessions_revenue NUMERIC(10,2) DEFAULT 0,
  merch_commission NUMERIC(10,2) DEFAULT 0,
  ticketing_rebate NUMERIC(10,2) DEFAULT 0,
  parking_revenue NUMERIC(10,2) DEFAULT 0,
  sponsorship_revenue NUMERIC(10,2) DEFAULT 0,
  other_ancillary JSONB DEFAULT '[]',
  venue_total_revenue NUMERIC(10,2) DEFAULT 0,
  venue_net_profit NUMERIC(10,2) DEFAULT 0,

  -- Status
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','finalized')),
  finalized_at TIMESTAMPTZ,
  finalized_by UUID REFERENCES admin_users(id),

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_settlements_event ON settlements(event_id);
CREATE INDEX IF NOT EXISTS idx_settlements_venue ON settlements(venue_id);

-- ═══════════════════════════════════════════
-- 3. SETTLEMENT EXPENSES TABLE
-- ═══════════════════════════════════════════
CREATE TABLE IF NOT EXISTS settlement_expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  settlement_id UUID NOT NULL REFERENCES settlements(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'fixed' CHECK (category IN ('fixed','variable')),
  estimated_amount NUMERIC(10,2) DEFAULT 0,
  actual_amount NUMERIC(10,2) DEFAULT 0,
  rate NUMERIC(8,6) DEFAULT 0,
  receipt_url TEXT,
  notes TEXT,
  sort_order INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_settlement_expenses ON settlement_expenses(settlement_id);

-- ═══════════════════════════════════════════
-- 4. SETTLEMENT DEPOSITS TABLE
-- ═══════════════════════════════════════════
CREATE TABLE IF NOT EXISTS settlement_deposits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  settlement_id UUID NOT NULL REFERENCES settlements(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'deposit' CHECK (type IN ('deposit','cash_advance','other')),
  amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  date DATE,
  notes TEXT,
  receipt_url TEXT
);

CREATE INDEX IF NOT EXISTS idx_settlement_deposits ON settlement_deposits(settlement_id);

-- ═══════════════════════════════════════════
-- 5. RLS POLICIES
-- ═══════════════════════════════════════════
ALTER TABLE contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE settlement_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE settlement_deposits ENABLE ROW LEVEL SECURITY;

-- Contracts: owner/venue_admin for their venue
CREATE POLICY "admin_manage_contracts" ON contracts FOR ALL USING (
  EXISTS (SELECT 1 FROM admin_users au WHERE au.id = auth.uid()
    AND (au.role IN ('owner','super_admin') OR (au.role = 'venue_admin' AND au.venue_id = contracts.venue_id)))
);

-- Settlements: same
CREATE POLICY "admin_manage_settlements" ON settlements FOR ALL USING (
  EXISTS (SELECT 1 FROM admin_users au WHERE au.id = auth.uid()
    AND (au.role IN ('owner','super_admin') OR (au.role = 'venue_admin' AND au.venue_id = settlements.venue_id)))
);

-- Expenses/Deposits: through settlement ownership
CREATE POLICY "admin_manage_settlement_expenses" ON settlement_expenses FOR ALL USING (
  EXISTS (SELECT 1 FROM settlements s JOIN admin_users au ON au.id = auth.uid()
    WHERE s.id = settlement_expenses.settlement_id
    AND (au.role IN ('owner','super_admin') OR (au.role = 'venue_admin' AND au.venue_id = s.venue_id)))
);

CREATE POLICY "admin_manage_settlement_deposits" ON settlement_deposits FOR ALL USING (
  EXISTS (SELECT 1 FROM settlements s JOIN admin_users au ON au.id = auth.uid()
    WHERE s.id = settlement_deposits.settlement_id
    AND (au.role IN ('owner','super_admin') OR (au.role = 'venue_admin' AND au.venue_id = s.venue_id)))
);

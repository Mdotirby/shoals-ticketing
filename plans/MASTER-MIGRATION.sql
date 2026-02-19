-- ═══════════════════════════════════════════════════════════════
-- MASTER MIGRATION — VenueCore
-- Run this in Supabase SQL Editor. Fully idempotent — safe to re-run.
-- ═══════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════
-- 1. ADMIN_USERS — role constraint + columns
-- ═══════════════════════════════════════════
DO $$ BEGIN
  ALTER TABLE admin_users DROP CONSTRAINT IF EXISTS admin_users_role_check;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

ALTER TABLE admin_users ADD CONSTRAINT admin_users_role_check
  CHECK (role IN (
    'owner','super_admin','venue_admin','promoter',
    'full_admin','box_office','read_only','door_greeter','artist'
  ));

ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS first_name TEXT;
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS last_name TEXT;

-- ═══════════════════════════════════════════
-- 2. VENUES — ensure all columns exist
-- ═══════════════════════════════════════════
ALTER TABLE venues ADD COLUMN IF NOT EXISTS nickname TEXT;
ALTER TABLE venues ADD COLUMN IF NOT EXISTS capacity INTEGER;
ALTER TABLE venues ADD COLUMN IF NOT EXISTS address_street TEXT;
ALTER TABLE venues ADD COLUMN IF NOT EXISTS address_city TEXT;
ALTER TABLE venues ADD COLUMN IF NOT EXISTS address_state TEXT;
ALTER TABLE venues ADD COLUMN IF NOT EXISTS address_zip TEXT;
ALTER TABLE venues ADD COLUMN IF NOT EXISTS buyer_name TEXT;
ALTER TABLE venues ADD COLUMN IF NOT EXISTS contract_signatory TEXT;
ALTER TABLE venues ADD COLUMN IF NOT EXISTS buyer_phone TEXT;
ALTER TABLE venues ADD COLUMN IF NOT EXISTS buyer_email TEXT;
ALTER TABLE venues ADD COLUMN IF NOT EXISTS promoter_address TEXT;
ALTER TABLE venues ADD COLUMN IF NOT EXISTS hero_image_url TEXT;
ALTER TABLE venues ADD COLUMN IF NOT EXISTS hero_image_2_url TEXT;
ALTER TABLE venues ADD COLUMN IF NOT EXISTS ticketing_fee NUMERIC(10,2) DEFAULT 3.00;
ALTER TABLE venues ADD COLUMN IF NOT EXISTS venue_rebate NUMERIC(10,2) DEFAULT 0;
ALTER TABLE venues ADD COLUMN IF NOT EXISTS tax_rate NUMERIC(5,4) DEFAULT 0.095;
ALTER TABLE venues ADD COLUMN IF NOT EXISTS default_radius_distance TEXT;
ALTER TABLE venues ADD COLUMN IF NOT EXISTS default_radius_days_prior INTEGER;
ALTER TABLE venues ADD COLUMN IF NOT EXISTS default_radius_days_after INTEGER;

-- Make color columns nullable (no longer used in UI)
DO $$ BEGIN
  ALTER TABLE venues ALTER COLUMN primary_color DROP NOT NULL;
  ALTER TABLE venues ALTER COLUMN secondary_color DROP NOT NULL;
  ALTER TABLE venues ALTER COLUMN accent_color DROP NOT NULL;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- ═══════════════════════════════════════════
-- 3. EVENTS — ensure columns
-- ═══════════════════════════════════════════
ALTER TABLE events ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS venue_id UUID REFERENCES venues(id);
ALTER TABLE events ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS image_crop_data JSONB;
ALTER TABLE events ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'draft';

-- ═══════════════════════════════════════════
-- 4. ORDERS — ensure columns
-- ═══════════════════════════════════════════
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_phone TEXT;

-- ═══════════════════════════════════════════
-- 5. ARTIST EVENT ASSIGNMENTS
-- ═══════════════════════════════════════════
CREATE TABLE IF NOT EXISTS artist_event_assignments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  artist_id   UUID NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  event_id    UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  comp_limit  INTEGER NOT NULL DEFAULT 4,
  UNIQUE (artist_id, event_id)
);
CREATE INDEX IF NOT EXISTS idx_artist_event ON artist_event_assignments(artist_id, event_id);

-- ═══════════════════════════════════════════
-- 6. GUEST LIST
-- ═══════════════════════════════════════════
CREATE TABLE IF NOT EXISTS guest_list (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id    UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  artist_id   UUID NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  first_name  TEXT NOT NULL,
  last_name   TEXT NOT NULL,
  quantity    INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  notes       TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_guest_list_event  ON guest_list(event_id);
CREATE INDEX IF NOT EXISTS idx_guest_list_artist ON guest_list(artist_id);

-- ═══════════════════════════════════════════
-- 7. CONTRACTS
-- ═══════════════════════════════════════════
CREATE TABLE IF NOT EXISTS contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id UUID REFERENCES artist_offers(id) ON DELETE SET NULL,
  event_id UUID REFERENCES events(id) ON DELETE SET NULL,
  venue_id UUID REFERENCES venues(id) ON DELETE CASCADE,
  source TEXT NOT NULL DEFAULT 'generated' CHECK (source IN ('generated','uploaded')),
  guarantee NUMERIC(10,2),
  deal_type TEXT,
  backend_percentage TEXT,
  bonus_structure TEXT,
  radius_clause TEXT,
  deposit_amount NUMERIC(10,2),
  deposit_paid BOOLEAN DEFAULT false,
  file_url TEXT,
  file_name TEXT,
  version INTEGER DEFAULT 1,
  custom_clauses JSONB,
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
-- 8. SETTLEMENTS
-- ═══════════════════════════════════════════
CREATE TABLE IF NOT EXISTS settlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  offer_id UUID REFERENCES artist_offers(id) ON DELETE SET NULL,
  contract_id UUID REFERENCES contracts(id) ON DELETE SET NULL,
  venue_id UUID REFERENCES venues(id) ON DELETE CASCADE,
  artist_name TEXT,
  guarantee NUMERIC(10,2) DEFAULT 0,
  deal_type TEXT,
  backend_percentage NUMERIC(5,2) DEFAULT 0,
  bonus_structure JSONB,
  radius_clause TEXT,
  ticket_audit JSONB DEFAULT '[]',
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
  deposit_paid NUMERIC(10,2) DEFAULT 0,
  cash_advance NUMERIC(10,2) DEFAULT 0,
  balance_due NUMERIC(10,2) DEFAULT 0,
  bar_revenue NUMERIC(10,2) DEFAULT 0,
  concessions_revenue NUMERIC(10,2) DEFAULT 0,
  merch_commission NUMERIC(10,2) DEFAULT 0,
  ticketing_rebate NUMERIC(10,2) DEFAULT 0,
  parking_revenue NUMERIC(10,2) DEFAULT 0,
  sponsorship_revenue NUMERIC(10,2) DEFAULT 0,
  other_ancillary JSONB DEFAULT '[]',
  venue_total_revenue NUMERIC(10,2) DEFAULT 0,
  venue_net_profit NUMERIC(10,2) DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','finalized')),
  finalized_at TIMESTAMPTZ,
  finalized_by UUID REFERENCES admin_users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_settlements_event ON settlements(event_id);
CREATE INDEX IF NOT EXISTS idx_settlements_venue ON settlements(venue_id);

-- ═══════════════════════════════════════════
-- 9. SETTLEMENT EXPENSES
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
-- 10. SETTLEMENT DEPOSITS
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
-- 11. STRIPE EVENTS (idempotent webhook dedup)
-- ═══════════════════════════════════════════
CREATE TABLE IF NOT EXISTS stripe_events (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  processed_at TIMESTAMPTZ DEFAULT now(),
  payload JSONB
);

-- ═══════════════════════════════════════════
-- 12. SETTLEMENT LEDGER (financial tracking)
-- ═══════════════════════════════════════════
-- Already exists per screenshot, ensure columns
ALTER TABLE settlement_ledger ADD COLUMN IF NOT EXISTS stripe_event_id TEXT;
ALTER TABLE settlement_ledger ADD COLUMN IF NOT EXISTS stripe_session_id TEXT;

-- ═══════════════════════════════════════════
-- 13. VENUE FAQS
-- ═══════════════════════════════════════════
CREATE TABLE IF NOT EXISTS venue_faqs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_venue_faqs_venue ON venue_faqs(venue_id, sort_order);

-- ═══════════════════════════════════════════
-- 14. SIDEBAR PERMISSIONS TABLE (role-based tab visibility)
-- ═══════════════════════════════════════════
CREATE TABLE IF NOT EXISTS sidebar_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID REFERENCES venues(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  tab_key TEXT NOT NULL,
  visible BOOLEAN NOT NULL DEFAULT true,
  UNIQUE(venue_id, role, tab_key)
);
CREATE INDEX IF NOT EXISTS idx_sidebar_perms ON sidebar_permissions(venue_id, role);

-- ═══════════════════════════════════════════
-- 15. RLS POLICIES (DROP + CREATE for idempotency)
-- ═══════════════════════════════════════════

-- artist_event_assignments
ALTER TABLE artist_event_assignments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "organizer_manage_assignments" ON artist_event_assignments;
CREATE POLICY "organizer_manage_assignments" ON artist_event_assignments
  FOR ALL USING (EXISTS (SELECT 1 FROM admin_users au WHERE au.id = auth.uid() AND au.role IN ('owner','venue_admin')));
DROP POLICY IF EXISTS "artist_read_own_assignments" ON artist_event_assignments;
CREATE POLICY "artist_read_own_assignments" ON artist_event_assignments
  FOR SELECT USING (artist_id = auth.uid());

-- guest_list
ALTER TABLE guest_list ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "artist_manage_own_guests" ON guest_list;
CREATE POLICY "artist_manage_own_guests" ON guest_list
  FOR ALL USING (artist_id = auth.uid());
DROP POLICY IF EXISTS "organizer_manage_guests" ON guest_list;
CREATE POLICY "organizer_manage_guests" ON guest_list
  FOR ALL USING (EXISTS (SELECT 1 FROM admin_users au WHERE au.id = auth.uid() AND au.role IN ('owner','venue_admin')));

-- contracts
ALTER TABLE contracts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin_manage_contracts" ON contracts;
CREATE POLICY "admin_manage_contracts" ON contracts
  FOR ALL USING (EXISTS (SELECT 1 FROM admin_users au WHERE au.id = auth.uid()
    AND (au.role IN ('owner','super_admin') OR (au.role = 'venue_admin' AND au.venue_id = contracts.venue_id))));

-- settlements
ALTER TABLE settlements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin_manage_settlements" ON settlements;
CREATE POLICY "admin_manage_settlements" ON settlements
  FOR ALL USING (EXISTS (SELECT 1 FROM admin_users au WHERE au.id = auth.uid()
    AND (au.role IN ('owner','super_admin') OR (au.role = 'venue_admin' AND au.venue_id = settlements.venue_id))));

-- settlement_expenses
ALTER TABLE settlement_expenses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin_manage_settlement_expenses" ON settlement_expenses;
CREATE POLICY "admin_manage_settlement_expenses" ON settlement_expenses
  FOR ALL USING (EXISTS (SELECT 1 FROM settlements s JOIN admin_users au ON au.id = auth.uid()
    WHERE s.id = settlement_expenses.settlement_id
    AND (au.role IN ('owner','super_admin') OR (au.role = 'venue_admin' AND au.venue_id = s.venue_id))));

-- settlement_deposits
ALTER TABLE settlement_deposits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin_manage_settlement_deposits" ON settlement_deposits;
CREATE POLICY "admin_manage_settlement_deposits" ON settlement_deposits
  FOR ALL USING (EXISTS (SELECT 1 FROM settlements s JOIN admin_users au ON au.id = auth.uid()
    WHERE s.id = settlement_deposits.settlement_id
    AND (au.role IN ('owner','super_admin') OR (au.role = 'venue_admin' AND au.venue_id = s.venue_id))));

-- stripe_events
ALTER TABLE stripe_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin_read_stripe_events" ON stripe_events;
CREATE POLICY "admin_read_stripe_events" ON stripe_events
  FOR SELECT USING (EXISTS (SELECT 1 FROM admin_users au WHERE au.id = auth.uid() AND au.role IN ('owner','super_admin','venue_admin')));

-- settlement_ledger
ALTER TABLE settlement_ledger ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin_read_ledger" ON settlement_ledger;
CREATE POLICY "admin_read_ledger" ON settlement_ledger
  FOR SELECT USING (EXISTS (SELECT 1 FROM admin_users au WHERE au.id = auth.uid()
    AND (au.role IN ('owner','super_admin') OR (au.role = 'venue_admin' AND au.venue_id = settlement_ledger.venue_id))));

-- venue_faqs
ALTER TABLE venue_faqs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public_read_faqs" ON venue_faqs;
CREATE POLICY "public_read_faqs" ON venue_faqs FOR SELECT USING (true);
DROP POLICY IF EXISTS "venue_admin_manage_faqs" ON venue_faqs;
CREATE POLICY "venue_admin_manage_faqs" ON venue_faqs
  FOR ALL USING (EXISTS (SELECT 1 FROM admin_users au WHERE au.id = auth.uid()
    AND (au.role IN ('owner','super_admin') OR (au.role = 'venue_admin' AND au.venue_id = venue_faqs.venue_id))));

-- sidebar_permissions
ALTER TABLE sidebar_permissions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin_manage_sidebar_perms" ON sidebar_permissions;
CREATE POLICY "admin_manage_sidebar_perms" ON sidebar_permissions
  FOR ALL USING (EXISTS (SELECT 1 FROM admin_users au WHERE au.id = auth.uid() AND au.role IN ('owner','super_admin','venue_admin')));

-- ═══════════════════════════════════════════
-- DONE. All tables and policies are up to date.
-- ═══════════════════════════════════════════

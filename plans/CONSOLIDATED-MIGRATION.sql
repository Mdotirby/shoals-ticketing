-- ============================================================
-- CONSOLIDATED MIGRATION — All Features in One File
-- Safe to run multiple times (idempotent).
-- Run in Supabase SQL Editor.
--
-- Sections:
--   1. Events table modifications (event_type, booking_status, contacts, capacity)
--   2. Venues table — buyer fields
--   3. Orders table — quantity, phone, fwb, promo, source
--   4. Settlement ledger — facility_fee
--   5. Tickets table — nullable ticket_type_id, FK fix
--   6. Agents table updates
--   7. Promo codes table
--   8. Agent assignments table
--   9. Private event revenue table
--  10. Operational expenses table
--  11. Invoices table
--  12. Invoice payments table
--  13. Private event proposals table
--  14. Rental contracts table
--  15. RLS policies (all tables)
-- ============================================================

-- ════════════════════════════════════════════════════════════
-- 1. EVENTS TABLE MODIFICATIONS
-- ════════════════════════════════════════════════════════════

-- Rename 'ticketed' → 'hard_ticket' in event_type
ALTER TABLE events DROP CONSTRAINT IF EXISTS events_event_type_check;
UPDATE events SET event_type = 'hard_ticket' WHERE event_type = 'ticketed';
ALTER TABLE events ADD CONSTRAINT events_event_type_check
  CHECK (event_type IN ('hard_ticket', 'non_ticketed', 'private'));
ALTER TABLE events ALTER COLUMN event_type SET DEFAULT 'hard_ticket';

-- Booking status
ALTER TABLE events ADD COLUMN IF NOT EXISTS booking_status TEXT DEFAULT 'confirmed';
ALTER TABLE events DROP CONSTRAINT IF EXISTS events_booking_status_check;
ALTER TABLE events ADD CONSTRAINT events_booking_status_check
  CHECK (booking_status IN ('confirmed', 'hold', 'cancelled'));
CREATE INDEX IF NOT EXISTS idx_events_booking_status ON events(booking_status);

-- Contact fields for private event clients
ALTER TABLE events ADD COLUMN IF NOT EXISTS contact_name TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS contact_phone TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS contact_email TEXT;

-- Capacity for house-size calculations
ALTER TABLE events ADD COLUMN IF NOT EXISTS capacity INTEGER;


-- ════════════════════════════════════════════════════════════
-- 2. VENUES TABLE — BUYER FIELDS
-- ════════════════════════════════════════════════════════════

ALTER TABLE venues ADD COLUMN IF NOT EXISTS buyer_name TEXT;
ALTER TABLE venues ADD COLUMN IF NOT EXISTS buyer_phone TEXT;
ALTER TABLE venues ADD COLUMN IF NOT EXISTS buyer_email TEXT;


-- ════════════════════════════════════════════════════════════
-- 3. ORDERS TABLE — QUANTITY, PHONE, FWB, PROMO, SOURCE
-- ════════════════════════════════════════════════════════════

ALTER TABLE orders ADD COLUMN IF NOT EXISTS quantity INTEGER DEFAULT 1;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_phone TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS fwb_opt_in BOOLEAN DEFAULT false;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'online';
CREATE INDEX IF NOT EXISTS idx_orders_source ON orders(source);

-- promo_code_id added after promo_codes table is created (see section 7)


-- ════════════════════════════════════════════════════════════
-- 4. SETTLEMENT LEDGER — FACILITY FEE
-- ════════════════════════════════════════════════════════════

ALTER TABLE settlement_ledger ADD COLUMN IF NOT EXISTS facility_fee NUMERIC(10,2) DEFAULT 0;


-- ════════════════════════════════════════════════════════════
-- 5. TICKETS TABLE — NULLABLE ticket_type_id, FK FIX
-- ════════════════════════════════════════════════════════════

-- Make ticket_type_id nullable (safe if already nullable)
ALTER TABLE tickets ALTER COLUMN ticket_type_id DROP NOT NULL;

-- Drop old FK referencing ticket_types (if it exists)
ALTER TABLE tickets DROP CONSTRAINT IF EXISTS tickets_ticket_type_id_fkey;

-- Re-add FK referencing ticket_tiers instead
-- Uses NOT VALID so existing rows aren't blocked; validate separately if needed.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'tickets_ticket_type_id_fkey'
      AND table_name = 'tickets'
  ) THEN
    ALTER TABLE tickets
      ADD CONSTRAINT tickets_ticket_type_id_fkey
      FOREIGN KEY (ticket_type_id) REFERENCES ticket_tiers(id) NOT VALID;
  END IF;
END $$;


-- ════════════════════════════════════════════════════════════
-- 6. AGENTS TABLE UPDATES
-- ════════════════════════════════════════════════════════════

ALTER TABLE agents ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES admin_users(id);
ALTER TABLE agents ADD COLUMN IF NOT EXISTS first_name TEXT;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS last_name TEXT;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS email TEXT;

-- Backfill: split agent_name into first_name/last_name where missing
UPDATE agents
SET first_name = split_part(agent_name, ' ', 1),
    last_name  = CASE
      WHEN position(' ' IN agent_name) > 0
      THEN substring(agent_name FROM position(' ' IN agent_name) + 1)
      ELSE ''
    END
WHERE first_name IS NULL AND agent_name IS NOT NULL;

-- Backfill email from agent_email
UPDATE agents SET email = agent_email WHERE email IS NULL AND agent_email IS NOT NULL;

-- Unique constraint on email (non-null only)
CREATE UNIQUE INDEX IF NOT EXISTS idx_agents_email_unique ON agents(email) WHERE email IS NOT NULL;


-- ════════════════════════════════════════════════════════════
-- 7. PROMO CODES TABLE
-- ════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS promo_codes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id        UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  code            TEXT NOT NULL,
  discount_type   TEXT NOT NULL DEFAULT 'fixed',
  discount_value  NUMERIC(10,2) NOT NULL,
  max_uses        INTEGER,
  current_uses    INTEGER DEFAULT 0,
  active          BOOLEAN DEFAULT true,
  expires_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE(event_id, code)
);

CREATE INDEX IF NOT EXISTS idx_promo_codes_event_id ON promo_codes(event_id);
CREATE INDEX IF NOT EXISTS idx_promo_codes_code ON promo_codes(code);
CREATE INDEX IF NOT EXISTS idx_promo_codes_active ON promo_codes(active) WHERE active = true;

-- Now add the FK from orders → promo_codes (deferred to here so table exists)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS promo_code_id UUID REFERENCES promo_codes(id);
CREATE INDEX IF NOT EXISTS idx_orders_promo_code_id ON orders(promo_code_id);


-- ════════════════════════════════════════════════════════════
-- 8. AGENT ASSIGNMENTS TABLE
-- ════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS agent_assignments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id    UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  event_id    UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE(agent_id, event_id)
);

CREATE INDEX IF NOT EXISTS idx_agent_assignments_agent ON agent_assignments(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_assignments_event ON agent_assignments(event_id);


-- ════════════════════════════════════════════════════════════
-- 9. PRIVATE EVENT REVENUE TABLE
-- ════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS private_event_revenue (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id      UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  venue_id      UUID NOT NULL REFERENCES venues(id),
  category      TEXT NOT NULL
                CHECK (category IN (
                  'room_rental', 'production', 'food_beverage',
                  'setup', 'labor', 'other'
                )),
  description   TEXT,
  amount        NUMERIC(10,2) NOT NULL DEFAULT 0,
  sort_order    INTEGER DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_prv_rev_event ON private_event_revenue(event_id);
CREATE INDEX IF NOT EXISTS idx_prv_rev_venue ON private_event_revenue(venue_id);


-- ════════════════════════════════════════════════════════════
-- 10. OPERATIONAL EXPENSES TABLE
-- ════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS operational_expenses (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id      UUID NOT NULL REFERENCES venues(id),
  event_id      UUID REFERENCES events(id),
  category      TEXT NOT NULL
                CHECK (category IN (
                  'staffing', 'security', 'production_av', 'marketing',
                  'ticketing_fees', 'merchant_processing', 'insurance',
                  'artist_guarantees', 'vendor_services', 'facility', 'other'
                )),
  description   TEXT NOT NULL,
  amount        NUMERIC(10,2) NOT NULL,
  expense_date  DATE NOT NULL,
  receipt_url   TEXT,
  notes         TEXT,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_opex_venue ON operational_expenses(venue_id);
CREATE INDEX IF NOT EXISTS idx_opex_event ON operational_expenses(event_id);
CREATE INDEX IF NOT EXISTS idx_opex_date ON operational_expenses(expense_date);
CREATE INDEX IF NOT EXISTS idx_opex_category ON operational_expenses(category);


-- ════════════════════════════════════════════════════════════
-- 11. INVOICES TABLE
-- ════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS invoices (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number        TEXT NOT NULL,
  event_id              UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  venue_id              UUID NOT NULL REFERENCES venues(id),

  -- Client info
  client_name           TEXT NOT NULL,
  client_email          TEXT,
  client_phone          TEXT,
  client_company        TEXT,
  client_address        TEXT,

  -- Line items
  line_items            JSONB NOT NULL DEFAULT '[]',
  subtotal              NUMERIC(10,2) DEFAULT 0,
  tax_rate              NUMERIC(5,4) DEFAULT 0,
  tax_amount            NUMERIC(10,2) DEFAULT 0,
  total                 NUMERIC(10,2) DEFAULT 0,

  -- Payment tracking
  amount_paid           NUMERIC(10,2) DEFAULT 0,
  balance_due           NUMERIC(10,2) DEFAULT 0,
  due_date              DATE,
  status                TEXT DEFAULT 'draft'
                        CHECK (status IN ('draft', 'sent', 'partial', 'paid', 'overdue', 'void')),

  -- Stripe
  stripe_payment_link   TEXT,
  stripe_invoice_id     TEXT,

  -- PDF
  pdf_url               TEXT,
  sent_at               TIMESTAMPTZ,
  paid_at               TIMESTAMPTZ,

  created_at            TIMESTAMPTZ DEFAULT now(),
  updated_at            TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_invoice_number_venue ON invoices(invoice_number, venue_id);
CREATE INDEX IF NOT EXISTS idx_invoice_event ON invoices(event_id);
CREATE INDEX IF NOT EXISTS idx_invoice_venue ON invoices(venue_id);
CREATE INDEX IF NOT EXISTS idx_invoice_status ON invoices(status);


-- ════════════════════════════════════════════════════════════
-- 12. INVOICE PAYMENTS TABLE
-- ════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS invoice_payments (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id                UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  venue_id                  UUID NOT NULL REFERENCES venues(id),

  amount                    NUMERIC(10,2) NOT NULL,
  payment_method            TEXT DEFAULT 'stripe'
                            CHECK (payment_method IN ('stripe', 'check', 'cash', 'wire', 'other')),
  stripe_payment_intent_id  TEXT,
  stripe_charge_id          TEXT,

  type                      TEXT DEFAULT 'payment'
                            CHECK (type IN ('payment', 'deposit', 'refund')),
  notes                     TEXT,
  received_at               TIMESTAMPTZ DEFAULT now(),
  created_at                TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inv_payment_invoice ON invoice_payments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_inv_payment_venue ON invoice_payments(venue_id);


-- ════════════════════════════════════════════════════════════
-- 13. PRIVATE EVENT PROPOSALS TABLE
-- ════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS private_event_proposals (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_number     TEXT NOT NULL,
  event_id            UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  venue_id            UUID NOT NULL REFERENCES venues(id),

  -- Client info
  client_name         TEXT NOT NULL,
  client_email        TEXT,
  client_phone        TEXT,
  client_company      TEXT,

  -- Line items & totals
  line_items          JSONB NOT NULL DEFAULT '[]',
  subtotal            NUMERIC(10,2) DEFAULT 0,
  tax_rate            NUMERIC(5,4) DEFAULT 0,
  tax_amount          NUMERIC(10,2) DEFAULT 0,
  total               NUMERIC(10,2) DEFAULT 0,

  -- Validity
  valid_until         DATE,

  -- Content
  notes               TEXT DEFAULT '',
  terms               TEXT DEFAULT '',

  -- Status
  status              TEXT DEFAULT 'draft'
                      CHECK (status IN ('draft', 'sent', 'accepted', 'rejected', 'expired')),

  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_proposal_number_venue ON private_event_proposals(proposal_number, venue_id);
CREATE INDEX IF NOT EXISTS idx_proposal_event ON private_event_proposals(event_id);
CREATE INDEX IF NOT EXISTS idx_proposal_venue ON private_event_proposals(venue_id);


-- ════════════════════════════════════════════════════════════
-- 14. RENTAL CONTRACTS TABLE
-- ════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS rental_contracts (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_number       TEXT NOT NULL,
  event_id              UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  venue_id              UUID NOT NULL REFERENCES venues(id),

  -- Client info
  client_name           TEXT NOT NULL,
  client_email          TEXT,
  client_phone          TEXT,
  client_company        TEXT,
  client_address        TEXT,

  -- Event details
  event_name            TEXT,
  event_date            TEXT,
  event_time_start      TEXT,
  event_time_end        TEXT,
  event_space           TEXT DEFAULT 'Main Venue',
  expected_guests       INTEGER,

  -- Pricing
  line_items            JSONB NOT NULL DEFAULT '[]',
  subtotal              NUMERIC(10,2) DEFAULT 0,
  tax_rate              NUMERIC(5,4) DEFAULT 0,
  tax_amount            NUMERIC(10,2) DEFAULT 0,
  total                 NUMERIC(10,2) DEFAULT 0,

  -- Deposit
  deposit_percent       NUMERIC(5,2) DEFAULT 25,
  deposit_amount        NUMERIC(10,2) DEFAULT 0,
  deposit_due_date      DATE,

  -- Terms
  payment_schedule      TEXT DEFAULT '',
  cancellation_policy   TEXT DEFAULT '',
  insurance_required    BOOLEAN DEFAULT false,
  insurance_details     TEXT DEFAULT '',
  additional_terms      TEXT DEFAULT '',

  -- Status
  status                TEXT DEFAULT 'draft'
                        CHECK (status IN ('draft', 'sent', 'active', 'completed', 'cancelled')),

  created_at            TIMESTAMPTZ DEFAULT now(),
  updated_at            TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_rc_number_venue ON rental_contracts(contract_number, venue_id);
CREATE INDEX IF NOT EXISTS idx_rc_event ON rental_contracts(event_id);
CREATE INDEX IF NOT EXISTS idx_rc_venue ON rental_contracts(venue_id);


-- ════════════════════════════════════════════════════════════
-- 15. RLS POLICIES (all new tables)
-- ════════════════════════════════════════════════════════════

-- ── promo_codes ──
ALTER TABLE promo_codes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access on promo_codes" ON promo_codes;
CREATE POLICY "Service role full access on promo_codes"
  ON promo_codes FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public can validate active promo codes" ON promo_codes;
CREATE POLICY "Public can validate active promo codes"
  ON promo_codes FOR SELECT USING (active = true);

-- ── agent_assignments ──
ALTER TABLE agent_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_manage_agent_assignments" ON agent_assignments;
CREATE POLICY "admin_manage_agent_assignments"
  ON agent_assignments FOR ALL USING (true);

-- ── private_event_revenue ──
ALTER TABLE private_event_revenue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all for service role" ON private_event_revenue;
CREATE POLICY "Allow all for service role"
  ON private_event_revenue FOR ALL USING (true) WITH CHECK (true);

-- ── operational_expenses ──
ALTER TABLE operational_expenses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all for service role" ON operational_expenses;
CREATE POLICY "Allow all for service role"
  ON operational_expenses FOR ALL USING (true) WITH CHECK (true);

-- ── invoices ──
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all for service role" ON invoices;
CREATE POLICY "Allow all for service role"
  ON invoices FOR ALL USING (true) WITH CHECK (true);

-- ── invoice_payments ──
ALTER TABLE invoice_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all for service role" ON invoice_payments;
CREATE POLICY "Allow all for service role"
  ON invoice_payments FOR ALL USING (true) WITH CHECK (true);

-- ── private_event_proposals ──
ALTER TABLE private_event_proposals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all for service role" ON private_event_proposals;
CREATE POLICY "Allow all for service role"
  ON private_event_proposals FOR ALL USING (true) WITH CHECK (true);

-- ── rental_contracts ──
ALTER TABLE rental_contracts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all for service role" ON rental_contracts;
CREATE POLICY "Allow all for service role"
  ON rental_contracts FOR ALL USING (true) WITH CHECK (true);


-- ════════════════════════════════════════════════════════════
-- ✅ DONE — Consolidated migration complete.
--
-- Verify with:
--   SELECT table_name FROM information_schema.tables
--   WHERE table_schema = 'public'
--   ORDER BY table_name;
-- ════════════════════════════════════════════════════════════

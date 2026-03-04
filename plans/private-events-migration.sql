-- ============================================================
-- Private Events & Reports — Phase 1 Migration
-- Run this in Supabase SQL Editor.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. Modify events table
-- ────────────────────────────────────────────────────────────

-- Rename 'ticketed' → 'hard_ticket' in event_type
-- First drop the old CHECK constraint (name may vary)
ALTER TABLE events DROP CONSTRAINT IF EXISTS events_event_type_check;

-- Update existing rows
UPDATE events SET event_type = 'hard_ticket' WHERE event_type = 'ticketed';

-- Re-add CHECK with new values
ALTER TABLE events ADD CONSTRAINT events_event_type_check
  CHECK (event_type IN ('hard_ticket', 'non_ticketed', 'private'));

-- Default to 'hard_ticket'
ALTER TABLE events ALTER COLUMN event_type SET DEFAULT 'hard_ticket';

-- Add booking_status column
ALTER TABLE events ADD COLUMN IF NOT EXISTS booking_status TEXT DEFAULT 'confirmed';
ALTER TABLE events DROP CONSTRAINT IF EXISTS events_booking_status_check;
ALTER TABLE events ADD CONSTRAINT events_booking_status_check
  CHECK (booking_status IN ('confirmed', 'hold', 'cancelled'));

-- Add contact fields for private event clients
ALTER TABLE events ADD COLUMN IF NOT EXISTS contact_name TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS contact_phone TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS contact_email TEXT;

-- Add capacity for house-size calculations
ALTER TABLE events ADD COLUMN IF NOT EXISTS capacity INTEGER;

-- Index on booking_status
CREATE INDEX IF NOT EXISTS idx_events_booking_status ON events(booking_status);


-- ────────────────────────────────────────────────────────────
-- 2. Add facility_fee to settlement_ledger
-- ────────────────────────────────────────────────────────────

ALTER TABLE settlement_ledger ADD COLUMN IF NOT EXISTS facility_fee NUMERIC(10,2) DEFAULT 0;


-- ────────────────────────────────────────────────────────────
-- 3. Create private_event_revenue table
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS private_event_revenue (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id         UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  venue_id         UUID NOT NULL REFERENCES venues(id),
  category         TEXT NOT NULL
                   CHECK (category IN ('room_rental', 'production', 'food_beverage', 'setup', 'labor', 'other')),
  description      TEXT,
  amount           NUMERIC(10,2) NOT NULL DEFAULT 0,
  sort_order       INTEGER DEFAULT 0,
  created_at       TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_prv_rev_event ON private_event_revenue(event_id);
CREATE INDEX IF NOT EXISTS idx_prv_rev_venue ON private_event_revenue(venue_id);


-- ────────────────────────────────────────────────────────────
-- 4. Create operational_expenses table
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS operational_expenses (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id         UUID NOT NULL REFERENCES venues(id),
  event_id         UUID REFERENCES events(id),
  category         TEXT NOT NULL
                   CHECK (category IN (
                     'staffing', 'security', 'production_av', 'marketing',
                     'ticketing_fees', 'merchant_processing', 'insurance',
                     'artist_guarantees', 'vendor_services', 'facility', 'other'
                   )),
  description      TEXT NOT NULL,
  amount           NUMERIC(10,2) NOT NULL,
  expense_date     DATE NOT NULL,
  receipt_url      TEXT,
  notes            TEXT,
  created_at       TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_opex_venue ON operational_expenses(venue_id);
CREATE INDEX IF NOT EXISTS idx_opex_event ON operational_expenses(event_id);
CREATE INDEX IF NOT EXISTS idx_opex_date ON operational_expenses(expense_date);
CREATE INDEX IF NOT EXISTS idx_opex_category ON operational_expenses(category);


-- ────────────────────────────────────────────────────────────
-- 5. Create invoices table
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS invoices (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number      TEXT NOT NULL,
  event_id            UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  venue_id            UUID NOT NULL REFERENCES venues(id),

  -- Client info
  client_name         TEXT NOT NULL,
  client_email        TEXT,
  client_phone        TEXT,
  client_company      TEXT,
  client_address      TEXT,

  -- Line items
  line_items          JSONB NOT NULL DEFAULT '[]',
  subtotal            NUMERIC(10,2) DEFAULT 0,
  tax_rate            NUMERIC(5,4) DEFAULT 0,
  tax_amount          NUMERIC(10,2) DEFAULT 0,
  total               NUMERIC(10,2) DEFAULT 0,

  -- Payment tracking
  amount_paid         NUMERIC(10,2) DEFAULT 0,
  balance_due         NUMERIC(10,2) DEFAULT 0,
  due_date            DATE,
  status              TEXT DEFAULT 'draft'
                      CHECK (status IN ('draft', 'sent', 'partial', 'paid', 'overdue', 'void')),

  -- Stripe
  stripe_payment_link TEXT,
  stripe_invoice_id   TEXT,

  -- PDF
  pdf_url             TEXT,
  sent_at             TIMESTAMPTZ,
  paid_at             TIMESTAMPTZ,

  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now()
);

-- Unique invoice number per venue
CREATE UNIQUE INDEX IF NOT EXISTS idx_invoice_number_venue ON invoices(invoice_number, venue_id);
CREATE INDEX IF NOT EXISTS idx_invoice_event ON invoices(event_id);
CREATE INDEX IF NOT EXISTS idx_invoice_venue ON invoices(venue_id);
CREATE INDEX IF NOT EXISTS idx_invoice_status ON invoices(status);


-- ────────────────────────────────────────────────────────────
-- 6. Create invoice_payments table
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS invoice_payments (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id               UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  venue_id                 UUID NOT NULL REFERENCES venues(id),

  amount                   NUMERIC(10,2) NOT NULL,
  payment_method           TEXT DEFAULT 'stripe'
                           CHECK (payment_method IN ('stripe', 'check', 'cash', 'wire', 'other')),
  stripe_payment_intent_id TEXT,
  stripe_charge_id         TEXT,

  type                     TEXT DEFAULT 'payment'
                           CHECK (type IN ('payment', 'deposit', 'refund')),
  notes                    TEXT,
  received_at              TIMESTAMPTZ DEFAULT now(),
  created_at               TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inv_payment_invoice ON invoice_payments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_inv_payment_venue ON invoice_payments(venue_id);


-- ────────────────────────────────────────────────────────────
-- 7. RLS Policies
-- ────────────────────────────────────────────────────────────

-- Enable RLS on new tables
ALTER TABLE private_event_revenue ENABLE ROW LEVEL SECURITY;
ALTER TABLE operational_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_payments ENABLE ROW LEVEL SECURITY;

-- private_event_revenue: allow all for service_role (API uses admin client)
CREATE POLICY "Allow all for service role" ON private_event_revenue
  FOR ALL USING (true) WITH CHECK (true);

-- operational_expenses: allow all for service_role
CREATE POLICY "Allow all for service role" ON operational_expenses
  FOR ALL USING (true) WITH CHECK (true);

-- invoices: allow all for service_role
CREATE POLICY "Allow all for service role" ON invoices
  FOR ALL USING (true) WITH CHECK (true);

-- invoice_payments: allow all for service_role
CREATE POLICY "Allow all for service role" ON invoice_payments
  FOR ALL USING (true) WITH CHECK (true);


-- ────────────────────────────────────────────────────────────
-- Done! Verify with:
--   SELECT column_name, data_type FROM information_schema.columns
--   WHERE table_name = 'events' ORDER BY ordinal_position;
-- ────────────────────────────────────────────────────────────

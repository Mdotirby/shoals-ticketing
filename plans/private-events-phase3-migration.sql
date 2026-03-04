-- ============================================================
-- Private Events Phase 3 — Proposals & Rental Contracts
-- Run this in Supabase SQL Editor AFTER private-events-migration.sql
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. Create private_event_proposals table
-- ────────────────────────────────────────────────────────────

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

-- ────────────────────────────────────────────────────────────
-- 2. Create rental_contracts table
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS rental_contracts (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_number     TEXT NOT NULL,
  event_id            UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  venue_id            UUID NOT NULL REFERENCES venues(id),

  -- Client info
  client_name         TEXT NOT NULL,
  client_email        TEXT,
  client_phone        TEXT,
  client_company      TEXT,
  client_address      TEXT,

  -- Event details
  event_name          TEXT,
  event_date          TEXT,
  event_time_start    TEXT,
  event_time_end      TEXT,
  event_space         TEXT DEFAULT 'Main Venue',
  expected_guests     INTEGER,

  -- Pricing
  line_items          JSONB NOT NULL DEFAULT '[]',
  subtotal            NUMERIC(10,2) DEFAULT 0,
  tax_rate            NUMERIC(5,4) DEFAULT 0,
  tax_amount          NUMERIC(10,2) DEFAULT 0,
  total               NUMERIC(10,2) DEFAULT 0,

  -- Deposit
  deposit_percent     NUMERIC(5,2) DEFAULT 25,
  deposit_amount      NUMERIC(10,2) DEFAULT 0,
  deposit_due_date    DATE,

  -- Terms
  payment_schedule    TEXT DEFAULT '',
  cancellation_policy TEXT DEFAULT '',
  insurance_required  BOOLEAN DEFAULT false,
  insurance_details   TEXT DEFAULT '',
  additional_terms    TEXT DEFAULT '',

  -- Status
  status              TEXT DEFAULT 'draft'
                      CHECK (status IN ('draft', 'sent', 'active', 'completed', 'cancelled')),

  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_rc_number_venue ON rental_contracts(contract_number, venue_id);
CREATE INDEX IF NOT EXISTS idx_rc_event ON rental_contracts(event_id);
CREATE INDEX IF NOT EXISTS idx_rc_venue ON rental_contracts(venue_id);

-- ────────────────────────────────────────────────────────────
-- 3. RLS Policies
-- ────────────────────────────────────────────────────────────

ALTER TABLE private_event_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE rental_contracts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all for service role" ON private_event_proposals
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all for service role" ON rental_contracts
  FOR ALL USING (true) WITH CHECK (true);

-- ────────────────────────────────────────────────────────────
-- Done!
-- ────────────────────────────────────────────────────────────

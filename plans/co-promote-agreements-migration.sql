-- ═══════════════════════════════════════════════════════════════════════════
-- Co-Promote Agreements Migration
--
-- A Co-Promote Agreement is a contract between us (as a promoter/buyer going
-- into someone else's room) and a third-party venue (who provides the space
-- and takes a cut of ticket revenue).
--
-- This is DIFFERENT from the existing `contracts` table, which is for
-- artist-to-venue deals where WE are the venue.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS co_promote_agreements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Linked entities (both optional)
  event_id       UUID REFERENCES events(id) ON DELETE SET NULL,
  our_venue_id   UUID REFERENCES venues(id) ON DELETE SET NULL,

  -- Agreement metadata
  agreement_number TEXT NOT NULL,
  agreement_date   DATE NOT NULL DEFAULT CURRENT_DATE,
  status           TEXT NOT NULL DEFAULT 'draft'
                   CHECK (status IN ('draft','sent','signed','void')),

  -- ─── Party A: Buyer / Promoter (US) ───
  buyer_company_name    TEXT NOT NULL,
  buyer_signatory_name  TEXT,
  buyer_signatory_title TEXT,
  buyer_email           TEXT,
  buyer_phone           TEXT,
  buyer_address         TEXT,

  -- ─── Party B: Partner Venue (THEM) ───
  partner_venue_name    TEXT NOT NULL,
  partner_venue_address TEXT,
  partner_contact_name  TEXT,
  partner_contact_title TEXT,
  partner_email         TEXT,
  partner_phone         TEXT,
  partner_tax_id        TEXT,

  -- ─── Event Details ───
  event_name         TEXT,
  event_date         DATE NOT NULL,
  event_load_in_time TEXT,
  event_doors_time   TEXT,
  event_show_time    TEXT,
  event_curfew       TEXT,
  expected_capacity  INTEGER,

  -- ─── Deal Structure ───
  deal_structure TEXT NOT NULL DEFAULT 'rev_share_after_tax'
                 CHECK (deal_structure IN (
                   'rev_share_gross',       -- % of gross before any deductions
                   'rev_share_after_tax',   -- % of gross after sales tax, before expenses (common)
                   'rev_share_net',         -- % of net after all expenses
                   'flat_rent',             -- flat rental fee, promoter keeps all upside
                   'rent_plus_rev_share'    -- flat rent + % rev share
                 )),

  -- Percentages (both should sum to 100 for rev share deals)
  buyer_percentage NUMERIC(5,2),   -- e.g. 80.00
  venue_percentage NUMERIC(5,2),   -- e.g. 20.00

  -- Flat rent (for flat_rent or rent_plus_rev_share)
  flat_rent_amount NUMERIC(10,2) DEFAULT 0,

  -- What's included in the split base (defaults are the most common config)
  include_ticketing_fees BOOLEAN DEFAULT FALSE,
  include_facility_fees  BOOLEAN DEFAULT FALSE,
  include_comps          BOOLEAN DEFAULT FALSE,

  -- ─── Deposit / Advance ───
  deposit_amount  NUMERIC(10,2) DEFAULT 0,
  deposit_due_date DATE,
  deposit_paid    BOOLEAN DEFAULT FALSE,
  deposit_paid_at TIMESTAMPTZ,

  -- ─── Venue-Provided Services ───
  venue_provides_staff       BOOLEAN DEFAULT FALSE,
  venue_provides_sound       BOOLEAN DEFAULT FALSE,
  venue_provides_lights      BOOLEAN DEFAULT FALSE,
  venue_provides_security    BOOLEAN DEFAULT FALSE,
  venue_provides_bar         BOOLEAN DEFAULT TRUE,

  venue_bar_revenue_split    TEXT,                -- e.g. "100% venue" or "80/20"
  venue_merch_fee_pct        NUMERIC(5,2) DEFAULT 0,  -- venue takes X% of merch

  -- ─── Settlement Terms ───
  settlement_timing   TEXT DEFAULT 'night_of_show',  -- 'night_of_show' | 'net_7' | 'net_14' | 'net_30'
  settlement_currency TEXT DEFAULT 'USD',

  -- ─── Terms & Clauses ───
  cancellation_policy  TEXT,
  force_majeure_clause TEXT,
  marketing_rights     TEXT,
  radius_clause        TEXT,

  -- Custom clauses stored as JSONB array of { title, body }
  custom_clauses   JSONB DEFAULT '[]'::jsonb,
  additional_terms TEXT,

  -- ─── Document Storage ───
  file_url  TEXT,                  -- uploaded signed PDF
  file_name TEXT,

  -- ─── Signatures ───
  buyer_signed_at    TIMESTAMPTZ,
  buyer_signed_by    TEXT,
  venue_signed_at    TIMESTAMPTZ,
  venue_signed_by    TEXT,

  -- ─── Timestamps ───
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Indexes ───────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_co_promote_event_id
  ON co_promote_agreements (event_id);

CREATE INDEX IF NOT EXISTS idx_co_promote_our_venue_id
  ON co_promote_agreements (our_venue_id);

CREATE INDEX IF NOT EXISTS idx_co_promote_status
  ON co_promote_agreements (status);

CREATE INDEX IF NOT EXISTS idx_co_promote_event_date
  ON co_promote_agreements (event_date);

-- ─── RLS ────────────────────────────────────────────────────────────────────
ALTER TABLE co_promote_agreements ENABLE ROW LEVEL SECURITY;

-- Admins (owner, super_admin, full_admin) can manage all
DROP POLICY IF EXISTS "admin_manage_co_promote" ON co_promote_agreements;
CREATE POLICY "admin_manage_co_promote" ON co_promote_agreements
  FOR ALL USING (
    auth.uid() IN (
      SELECT id FROM admin_users
      WHERE role IN ('owner', 'super_admin', 'full_admin')
    )
  );

-- Venue admins can manage their own venue's agreements
DROP POLICY IF EXISTS "venue_admin_manage_co_promote" ON co_promote_agreements;
CREATE POLICY "venue_admin_manage_co_promote" ON co_promote_agreements
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM admin_users a
      WHERE a.id = auth.uid()
        AND a.role = 'venue_admin'
        AND a.venue_id = co_promote_agreements.our_venue_id
    )
  );

-- Service role bypass (for API routes using service key)
DROP POLICY IF EXISTS "service_insert_co_promote" ON co_promote_agreements;
CREATE POLICY "service_insert_co_promote" ON co_promote_agreements
  FOR INSERT WITH CHECK (true);

-- ─── updated_at trigger ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION trigger_co_promote_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS co_promote_updated_at ON co_promote_agreements;
CREATE TRIGGER co_promote_updated_at
  BEFORE UPDATE ON co_promote_agreements
  FOR EACH ROW
  EXECUTE FUNCTION trigger_co_promote_updated_at();

-- Sponsors & Partners expansion
-- Adds bio, homepage display flag, active flag, and contact fields to sponsors.
-- Creates sponsor_packages table for structured package/invoice management.

-- ── Expand sponsors table ──────────────────────────────────────────────────
ALTER TABLE sponsors
  ADD COLUMN IF NOT EXISTS bio               TEXT,
  ADD COLUMN IF NOT EXISTS display_on_homepage BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_active         BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS contact_name      TEXT,
  ADD COLUMN IF NOT EXISTS contact_email     TEXT;

CREATE INDEX IF NOT EXISTS idx_sponsors_homepage
  ON sponsors(display_on_homepage) WHERE display_on_homepage = true;

CREATE INDEX IF NOT EXISTS idx_sponsors_active
  ON sponsors(is_active) WHERE is_active = true;

-- ── Sponsor packages table ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sponsor_packages (
  id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  sponsor_id   UUID         NOT NULL REFERENCES sponsors(id) ON DELETE CASCADE,
  venue_id     UUID         REFERENCES venues(id),
  name         TEXT         NOT NULL,
  description  TEXT,
  deliverables JSONB        NOT NULL DEFAULT '[]',
  price        NUMERIC(10,2) NOT NULL DEFAULT 0,
  term         TEXT         NOT NULL DEFAULT 'Annual'
                            CHECK (term IN ('Annual','Per Event','One-Time','Monthly','Custom')),
  start_date   DATE,
  end_date     DATE,
  status       TEXT         NOT NULL DEFAULT 'active'
                            CHECK (status IN ('active','pending','expired','cancelled')),
  notes        TEXT,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sponsor_packages_sponsor ON sponsor_packages(sponsor_id);
CREATE INDEX IF NOT EXISTS idx_sponsor_packages_status  ON sponsor_packages(status);

-- RLS: public read, service/admin write
ALTER TABLE sponsor_packages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sponsor_packages_public_read"
  ON sponsor_packages FOR SELECT USING (true);

CREATE POLICY "sponsor_packages_service_write"
  ON sponsor_packages FOR ALL USING (auth.role() = 'service_role');

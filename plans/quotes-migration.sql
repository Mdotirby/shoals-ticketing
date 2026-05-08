-- Quote/Estimate Builder: expand private_event_proposals for full quote workflow
-- Adds deposit terms, payment schedule, cancellation policy, and manual acceptance tracking

ALTER TABLE private_event_proposals
  ADD COLUMN IF NOT EXISTS version          INTEGER       NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS deposit_pct      NUMERIC(5,2)  DEFAULT 0,
  ADD COLUMN IF NOT EXISTS deposit_amount   NUMERIC(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS deposit_due      TEXT          DEFAULT 'On Acceptance',
  ADD COLUMN IF NOT EXISTS balance_due_date TEXT          DEFAULT '30 Days Before Event',
  ADD COLUMN IF NOT EXISTS cancellation_policy TEXT,
  ADD COLUMN IF NOT EXISTS accepted_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS accepted_by      TEXT,
  ADD COLUMN IF NOT EXISTS declined_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS declined_reason  TEXT,
  ADD COLUMN IF NOT EXISTS event_type_label TEXT;

-- Index for fast status lookups per event
CREATE INDEX IF NOT EXISTS idx_proposals_event_status
  ON private_event_proposals(event_id, status);

-- ============================================================
-- Email Sends — Standalone System Columns
-- The email_sends table already exists (plans/marketing-migration.sql,
-- VenueCore's email-campaigns engine) as a per-recipient log tied to
-- email_campaigns. The standalone system logs one row per broadcast
-- send instead of one per recipient, so recipient_email has to become
-- optional, and a few columns need adding. resend_message_id (already
-- on the table) doubles as the broadcast id — no separate column for it.
-- Run in Supabase SQL Editor.
-- ============================================================

ALTER TABLE email_sends ALTER COLUMN recipient_email DROP NOT NULL;

ALTER TABLE email_sends ADD COLUMN IF NOT EXISTS trigger_type TEXT;
ALTER TABLE email_sends ADD COLUMN IF NOT EXISTS event_id UUID REFERENCES events(id) ON DELETE SET NULL;
ALTER TABLE email_sends ADD COLUMN IF NOT EXISTS resend_template_id TEXT;
ALTER TABLE email_sends ADD COLUMN IF NOT EXISTS resend_segment_id TEXT;
ALTER TABLE email_sends ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_email_sends_trigger_type ON email_sends(trigger_type);
CREATE INDEX IF NOT EXISTS idx_email_sends_event_id ON email_sends(event_id);

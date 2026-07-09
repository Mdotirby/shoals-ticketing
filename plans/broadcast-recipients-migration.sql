-- ============================================================
-- Broadcast Recipients — per-recipient detail for standalone-emails sends
--
-- email_sends (see email-sends-migration.sql) stores ONE row per broadcast
-- send action, with resend_message_id holding the *broadcast* id. Resend's
-- webhook events for opens/clicks fire per-recipient with a *message* id,
-- a different id entirely — so broadcast-level rows can never match a
-- webhook event on their own. This table holds the per-recipient detail,
-- populated lazily by the webhook itself (see the new third branch in
-- app/api/webhooks/resend/route.ts) rather than pre-seeded at send time,
-- since Resend does not return a synchronous per-recipient message-id list
-- when a broadcast is created.
-- Run in Supabase SQL Editor.
-- ============================================================

CREATE TABLE IF NOT EXISTS broadcast_recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email_send_id UUID NOT NULL REFERENCES email_sends(id) ON DELETE CASCADE,
  recipient_email TEXT NOT NULL,
  resend_message_id TEXT,
  status TEXT DEFAULT 'sent' CHECK (status IN (
    'sent','delivered','opened','clicked','bounced','complained'
  )),
  opened_at TIMESTAMPTZ,
  clicked_at TIMESTAMPTZ,
  bounced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_broadcast_recipients_send ON broadcast_recipients(email_send_id);
CREATE INDEX IF NOT EXISTS idx_broadcast_recipients_message ON broadcast_recipients(resend_message_id);
CREATE INDEX IF NOT EXISTS idx_broadcast_recipients_email ON broadcast_recipients(recipient_email);
CREATE UNIQUE INDEX IF NOT EXISTS idx_broadcast_recipients_send_email ON broadcast_recipients(email_send_id, recipient_email);

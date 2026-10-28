-- A record of every message sent to a show's ticket holders
--
-- There was no way to email the people who bought tickets to one show. The
-- broadcast tools target a single global newsletter segment; the only
-- per-buyer email was a one-order ticket resend. So "doors moved to 7" meant
-- exporting the orders and pasting addresses into a mail client.
--
-- This table is the audit trail for the feature that closes that gap. It
-- exists for three reasons, in order of how often they matter:
--
--   1. "Did I already tell them?" A send to 225 people is invisible
--      afterwards without a record of it, and the second copy is worse than
--      the first.
--   2. What was actually said, months later, when somebody says they were
--      never told.
--   3. Who sent it.
--
-- The body is kept verbatim. Nothing here sends anything; rows are written by
-- the route after Resend has accepted the batch.
--
-- Run in the Supabase SQL editor. Safe to re-run.

CREATE TABLE IF NOT EXISTS event_emails (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id        uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  subject         text NOT NULL,
  body            text NOT NULL,
  -- How many distinct addresses the send went to, and how it went. Recorded
  -- rather than recomputed: the audience changes as more tickets sell, so
  -- "who got this" is only answerable at the moment it was sent.
  recipient_count integer NOT NULL DEFAULT 0,
  failed_count    integer NOT NULL DEFAULT 0,
  -- Paid orders with no address on them at the time. Usually box office cash.
  unreachable_count integer NOT NULL DEFAULT 0,
  included_refunded boolean NOT NULL DEFAULT false,
  sent_by         text,
  sent_at         timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_event_emails_event ON event_emails (event_id, sent_at DESC);

COMMENT ON TABLE event_emails IS
  'Messages sent to the ticket holders of one show. Written after the send is '
  'accepted; never a queue or a draft store.';

-- ═══════════════════════════════════════════
-- RLS — through the event, as the rest of the admin tables do
-- ═══════════════════════════════════════════
ALTER TABLE event_emails ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_manage_event_emails" ON event_emails;
CREATE POLICY "admin_manage_event_emails" ON event_emails FOR ALL USING (
  EXISTS (
    SELECT 1 FROM events e JOIN admin_users au ON au.id = auth.uid()
    WHERE e.id = event_emails.event_id
      AND (au.role IN ('owner','super_admin') OR (au.role = 'venue_admin' AND au.venue_id = e.venue_id))
  )
);

-- ═══════════════════════════════════════════
-- CHECK
-- ═══════════════════════════════════════════
--   SELECT e.title, m.subject, m.recipient_count, m.failed_count, m.sent_by, m.sent_at
--   FROM event_emails m JOIN events e ON e.id = m.event_id
--   ORDER BY m.sent_at DESC;

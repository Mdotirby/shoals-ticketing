-- ════════════════════════════════════════════════════════════════════
--  EVENT CLOSE-OUT MIGRATION
-- ════════════════════════════════════════════════════════════════════
--  Adds an explicit "Close Out Show" workflow to events.
--
--  Concept:
--    • An event is considered PAST (and hidden from customer-facing
--      ticket purchase) when EITHER:
--        a) its date has passed (date < today), OR
--        b) an admin explicitly clicks "Close Out Show", which stamps
--           `closed_out_at` with a timestamp.
--    • Closed-out / past events still appear on the archive page
--      (/events/past) so customers can see history.
--    • Booking status remains "confirmed" — we don't want to mutate the
--      booking record's truth, just gate ticket sales.
--
--  Idempotent — safe to run multiple times.
-- ════════════════════════════════════════════════════════════════════

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS closed_out_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS closed_out_by UUID NULL,
  ADD COLUMN IF NOT EXISTS closed_out_note TEXT NULL;

COMMENT ON COLUMN events.closed_out_at IS
  'Timestamp when the show was manually closed out by an admin. NULL means the show is still open. Once set, the event is hidden from public ticket sales regardless of date.';
COMMENT ON COLUMN events.closed_out_by IS
  'User ID of the admin who closed out the show.';
COMMENT ON COLUMN events.closed_out_note IS
  'Optional free-text note captured at close-out time (e.g. weather cancellation, attendance summary).';

-- Index for fast filtering of past / open events on the public list endpoint.
CREATE INDEX IF NOT EXISTS events_closed_out_at_idx
  ON events (closed_out_at)
  WHERE closed_out_at IS NOT NULL;

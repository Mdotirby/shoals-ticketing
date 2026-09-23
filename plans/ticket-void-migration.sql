-- Void tickets when an order is refunded
--
-- Nothing in this system ever invalidated a ticket. A refunded order kept its
-- tickets, and they scanned clean at the door.
--
-- That is not theoretical. On 2026-08-15 at Muscle Shoals Meets: The 90's,
-- eight tickets belonging to a fully refunded order were scanned in — six of
-- them in a single bulk check-in at 23:36:57 — for a VIP table nobody ever
-- paid for. See the haggar-noah-unpaid note.
--
-- `is_scanned` cannot carry this: it records what happened at the door, not
-- whether the ticket was ever entitled to get through it. So a ticket gets its
-- own voided state, separate from its scan state, and the door refuses it.
--
-- voided_at is deliberately nullable rather than a boolean: WHEN a ticket was
-- voided is the thing anyone asks afterwards, and a timestamp answers both
-- questions where a flag answers one.
--
-- Run in the Supabase SQL editor. Safe to re-run.

ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS voided_at   timestamptz,
  ADD COLUMN IF NOT EXISTS void_reason text;

COMMENT ON COLUMN tickets.voided_at IS
  'When this ticket stopped being valid. NULL means valid. Independent of is_scanned — a ticket can be scanned and later voided, which is exactly the case this was built for.';
COMMENT ON COLUMN tickets.void_reason IS
  'Why it was voided, e.g. "Order refunded". Shown to door staff so a refusal can be explained.';

-- The door asks "is this ticket void?" on every scan.
CREATE INDEX IF NOT EXISTS tickets_voided_at_idx ON tickets (voided_at) WHERE voided_at IS NOT NULL;

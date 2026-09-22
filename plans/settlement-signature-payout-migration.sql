-- Settlement signatures and payout record
--
-- Two gaps the settlement screen had to report as "not tracked": who signed
-- the settlement, and whether the artist has actually been paid. The mockup
-- (handoff/screens/settlement.dc.html) draws both in its "Signature & payout"
-- card.
--
-- Signatures: who signed for the venue and who signed for the artist side,
-- each with a timestamp. Free text rather than a user id, because the artist
-- side signs as a tour manager who has no login here.
--
-- Payout: a RECORD of a payment made elsewhere — the money moves by ACH,
-- cheque or cash outside this app (see the payout method note), so these
-- columns state what was paid, how, when, and by whom. Nothing here moves
-- money on its own.
--
-- Run in the Supabase SQL editor. Safe to re-run.

ALTER TABLE settlements
  ADD COLUMN IF NOT EXISTS venue_signed_by     text,
  ADD COLUMN IF NOT EXISTS venue_signed_at     timestamptz,
  ADD COLUMN IF NOT EXISTS artist_signed_by    text,
  ADD COLUMN IF NOT EXISTS artist_signed_at    timestamptz,
  ADD COLUMN IF NOT EXISTS payout_amount       numeric,
  ADD COLUMN IF NOT EXISTS payout_method       text,
  ADD COLUMN IF NOT EXISTS payout_reference    text,
  ADD COLUMN IF NOT EXISTS payout_at           timestamptz,
  ADD COLUMN IF NOT EXISTS payout_by           text;

COMMENT ON COLUMN settlements.payout_amount IS
  'What was actually paid to the artist. A record of a payment made outside this app, not a transfer it performed.';
COMMENT ON COLUMN settlements.payout_method IS
  'ACH, check, cash, Stripe or other — how the payout left the account.';

-- Finding unpaid finalized settlements is the one query this adds.
CREATE INDEX IF NOT EXISTS settlements_payout_at_idx ON settlements (payout_at);

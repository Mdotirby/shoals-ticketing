-- Every payment to the artist, recorded: method on deposits, and more than
-- one payout per settlement
--
-- TWO GAPS THIS CLOSES
--
-- 1. A deposit records how much and when, but not HOW it was paid. The method
--    has been going into the free-text notes instead -- "Paid to WME Via ACH
--    Wire", "50% of guarantee, paid to WME via ACH" -- which is fine to read
--    and impossible to total, filter or reconcile. method/reference/paid_by
--    give it the same three fields the payout already has.
--
-- 2. A settlement could record exactly ONE payout, in five columns on the
--    settlements row, and the screen hard-wired its amount to the whole
--    balance due. A show paid in two instalments -- which is how MSM 90s
--    actually went -- had nowhere to say so. The only way to correct a payout
--    was "Clear payout record" and start again, which loses the first payment.
--    settlement_payouts makes it a list.
--
-- WHAT THIS DOES NOT DO: move money. These are records of payments made
-- elsewhere, by ACH, cheque or cash. Nothing here initiates a transfer.
--
-- The settlements.payout_* columns are KEPT, not dropped. They are the source
-- of the backfill below, they are what the screen falls back to if this has
-- not been run yet, and dropping them would make a rollback lossy. Code stops
-- writing them once the table exists.
--
-- Run in the Supabase SQL editor. Safe to re-run.

-- ═══════════════════════════════════════════
-- 1. DEPOSITS: how it was paid
-- ═══════════════════════════════════════════
ALTER TABLE settlement_deposits
  ADD COLUMN IF NOT EXISTS method    text,
  ADD COLUMN IF NOT EXISTS reference text,
  ADD COLUMN IF NOT EXISTS paid_by   text;

COMMENT ON COLUMN settlement_deposits.method IS
  'ACH, Check, Cash, Stripe or Other -- how the deposit left the account.';
COMMENT ON COLUMN settlement_deposits.reference IS
  'Cheque number, wire or transfer id. What to search for in the bank.';
COMMENT ON COLUMN settlement_deposits.date IS
  'The date the money actually left. NULL means not paid yet -- a deposit the '
  'offer calls for, pre-filled, still owed.';

-- ═══════════════════════════════════════════
-- 2. PAYOUTS: a list, not a column
-- ═══════════════════════════════════════════
CREATE TABLE IF NOT EXISTS settlement_payouts (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  settlement_id  uuid NOT NULL REFERENCES settlements(id) ON DELETE CASCADE,
  -- Rounded to cents on the way in. The one payout on file was stored as
  -- 727.8275, the raw balance-due float -- not an amount any cheque was ever
  -- written for.
  amount         numeric(10,2) NOT NULL DEFAULT 0,
  method         text,
  reference      text,
  paid_at        timestamptz NOT NULL DEFAULT now(),
  paid_by        text,
  notes          text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_settlement_payouts ON settlement_payouts (settlement_id);
-- Finding settlements still owing money is the one query this adds.
CREATE INDEX IF NOT EXISTS idx_settlement_payouts_paid_at ON settlement_payouts (paid_at);

COMMENT ON TABLE settlement_payouts IS
  'Payments made to the artist against a settlement, one row each. A record of '
  'money moved elsewhere (ACH, cheque, cash), never a transfer this app made. '
  'Supersedes settlements.payout_*, which held only the most recent one.';

-- ═══════════════════════════════════════════
-- 3. RLS -- through settlement ownership, exactly as deposits and expenses
-- ═══════════════════════════════════════════
ALTER TABLE settlement_payouts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_manage_settlement_payouts" ON settlement_payouts;
CREATE POLICY "admin_manage_settlement_payouts" ON settlement_payouts FOR ALL USING (
  EXISTS (SELECT 1 FROM settlements s JOIN admin_users au ON au.id = auth.uid()
    WHERE s.id = settlement_payouts.settlement_id
    AND (au.role IN ('owner','super_admin') OR (au.role = 'venue_admin' AND au.venue_id = s.venue_id)))
);

-- ═══════════════════════════════════════════
-- 4. BACKFILL the payouts already recorded
-- ═══════════════════════════════════════════
-- One row on file today (Tyler Halverson, 10 Sep, $727.8275 by cheque), but
-- written as a general backfill so it is right whenever this is run. Guarded
-- on settlement_id so a re-run does not duplicate: a settlement that already
-- has any payout row is left alone.
INSERT INTO settlement_payouts (settlement_id, amount, method, reference, paid_at, paid_by, notes)
SELECT
  s.id,
  round(s.payout_amount::numeric, 2),
  s.payout_method,
  s.payout_reference,
  coalesce(s.payout_at, now()),
  s.payout_by,
  'Migrated from the single payout columns.'
FROM settlements s
WHERE s.payout_at IS NOT NULL
  AND s.payout_amount IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM settlement_payouts p WHERE p.settlement_id = s.id);

-- ═══════════════════════════════════════════
-- 5. CHECK
-- ═══════════════════════════════════════════
-- Every settlement that had a payout should now have exactly one row, with the
-- amount rounded to cents.
--
--   SELECT s.id, s.payout_amount AS was, p.amount AS now, p.method, p.paid_at
--   FROM settlements s
--   JOIN settlement_payouts p ON p.settlement_id = s.id
--   WHERE s.payout_at IS NOT NULL
--   ORDER BY p.paid_at DESC;

-- Cash sales + reconciliation variance on settlements.
--
-- cash_gross / cash_tickets_sold: manual entry for door cash sales. No fees,
-- no tax on cash -- the whole figure feeds straight into net receipts (NBOR).
--
-- reconciliation_variance: real Stripe gross minus what the pricing model
-- says it should have been. computeEventAudit always computed this but it
-- was discarded before reaching the DB -- persisting it so a mid-run price
-- change (like the DNC $20->$25 raise) surfaces as a visible warning instead
-- of silently zeroing out the CC-fee column.
--
-- Run in Supabase SQL Editor. Idempotent -- safe to re-run.

ALTER TABLE settlements
  ADD COLUMN IF NOT EXISTS cash_gross NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cash_tickets_sold INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reconciliation_variance NUMERIC DEFAULT 0;

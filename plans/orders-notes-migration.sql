-- Adds an optional `notes` column to orders.
--
-- Used by the admin "Issue Comp Tickets" action (POST /api/admin/comps) to
-- record an internal memo like "Instagram giveaway winner" or "Press pass"
-- alongside each comp order. Safe to re-run.

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS notes TEXT;

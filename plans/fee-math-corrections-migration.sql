-- ============================================================================
-- Fee & settlement math corrections — 2026-08-12
--
-- Run the sections IN ORDER. Section 1 is urgent (it is charging customers a
-- 95% tax rate today). Sections 2–4 are schema. Section 5 is a data backfill
-- and should be run last, after the new webhook code is deployed.
--
-- Every statement is idempotent or explicitly scoped. Nothing here deletes a
-- row. Read Section 5's note before running it.
-- ============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- 1. URGENT: Renaissance Shoals is set to a 95% sales tax rate
--
-- A misplaced decimal. Every other venue is at 0.095. Any event that resolves
-- its fees from this venue row charges 95% tax at checkout.
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE venues
   SET tax_rate = 0.095
 WHERE id = 'a036f949-95b4-4691-874b-a6b26bd998aa'
   AND tax_rate = 0.95;

-- Guard: catch any other rate that is obviously a percent stored as a decimal.
-- Review the output before acting on it — do not blind-update.
SELECT id, name, tax_rate
  FROM venues
 WHERE tax_rate > 0.5
UNION ALL
SELECT id, name, tax_rate
  FROM event_venues
 WHERE tax_rate > 0.5;


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Widen the tax rate columns
--
-- venues.tax_rate is NUMERIC(5,4) and event_venues.tax_rate is NUMERIC(6,4).
-- Four decimal places cannot represent a rate like 9.375% (0.09375), and the
-- two tables disagreeing invites exactly the kind of drift this migration is
-- cleaning up.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE venues       ALTER COLUMN tax_rate TYPE NUMERIC(7,5);
ALTER TABLE event_venues ALTER COLUMN tax_rate TYPE NUMERIC(7,5);

-- Align the defaults. Migrations in plans/ variously used 0.09 and 0.095.
ALTER TABLE venues       ALTER COLUMN tax_rate SET DEFAULT 0.095;
ALTER TABLE event_venues ALTER COLUMN tax_rate SET DEFAULT 0.095;


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Separate "what we surcharged the buyer" from "what Stripe actually took"
--
-- settlement_ledger.stripe_fee was carrying both meanings at once, which made
-- an under-recovery indistinguishable from a pricing change. stripe_fee now
-- means the surcharge billed to the buyer; the new columns hold the truth from
-- the charge's balance transaction.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE settlement_ledger
  ADD COLUMN IF NOT EXISTS stripe_fee_actual              NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS stripe_net                     NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS stripe_balance_transaction_id  TEXT;

COMMENT ON COLUMN settlement_ledger.stripe_fee IS
  'Card surcharge billed to the buyer at checkout. NOT what Stripe deducted.';
COMMENT ON COLUMN settlement_ledger.stripe_fee_actual IS
  'Processing fee Stripe actually deducted, from balance_transaction.fee.';
COMMENT ON COLUMN settlement_ledger.stripe_net IS
  'Net amount that settled to the bank, from balance_transaction.net.';

CREATE INDEX IF NOT EXISTS settlement_ledger_event_type_idx
  ON settlement_ledger (event_id, type);


-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Platform fee schedule — the master rate card
--
-- Fee VALUES stay per-venue (venues / event_venues), which is correct and
-- deliberate. What had no home was the platform-level rate card: the Stripe
-- percentages, flat fees, and defaults that were duplicated as literals in 22
-- places across 16 files.
--
-- Dated, not mutable: when Stripe changes pricing you INSERT a row and close
-- the old one, so a settlement re-run in 2028 for a 2026 show still uses 2026
-- rates. That is the whole point of an auditable settlement.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS platform_fee_schedule (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  effective_from          TIMESTAMPTZ NOT NULL,
  effective_to            TIMESTAMPTZ,            -- NULL = currently in force

  -- Card processing, by capture method
  stripe_online_pct       NUMERIC(6,5) NOT NULL,  -- 0.02900
  stripe_online_flat      NUMERIC(6,2) NOT NULL,  -- 0.30
  stripe_terminal_pct     NUMERIC(6,5) NOT NULL,  -- 0.02700
  stripe_terminal_flat    NUMERIC(6,2) NOT NULL,  -- 0.05

  -- How the card fee reaches the buyer. 'gross_up' is the only mode that
  -- leaves the venue whole; 'on_subtotal' always under-recovers because Stripe
  -- bills on the grossed-up total.
  surcharge_mode          TEXT NOT NULL DEFAULT 'on_subtotal'
    CHECK (surcharge_mode IN ('gross_up', 'on_subtotal', 'absorb')),

  -- Fallbacks used only when a venue has no value of its own
  default_ticketing_fee   NUMERIC(10,2) NOT NULL DEFAULT 3.00,
  default_facility_fee    NUMERIC(10,2) NOT NULL DEFAULT 0,
  default_tax_rate        NUMERIC(7,5)  NOT NULL DEFAULT 0.095,
  default_tax_method      TEXT NOT NULL DEFAULT 'multiplier'
    CHECK (default_tax_method IN ('multiplier', 'divisor')),

  note                    TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by              UUID
);

-- At most one open-ended (current) schedule at a time.
CREATE UNIQUE INDEX IF NOT EXISTS platform_fee_schedule_one_current_idx
  ON platform_fee_schedule ((effective_to IS NULL))
  WHERE effective_to IS NULL;

-- RLS with NO policies = service_role only (it bypasses RLS by design).
--
-- This is not optional. Supabase grants anon/authenticated on new public-schema
-- tables by default, so a table created without RLS is readable AND WRITABLE
-- with the anon key that ships in the client bundle. A publicly writable rate
-- card would let anyone rewrite the platform's processing rates the moment
-- application code starts reading from this table.
ALTER TABLE platform_fee_schedule ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON platform_fee_schedule FROM anon, authenticated;

INSERT INTO platform_fee_schedule (
  effective_from, stripe_online_pct, stripe_online_flat,
  stripe_terminal_pct, stripe_terminal_flat, surcharge_mode, note
)
SELECT
  '2026-08-14T06:00:00Z', 0.029, 0.30, 0.027, 0.05, 'on_subtotal',
  'Initial rate card. effective_from matches STRIPE_RATE_CUTOVER_AT in '
  || 'lib/fees/rates.ts so in-flight shows finish at the rate they opened at. '
  || 'Online verified against live Stripe balance transactions on 2026-08-12 '
  || '(blended actual 2.903% + $0.30). Terminal card-present is genuinely '
  || '2.7% + $0.05 and is not a stale copy.'
WHERE NOT EXISTS (SELECT 1 FROM platform_fee_schedule);


-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Backfill facility fees into the existing ledger
--
-- settlement_ledger.facility_fee is 0.00 on all 757 rows even though West 72
-- Entertainment and Singin' River Brewing are both configured at $3/ticket.
-- The webhook never wrote it, so every facility fee ever collected is sitting
-- inside ticket_revenue and being reported to artists as face value.
--
-- ⚠ RUN THIS LAST, and only after the corrected webhook is deployed.
--
-- Preferred route: instead of this SQL, POST to
--   /api/events/{id}/revenue-summary/backfill
-- for each affected event. That endpoint rebuilds the rows with the corrected
-- surcharge base as well, which this SQL cannot do.
--
-- Preview first — this SELECT changes nothing:
-- ─────────────────────────────────────────────────────────────────────────────
SELECT
  e.title,
  count(*)                                   AS ledger_rows,
  sum(sl.ticket_revenue)                     AS current_face_value,
  sum(COALESCE(ev.facility_fee, v.facility_fee, 0) * o.quantity)
                                             AS facility_fee_buried_inside
FROM settlement_ledger sl
JOIN orders o        ON o.id = sl.order_id
JOIN events e        ON e.id = sl.event_id
LEFT JOIN event_venues ev ON ev.id = e.event_venue_id
LEFT JOIN venues v        ON v.id  = e.venue_id
WHERE sl.type = 'sale'
  AND sl.facility_fee = 0
  AND COALESCE(ev.facility_fee, v.facility_fee, 0) > 0
  AND COALESCE(e.facility_fee_enabled, true) = true
GROUP BY e.title
ORDER BY facility_fee_buried_inside DESC;

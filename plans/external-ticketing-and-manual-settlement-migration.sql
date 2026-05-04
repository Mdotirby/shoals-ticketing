-- ══════════════════════════════════════════════════════════════════
-- External Ticketing Links + Manual Settlement Migration
-- Run once against your Supabase DB.
-- ══════════════════════════════════════════════════════════════════

-- ── Feature 1: External Ticketing Links on Events ─────────────────
--
-- When external_ticket_url is set on an event, the public-facing
-- "Buy Tickets" button routes to that URL instead of VenueCore checkout.

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS external_ticket_url   text,
  ADD COLUMN IF NOT EXISTS external_ticket_label text;

-- ── Feature 2: Manual / External Settlements ──────────────────────
--
-- source = 'venuecore' → normal audit-based settlement (default)
-- source = 'external'  → all financial figures are entered manually;
--                        computeEventAudit() is skipped entirely.

ALTER TABLE settlements
  ADD COLUMN IF NOT EXISTS source                text NOT NULL DEFAULT 'venuecore',
  ADD COLUMN IF NOT EXISTS manual_gross          numeric,
  ADD COLUMN IF NOT EXISTS manual_tickets_sold   integer,
  ADD COLUMN IF NOT EXISTS manual_ticket_price   numeric,
  ADD COLUMN IF NOT EXISTS manual_ticketing_fee  numeric,
  ADD COLUMN IF NOT EXISTS manual_facility_fee   numeric,
  ADD COLUMN IF NOT EXISTS manual_tax_rate       numeric,
  ADD COLUMN IF NOT EXISTS manual_tax_method     text,
  ADD COLUMN IF NOT EXISTS manual_processing_fee numeric;

-- event_id is now nullable to allow standalone manual settlements
-- (shows not in the VenueCore calendar at all).
ALTER TABLE settlements
  ALTER COLUMN event_id DROP NOT NULL;

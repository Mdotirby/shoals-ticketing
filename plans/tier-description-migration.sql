-- A tier says what it is
--
-- The line under every tier name on the storefront has been the literal
-- string "Full event access", hardcoded in app/events/[id]/EventDetailClient
-- as perks[0] and read by OrderSummary. Every tier on every show said the
-- same thing, including the ones where it was not true -- a VIP table, a
-- balcony seat, an early-entry tier.
--
-- This is the field that replaces it. Set per tier in the admin tier editor;
-- blank falls back to "Full event access", so nothing changes on a show until
-- someone writes something.
--
-- Run in the Supabase SQL editor. Safe to re-run.

ALTER TABLE ticket_tiers
  ADD COLUMN IF NOT EXISTS description text;

COMMENT ON COLUMN ticket_tiers.description IS
  'One line shown under the tier name on the storefront, in place of the old '
  'hardcoded "Full event access". Buyer-facing. NULL or blank falls back to '
  'that string.';

-- ═══════════════════════════════════════════
-- CHECK
-- ═══════════════════════════════════════════
--   SELECT e.title, t.tier_name, t.price, t.description
--   FROM ticket_tiers t JOIN events e ON e.id = t.event_id
--   ORDER BY e.date DESC, t.sort_order;

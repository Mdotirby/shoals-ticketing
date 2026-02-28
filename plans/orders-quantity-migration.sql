-- ═══════════════════════════════════════════
-- Orders & Tickets: Fix missing/constraint issues
-- ═══════════════════════════════════════════
-- Run this in Supabase SQL Editor.
-- ═══════════════════════════════════════════

-- 1. Add missing quantity column to orders
ALTER TABLE orders ADD COLUMN IF NOT EXISTS quantity INTEGER DEFAULT 1;

-- 2. Fix ticket_type_id FK: it referenced ticket_types but should reference ticket_tiers
ALTER TABLE tickets DROP CONSTRAINT IF EXISTS tickets_ticket_type_id_fkey;
ALTER TABLE tickets ADD CONSTRAINT tickets_ticket_type_id_fkey 
  FOREIGN KEY (ticket_type_id) REFERENCES ticket_tiers(id);

-- 3. Make ticket_type_id nullable (safety for events without tiers)
ALTER TABLE tickets ALTER COLUMN ticket_type_id DROP NOT NULL;

-- 4. Clean up stuck stripe events so webhooks can be retried
DELETE FROM stripe_events;

-- 5. Clean up orphaned orders (created without tickets)
DELETE FROM orders WHERE id NOT IN (
  SELECT DISTINCT order_id FROM tickets WHERE order_id IS NOT NULL
);

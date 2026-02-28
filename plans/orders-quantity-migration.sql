-- ═══════════════════════════════════════════
-- Orders & Tickets: Fix missing/constraint issues
-- ═══════════════════════════════════════════
-- Run this in Supabase SQL Editor.
-- ═══════════════════════════════════════════

-- 1. Add missing quantity column to orders
ALTER TABLE orders ADD COLUMN IF NOT EXISTS quantity INTEGER DEFAULT 1;

-- 2. Make ticket_type_id nullable (events may not have tiers set up)
ALTER TABLE tickets ALTER COLUMN ticket_type_id DROP NOT NULL;

-- 3. Clean up stuck stripe events so webhooks can be retried
DELETE FROM stripe_events;

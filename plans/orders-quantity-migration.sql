-- ═══════════════════════════════════════════
-- Orders: Add missing quantity column
-- ═══════════════════════════════════════════
-- The webhook and confirmation routes reference orders.quantity
-- but the column was never created in any migration.
-- Run this in Supabase SQL Editor.
-- ═══════════════════════════════════════════

ALTER TABLE orders ADD COLUMN IF NOT EXISTS quantity INTEGER DEFAULT 1;

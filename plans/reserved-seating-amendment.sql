-- ============================================================
-- Reserved Seating Amendment
-- Adds order_id to seat_reservations for proper per-order
-- seat assignment lookups.
-- Run AFTER reserved-seating-migration.sql
-- ============================================================

-- Add order_id column to seat_reservations
ALTER TABLE seat_reservations
  ADD COLUMN IF NOT EXISTS order_id UUID;

-- Index for fast order-based lookups
CREATE INDEX IF NOT EXISTS idx_seat_reservations_order_id
  ON seat_reservations(order_id);

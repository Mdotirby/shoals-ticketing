-- ============================================================
-- Migration: Add tracking_link_slug to orders table
-- ============================================================
-- Stores the trackable link slug that attributed the sale.
-- Run in Supabase SQL Editor.
-- ============================================================

ALTER TABLE orders
ADD COLUMN IF NOT EXISTS tracking_link_slug TEXT DEFAULT NULL;

-- Index for quick lookups / reporting by tracking link
CREATE INDEX IF NOT EXISTS idx_orders_tracking_link_slug
ON orders (tracking_link_slug)
WHERE tracking_link_slug IS NOT NULL;

-- ============================================================
-- Backfill the Jax Greenhill order (kruse-brothers-002)
-- Replace <ORDER_ID> with the actual order UUID.
-- ============================================================
-- UPDATE orders
-- SET tracking_link_slug = 'kruse-brothers-002'
-- WHERE id = '<ORDER_ID>';

-- ============================================================
-- Add layout_type column to seating_sections
-- Supports "rows" (individual seats) and "tables" layout types
-- Run AFTER reserved-seating-migration.sql
-- ============================================================

ALTER TABLE seating_sections
  ADD COLUMN IF NOT EXISTS layout_type TEXT NOT NULL DEFAULT 'rows';

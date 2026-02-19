-- Migration: Remove per-venue color columns
-- These are no longer used; VenueCore theme is globally hardcoded via CSS vars in globals.css.
-- Run in Supabase SQL editor.

-- Safe: make nullable first (non-breaking for existing rows)
ALTER TABLE venues
  ALTER COLUMN primary_color DROP NOT NULL,
  ALTER COLUMN secondary_color DROP NOT NULL,
  ALTER COLUMN accent_color DROP NOT NULL;

-- After confirming no app code reads these columns, drop them:
-- ALTER TABLE venues
--   DROP COLUMN IF EXISTS primary_color,
--   DROP COLUMN IF EXISTS secondary_color,
--   DROP COLUMN IF EXISTS accent_color;

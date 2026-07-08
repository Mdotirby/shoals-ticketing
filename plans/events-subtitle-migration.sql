-- ============================================================
-- Events — Subtitle Migration
-- Separate from events.title (the canonical event name used for subject
-- lines, alt text, admin listings). This is a short marketing subheader
-- ("The In Defense of Drinking Tour") shown below the headliner name in
-- the announcement email — optional, distinct concept from the title.
-- Additive only.
-- Run in Supabase SQL Editor.
-- ============================================================

ALTER TABLE events ADD COLUMN IF NOT EXISTS subtitle TEXT;

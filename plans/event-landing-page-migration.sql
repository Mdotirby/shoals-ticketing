-- ============================================================================
-- EVENT LANDING PAGES — Migration
-- ============================================================================
--
-- Adds a `landing_page_slug` column to the `events` table for SEO-friendly
-- landing page URLs at /e/[slug].
--
-- The slug is auto-generated from the event title + venue when an event is
-- created via the API. Admins can edit it manually from the event edit page.
--
-- Run in Supabase SQL Editor.
-- ============================================================================

-- =========================
-- COLUMN: landing_page_slug
-- =========================
ALTER TABLE events
ADD COLUMN IF NOT EXISTS landing_page_slug TEXT UNIQUE;

-- Index for fast slug lookups
CREATE INDEX IF NOT EXISTS idx_events_landing_page_slug
  ON events(landing_page_slug)
  WHERE landing_page_slug IS NOT NULL;

-- =========================
-- BACKFILL: Generate unique slugs for existing events
-- =========================
-- Uses a DO block to iterate events and append -2, -3, etc. for duplicates.

DO $$
DECLARE
  rec RECORD;
  base_slug TEXT;
  candidate TEXT;
  counter INT;
  existing_count INT;
BEGIN
  FOR rec IN
    SELECT id, title FROM events
    WHERE landing_page_slug IS NULL
      AND title IS NOT NULL
      AND status = 'published'
    ORDER BY date ASC NULLS LAST
  LOOP
    base_slug := LEFT(
      TRIM(BOTH '-' FROM
        regexp_replace(
          regexp_replace(
            lower(rec.title),
            '[^a-z0-9]+', '-', 'g'
          ),
          '-+', '-', 'g'
        )
      ),
      80
    );

    IF base_slug IS NULL OR base_slug = '' THEN
      base_slug := 'event';
    END IF;

    candidate := base_slug;
    counter := 1;

    LOOP
      SELECT COUNT(*) INTO existing_count
      FROM events
      WHERE landing_page_slug = candidate AND id != rec.id;

      EXIT WHEN existing_count = 0;

      counter := counter + 1;
      candidate := base_slug || '-' || counter;
    END LOOP;

    UPDATE events SET landing_page_slug = candidate WHERE id = rec.id;
  END LOOP;
END $$;

-- =========================
-- FUNCTION: generate_landing_page_slug
-- =========================
-- Helper function that generates a unique slug from a title string.
-- Appends -2, -3, etc. if the base slug already exists.

CREATE OR REPLACE FUNCTION generate_landing_page_slug(
  p_title TEXT,
  p_event_id UUID DEFAULT NULL
)
RETURNS TEXT AS $$
DECLARE
  base_slug TEXT;
  candidate TEXT;
  counter INT := 1;
  existing_count INT;
BEGIN
  -- Slugify: lowercase, replace non-alphanumeric with hyphens, collapse, trim
  base_slug := LEFT(
    TRIM(BOTH '-' FROM
      regexp_replace(
        regexp_replace(
          lower(p_title),
          '[^a-z0-9]+', '-', 'g'
        ),
        '-+', '-', 'g'
      )
    ),
    80
  );

  IF base_slug IS NULL OR base_slug = '' THEN
    base_slug := 'event';
  END IF;

  candidate := base_slug;

  LOOP
    IF p_event_id IS NOT NULL THEN
      SELECT COUNT(*) INTO existing_count
      FROM events
      WHERE landing_page_slug = candidate AND id != p_event_id;
    ELSE
      SELECT COUNT(*) INTO existing_count
      FROM events
      WHERE landing_page_slug = candidate;
    END IF;

    EXIT WHEN existing_count = 0;

    counter := counter + 1;
    candidate := base_slug || '-' || counter;
  END LOOP;

  RETURN candidate;
END;
$$ LANGUAGE plpgsql;

-- =========================
-- UPDATE trackable_link_events CHECK CONSTRAINT
-- =========================
-- Add 'view' as a valid event_type for landing page view tracking.

ALTER TABLE trackable_link_events
DROP CONSTRAINT IF EXISTS trackable_link_events_event_type_check;

ALTER TABLE trackable_link_events
ADD CONSTRAINT trackable_link_events_event_type_check
CHECK (event_type IN ('click', 'conversion', 'view'));

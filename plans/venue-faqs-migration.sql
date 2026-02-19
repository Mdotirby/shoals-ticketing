-- Migration: Admin-editable venue FAQs
-- Venues can override global FAQ defaults with their own entries.
-- If a venue has no rows, the global defaults in FAQAccordion.tsx are shown.

CREATE TABLE venue_faqs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id    UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  question    TEXT NOT NULL,
  answer      TEXT NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_venue_faqs_venue ON venue_faqs(venue_id, sort_order);

-- RLS: venue_admin can manage their own FAQs; public can read
ALTER TABLE venue_faqs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "venue_admin_manage_faqs" ON venue_faqs
  FOR ALL
  USING (
    venue_id IN (
      SELECT venue_id FROM admin_users
      WHERE id = auth.uid() AND role IN ('venue_admin', 'owner')
    )
  );

CREATE POLICY "public_read_faqs" ON venue_faqs
  FOR SELECT USING (true);

-- Usage: fetch in event detail page via
-- GET /api/venues?slug=<slug> → get venue id
-- then GET /api/venues/<id>/faqs (new route, or inline in venues route)

-- ============================================================
-- VENUE HOTELS TABLE
-- Stores hotel partnership links per event venue.
-- Designed to support 1–N hotels per venue with no code changes
-- needed to add/remove/reorder hotels — just insert/update rows.
-- ============================================================

CREATE TABLE IF NOT EXISTS venue_hotels (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  venue_id        uuid NOT NULL REFERENCES event_venues(id) ON DELETE CASCADE,

  -- Display
  name            text NOT NULL,        -- "Renaissance Shoals Resort & Spa"
  tagline         text,                 -- "Official show hotel · Best available rate"

  -- Booking URL template — use {checkin} and {checkout} tokens.
  -- Marriott expects MM/DD/YYYY; other OTAs may differ — the template handles it.
  -- Example (Marriott property deep-link):
  --   https://www.marriott.com/reservation/availabilitySearch.mi?propertyCode=MSLRS&fromDate={checkin}&toDate={checkout}&roomCount=1
  booking_url_template text NOT NULL,

  -- Control
  display_order   integer NOT NULL DEFAULT 0,  -- ascending order in UI
  active          boolean NOT NULL DEFAULT true,

  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_venue_hotels_venue_id ON venue_hotels(venue_id);

-- RLS: public read, auth write (same pattern as event_venues)
ALTER TABLE venue_hotels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "venue_hotels_select" ON venue_hotels
  FOR SELECT USING (true);

CREATE POLICY "venue_hotels_insert" ON venue_hotels
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "venue_hotels_update" ON venue_hotels
  FOR UPDATE USING (auth.uid() IS NOT NULL);

CREATE POLICY "venue_hotels_delete" ON venue_hotels
  FOR DELETE USING (auth.uid() IS NOT NULL);

-- ============================================================
-- SEED: Renaissance Shoals Resort & Spa
-- Linked to Singin' River Live venue.
--
-- TODO: Confirm Marriott property code for Renaissance Shoals
-- before inserting. Find it in the URL when browsing the
-- property on marriott.com — e.g. /hotels/travel/MSLRS-...
-- Replace MSLRS below with the confirmed code.
-- ============================================================

INSERT INTO venue_hotels (venue_id, name, tagline, booking_url_template, display_order)
SELECT
  id,
  'Renaissance Shoals Resort & Spa',
  'Official show hotel · Best available rate',
  'https://www.marriott.com/reservation/availabilitySearch.mi?propertyCode=MSLBR&fromDate={checkin}&toDate={checkout}&roomCount=1&guestCount=1',
  0
FROM event_venues
WHERE name = 'Singin'' River Live'
LIMIT 1
ON CONFLICT DO NOTHING;

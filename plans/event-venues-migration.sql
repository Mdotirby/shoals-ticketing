-- ============================================================
-- EVENT VENUES TABLE
-- Stores venue/location data for events at non-platform venues
-- (venues that are NOT subscribed to VenueCore but we promote shows at)
-- Data is collected from the offer when booking a show.
-- ============================================================

-- 1. Create the event_venues table
CREATE TABLE IF NOT EXISTS event_venues (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- Venue identity
  name text NOT NULL,                         -- e.g. "Singin' River Live"
  
  -- Address (full + components for map)
  address_street text,                        -- e.g. "1030 N Wood Ave"
  address_city text,                          -- e.g. "Florence"
  address_state text,                         -- e.g. "AL"
  address_zip text,                           -- e.g. "35630"
  full_address text,                          -- computed/cached full string for map embed
  
  -- Geo coordinates (optional — for precise map pin)
  lat numeric,                                -- latitude
  lng numeric,                                -- longitude
  
  -- Contact
  contact_name text,                          -- venue contact person
  phone text,                                 -- venue phone
  email text,                                 -- venue email
  website_url text,                           -- venue website
  
  -- Directions & Parking (rich text for the directions card)
  directions_by_car text,                     -- driving directions
  parking_info text,                          -- parking instructions
  directions_public_transit text,             -- transit directions (optional)
  
  -- Capacity & metadata
  capacity integer,
  notes text,                                 -- internal notes
  
  -- Ownership
  created_by uuid REFERENCES auth.users(id),  -- who added this venue
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 2. Add event_venue_id column to events table
-- This links an event to a non-platform venue
ALTER TABLE events 
  ADD COLUMN IF NOT EXISTS event_venue_id uuid REFERENCES event_venues(id);

-- 3. Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_events_event_venue_id ON events(event_venue_id);
CREATE INDEX IF NOT EXISTS idx_event_venues_name ON event_venues(name);

-- 4. Auto-populate full_address from components via trigger
CREATE OR REPLACE FUNCTION compute_event_venue_full_address()
RETURNS trigger AS $$
BEGIN
  NEW.full_address := COALESCE(NEW.address_street, '') 
    || CASE WHEN NEW.address_city IS NOT NULL THEN ', ' || NEW.address_city ELSE '' END
    || CASE WHEN NEW.address_state IS NOT NULL THEN ', ' || NEW.address_state ELSE '' END
    || CASE WHEN NEW.address_zip IS NOT NULL THEN ' ' || NEW.address_zip ELSE '' END;
  NEW.full_address := TRIM(BOTH ', ' FROM NEW.full_address);
  IF NEW.full_address = '' THEN NEW.full_address := NULL; END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_event_venue_full_address
  BEFORE INSERT OR UPDATE ON event_venues
  FOR EACH ROW
  EXECUTE FUNCTION compute_event_venue_full_address();

-- 5. RLS policies
ALTER TABLE event_venues ENABLE ROW LEVEL SECURITY;

-- Anyone can read event venues (public for map display)
CREATE POLICY "event_venues_select" ON event_venues
  FOR SELECT USING (true);

-- Only authenticated users can insert/update (admin creates them)
CREATE POLICY "event_venues_insert" ON event_venues
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "event_venues_update" ON event_venues
  FOR UPDATE USING (auth.uid() IS NOT NULL);

CREATE POLICY "event_venues_delete" ON event_venues
  FOR DELETE USING (auth.uid() IS NOT NULL);

-- ============================================================
-- SEED: Singin' River Live
-- ============================================================
INSERT INTO event_venues (name, address_street, address_city, address_state, address_zip, phone, directions_by_car, parking_info)
VALUES (
  'Singin'' River Live',
  '1030 N Wood Ave',
  'Florence',
  'AL',
  '35630',
  NULL,
  'From the Shoals area, take US-72 to downtown Florence and head north on N Wood Ave. The venue is on the right, in the heart of downtown Florence.',
  'Free street parking is available along Wood Ave and surrounding streets. Additional paid lot parking is available within a 2-block walk of the venue.'
)
ON CONFLICT DO NOTHING;

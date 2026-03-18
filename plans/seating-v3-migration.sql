-- ============================================================
-- Seating System V3: Complete Rebuild
-- Clean schema: layouts → sections → objects → seats
-- ============================================================

-- Drop old tables (if they exist)
DROP TABLE IF EXISTS seat_reservations CASCADE;
DROP TABLE IF EXISTS seating_seats CASCADE;
DROP TABLE IF EXISTS seating_rows CASCADE;
DROP TABLE IF EXISTS seating_sections CASCADE;
DROP TABLE IF EXISTS seating_charts CASCADE;
DROP TABLE IF EXISTS seating_templates CASCADE;
DROP TABLE IF EXISTS event_seating_maps CASCADE;
DROP TABLE IF EXISTS layout_objects CASCADE;
DROP TABLE IF EXISTS venue_layouts CASCADE;

-- ── venue_layouts ──
CREATE TABLE venue_layouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid REFERENCES venues(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'Untitled Layout',
  room_width_ft float NOT NULL DEFAULT 100,
  room_height_ft float NOT NULL DEFAULT 60,
  created_at timestamptz DEFAULT now()
);

-- ── sections (pricing + grouping) ──
CREATE TABLE sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  layout_id uuid NOT NULL REFERENCES venue_layouts(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'Section',
  type text NOT NULL CHECK (type IN ('table', 'row', 'ga')),
  price_cents int NOT NULL DEFAULT 0,
  color text NOT NULL DEFAULT '#6366f1',
  created_at timestamptz DEFAULT now()
);

-- ── objects (layout structures) ──
CREATE TABLE objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id uuid NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('table_group', 'row_block', 'ga_zone', 'stage', 'label')),
  x_ft float NOT NULL DEFAULT 0,
  y_ft float NOT NULL DEFAULT 0,
  width_ft float NOT NULL DEFAULT 5,
  height_ft float NOT NULL DEFAULT 5,
  rotation float NOT NULL DEFAULT 0,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

-- ── seats (sellable inventory) ──
CREATE TABLE seats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id uuid NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
  object_id uuid NOT NULL REFERENCES objects(id) ON DELETE CASCADE,
  row_label text NOT NULL DEFAULT 'A',
  seat_number int NOT NULL DEFAULT 1,
  x_ft float NOT NULL DEFAULT 0,
  y_ft float NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'held', 'sold')),
  held_until timestamptz,
  held_session text,
  order_id uuid,
  created_at timestamptz DEFAULT now()
);

-- ── event_layout_maps (links events to layouts) ──
CREATE TABLE event_layout_maps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL,
  layout_id uuid NOT NULL REFERENCES venue_layouts(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  UNIQUE(event_id)
);

-- Indexes
CREATE INDEX idx_sections_layout ON sections(layout_id);
CREATE INDEX idx_objects_section ON objects(section_id);
CREATE INDEX idx_seats_section ON seats(section_id);
CREATE INDEX idx_seats_object ON seats(object_id);
CREATE INDEX idx_seats_status ON seats(status);
CREATE INDEX idx_event_layout_maps_event ON event_layout_maps(event_id);

-- RLS
ALTER TABLE venue_layouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE objects ENABLE ROW LEVEL SECURITY;
ALTER TABLE seats ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_layout_maps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "venue_layouts_all" ON venue_layouts FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "sections_all" ON sections FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "objects_all" ON objects FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "seats_all" ON seats FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "event_layout_maps_all" ON event_layout_maps FOR ALL USING (true) WITH CHECK (true);

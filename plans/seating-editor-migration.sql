-- ============================================================
-- Seating Editor: Drag-and-Drop Layout Builder
-- Migration for venue_layouts and layout_objects tables
-- ============================================================

-- Table: venue_layouts
-- Stores the overall layout configuration with background image
CREATE TABLE IF NOT EXISTS venue_layouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid REFERENCES venues(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'Untitled Layout',
  background_image_url text,
  canvas_width float DEFAULT 1200,
  canvas_height float DEFAULT 800,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Table: layout_objects
-- Stores individual objects placed on the seating canvas
CREATE TABLE IF NOT EXISTS layout_objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  layout_id uuid NOT NULL REFERENCES venue_layouts(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('table', 'row', 'ga_section', 'stage', 'custom_zone')),
  x float NOT NULL DEFAULT 100,
  y float NOT NULL DEFAULT 100,
  width float NOT NULL DEFAULT 120,
  height float NOT NULL DEFAULT 120,
  rotation float NOT NULL DEFAULT 0,
  label text NOT NULL DEFAULT '',
  capacity int NOT NULL DEFAULT 0,
  seat_count int NOT NULL DEFAULT 8,
  price_tier text NOT NULL DEFAULT 'standard',
  color text NOT NULL DEFAULT '#6366f1',
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_venue_layouts_venue_id ON venue_layouts(venue_id);
CREATE INDEX IF NOT EXISTS idx_layout_objects_layout_id ON layout_objects(layout_id);

-- RLS policies
ALTER TABLE venue_layouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE layout_objects ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated operations (admin managed)
CREATE POLICY "venue_layouts_all" ON venue_layouts FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "layout_objects_all" ON layout_objects FOR ALL USING (true) WITH CHECK (true);

-- Storage bucket for layout background images
-- Run in Supabase dashboard: Create bucket 'venue-layouts' with public access

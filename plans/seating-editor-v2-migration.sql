-- ============================================================
-- Seating Editor V2: Real-world scaling upgrade
-- Add room dimensions and scale fields to venue_layouts
-- ============================================================

-- Add real-world dimension columns to venue_layouts
ALTER TABLE venue_layouts ADD COLUMN IF NOT EXISTS room_width_ft float DEFAULT 158.3;
ALTER TABLE venue_layouts ADD COLUMN IF NOT EXISTS room_height_ft float DEFAULT 73.9;
ALTER TABLE venue_layouts ADD COLUMN IF NOT EXISTS scale_pixels_per_foot float DEFAULT 10;

-- Add real-world dimension columns to layout_objects
-- All x, y, width, height values are now stored in FEET
-- diameter_inches is stored for tables
ALTER TABLE layout_objects ADD COLUMN IF NOT EXISTS diameter_inches float DEFAULT 0;
ALTER TABLE layout_objects ADD COLUMN IF NOT EXISTS width_ft float DEFAULT 0;
ALTER TABLE layout_objects ADD COLUMN IF NOT EXISTS height_ft float DEFAULT 0;

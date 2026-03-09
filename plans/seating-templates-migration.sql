-- ============================================================
-- Seating Templates Migration
-- Creates tables for AI-generated seating templates.
-- Does NOT alter any existing tables.
-- Run in Supabase SQL Editor.
-- ============================================================

-- 1. seating_templates
CREATE TABLE IF NOT EXISTS seating_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID,
  name TEXT NOT NULL,
  svg_map TEXT,
  layout_json JSONB,
  source_image_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_seating_templates_venue_id ON seating_templates(venue_id);

ALTER TABLE seating_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_seating_templates" ON seating_templates;
CREATE POLICY "public_read_seating_templates" ON seating_templates
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "admin_manage_seating_templates" ON seating_templates;
CREATE POLICY "admin_manage_seating_templates" ON seating_templates
  FOR ALL USING (
    auth.uid() IN (
      SELECT id FROM admin_users WHERE role IN ('owner', 'super_admin', 'full_admin')
    )
  );

DROP POLICY IF EXISTS "service_manage_seating_templates" ON seating_templates;
CREATE POLICY "service_manage_seating_templates" ON seating_templates
  FOR ALL WITH CHECK (true);


-- 2. seating_template_sections
CREATE TABLE IF NOT EXISTS seating_template_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES seating_templates(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  layout_type TEXT NOT NULL DEFAULT 'rows'
);

CREATE INDEX IF NOT EXISTS idx_seating_template_sections_template_id ON seating_template_sections(template_id);

ALTER TABLE seating_template_sections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_seating_template_sections" ON seating_template_sections;
CREATE POLICY "public_read_seating_template_sections" ON seating_template_sections
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "admin_manage_seating_template_sections" ON seating_template_sections;
CREATE POLICY "admin_manage_seating_template_sections" ON seating_template_sections
  FOR ALL USING (
    auth.uid() IN (
      SELECT id FROM admin_users WHERE role IN ('owner', 'super_admin', 'full_admin')
    )
  );

DROP POLICY IF EXISTS "service_manage_seating_template_sections" ON seating_template_sections;
CREATE POLICY "service_manage_seating_template_sections" ON seating_template_sections
  FOR ALL WITH CHECK (true);


-- 3. seating_template_rows
CREATE TABLE IF NOT EXISTS seating_template_rows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id UUID NOT NULL REFERENCES seating_template_sections(id) ON DELETE CASCADE,
  row_label TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_seating_template_rows_section_id ON seating_template_rows(section_id);

ALTER TABLE seating_template_rows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_seating_template_rows" ON seating_template_rows;
CREATE POLICY "public_read_seating_template_rows" ON seating_template_rows
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "admin_manage_seating_template_rows" ON seating_template_rows;
CREATE POLICY "admin_manage_seating_template_rows" ON seating_template_rows
  FOR ALL USING (
    auth.uid() IN (
      SELECT id FROM admin_users WHERE role IN ('owner', 'super_admin', 'full_admin')
    )
  );

DROP POLICY IF EXISTS "service_manage_seating_template_rows" ON seating_template_rows;
CREATE POLICY "service_manage_seating_template_rows" ON seating_template_rows
  FOR ALL WITH CHECK (true);


-- 4. seating_template_tables
CREATE TABLE IF NOT EXISTS seating_template_tables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id UUID NOT NULL REFERENCES seating_template_sections(id) ON DELETE CASCADE,
  table_label TEXT NOT NULL,
  seat_count INTEGER NOT NULL DEFAULT 0,
  x NUMERIC(10,2) DEFAULT 0,
  y NUMERIC(10,2) DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_seating_template_tables_section_id ON seating_template_tables(section_id);

ALTER TABLE seating_template_tables ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_seating_template_tables" ON seating_template_tables;
CREATE POLICY "public_read_seating_template_tables" ON seating_template_tables
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "admin_manage_seating_template_tables" ON seating_template_tables;
CREATE POLICY "admin_manage_seating_template_tables" ON seating_template_tables
  FOR ALL USING (
    auth.uid() IN (
      SELECT id FROM admin_users WHERE role IN ('owner', 'super_admin', 'full_admin')
    )
  );

DROP POLICY IF EXISTS "service_manage_seating_template_tables" ON seating_template_tables;
CREATE POLICY "service_manage_seating_template_tables" ON seating_template_tables
  FOR ALL WITH CHECK (true);


-- 5. seating_template_seats
CREATE TABLE IF NOT EXISTS seating_template_seats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  row_id UUID REFERENCES seating_template_rows(id) ON DELETE CASCADE,
  table_id UUID REFERENCES seating_template_tables(id) ON DELETE CASCADE,
  seat_number INTEGER NOT NULL DEFAULT 0,
  x NUMERIC(10,2) DEFAULT 0,
  y NUMERIC(10,2) DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_seating_template_seats_row_id ON seating_template_seats(row_id);
CREATE INDEX IF NOT EXISTS idx_seating_template_seats_table_id ON seating_template_seats(table_id);

ALTER TABLE seating_template_seats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_seating_template_seats" ON seating_template_seats;
CREATE POLICY "public_read_seating_template_seats" ON seating_template_seats
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "admin_manage_seating_template_seats" ON seating_template_seats;
CREATE POLICY "admin_manage_seating_template_seats" ON seating_template_seats
  FOR ALL USING (
    auth.uid() IN (
      SELECT id FROM admin_users WHERE role IN ('owner', 'super_admin', 'full_admin')
    )
  );

DROP POLICY IF EXISTS "service_manage_seating_template_seats" ON seating_template_seats;
CREATE POLICY "service_manage_seating_template_seats" ON seating_template_seats
  FOR ALL WITH CHECK (true);

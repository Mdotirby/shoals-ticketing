-- ============================================================
-- Reserved Seating Migration
-- Creates 6 new tables for optional reserved seating support.
-- Does NOT alter any existing tables.
-- Run in Supabase SQL Editor.
-- ============================================================

-- 1. seating_charts
CREATE TABLE IF NOT EXISTS seating_charts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  venue_name TEXT,
  venue_id UUID,
  total_sections INTEGER NOT NULL DEFAULT 0,
  chart_data JSONB,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_seating_charts_venue_id ON seating_charts(venue_id);
CREATE INDEX IF NOT EXISTS idx_seating_charts_created_at ON seating_charts(created_at);

ALTER TABLE seating_charts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_seating_charts" ON seating_charts;
CREATE POLICY "public_read_seating_charts" ON seating_charts
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "admin_manage_seating_charts" ON seating_charts;
CREATE POLICY "admin_manage_seating_charts" ON seating_charts
  FOR ALL USING (
    auth.uid() IN (
      SELECT id FROM admin_users WHERE role IN ('owner', 'super_admin', 'full_admin')
    )
  );

DROP POLICY IF EXISTS "service_manage_seating_charts" ON seating_charts;
CREATE POLICY "service_manage_seating_charts" ON seating_charts
  FOR ALL WITH CHECK (true);


-- 2. seating_sections
CREATE TABLE IF NOT EXISTS seating_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chart_id UUID NOT NULL REFERENCES seating_charts(id) ON DELETE CASCADE,
  section_name TEXT NOT NULL,
  color TEXT DEFAULT '#6366f1',
  price_tier NUMERIC(10,2) NOT NULL DEFAULT 0,
  row_count INTEGER NOT NULL DEFAULT 0,
  seat_count INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_seating_sections_chart_id ON seating_sections(chart_id);

ALTER TABLE seating_sections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_seating_sections" ON seating_sections;
CREATE POLICY "public_read_seating_sections" ON seating_sections
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "admin_manage_seating_sections" ON seating_sections;
CREATE POLICY "admin_manage_seating_sections" ON seating_sections
  FOR ALL USING (
    auth.uid() IN (
      SELECT id FROM admin_users WHERE role IN ('owner', 'super_admin', 'full_admin')
    )
  );

DROP POLICY IF EXISTS "service_manage_seating_sections" ON seating_sections;
CREATE POLICY "service_manage_seating_sections" ON seating_sections
  FOR ALL WITH CHECK (true);


-- 3. seating_rows
CREATE TABLE IF NOT EXISTS seating_rows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id UUID NOT NULL REFERENCES seating_sections(id) ON DELETE CASCADE,
  row_label TEXT NOT NULL,
  seat_count INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_seating_rows_section_id ON seating_rows(section_id);

ALTER TABLE seating_rows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_seating_rows" ON seating_rows;
CREATE POLICY "public_read_seating_rows" ON seating_rows
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "admin_manage_seating_rows" ON seating_rows;
CREATE POLICY "admin_manage_seating_rows" ON seating_rows
  FOR ALL USING (
    auth.uid() IN (
      SELECT id FROM admin_users WHERE role IN ('owner', 'super_admin', 'full_admin')
    )
  );

DROP POLICY IF EXISTS "service_manage_seating_rows" ON seating_rows;
CREATE POLICY "service_manage_seating_rows" ON seating_rows
  FOR ALL WITH CHECK (true);


-- 4. seating_seats
CREATE TABLE IF NOT EXISTS seating_seats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  row_id UUID NOT NULL REFERENCES seating_rows(id) ON DELETE CASCADE,
  seat_number TEXT NOT NULL,
  x_position NUMERIC(10,2) DEFAULT 0,
  y_position NUMERIC(10,2) DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'available'
);

CREATE INDEX IF NOT EXISTS idx_seating_seats_row_id ON seating_seats(row_id);
CREATE INDEX IF NOT EXISTS idx_seating_seats_status ON seating_seats(status);

ALTER TABLE seating_seats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_seating_seats" ON seating_seats;
CREATE POLICY "public_read_seating_seats" ON seating_seats
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "admin_manage_seating_seats" ON seating_seats;
CREATE POLICY "admin_manage_seating_seats" ON seating_seats
  FOR ALL USING (
    auth.uid() IN (
      SELECT id FROM admin_users WHERE role IN ('owner', 'super_admin', 'full_admin')
    )
  );

DROP POLICY IF EXISTS "service_manage_seating_seats" ON seating_seats;
CREATE POLICY "service_manage_seating_seats" ON seating_seats
  FOR ALL WITH CHECK (true);

-- Enable realtime for live seat status updates
ALTER PUBLICATION supabase_realtime ADD TABLE seating_seats;


-- 5. event_seating_maps
CREATE TABLE IF NOT EXISTS event_seating_maps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL,
  chart_id UUID NOT NULL REFERENCES seating_charts(id) ON DELETE CASCADE,
  reserved_seating_enabled BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_event_seating_maps_event_id ON event_seating_maps(event_id);
CREATE INDEX IF NOT EXISTS idx_event_seating_maps_chart_id ON event_seating_maps(chart_id);

ALTER TABLE event_seating_maps ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_event_seating_maps" ON event_seating_maps;
CREATE POLICY "public_read_event_seating_maps" ON event_seating_maps
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "admin_manage_event_seating_maps" ON event_seating_maps;
CREATE POLICY "admin_manage_event_seating_maps" ON event_seating_maps
  FOR ALL USING (
    auth.uid() IN (
      SELECT id FROM admin_users WHERE role IN ('owner', 'super_admin', 'full_admin')
    )
  );

DROP POLICY IF EXISTS "service_manage_event_seating_maps" ON event_seating_maps;
CREATE POLICY "service_manage_event_seating_maps" ON event_seating_maps
  FOR ALL WITH CHECK (true);


-- 6. seat_reservations
CREATE TABLE IF NOT EXISTS seat_reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seat_id UUID NOT NULL REFERENCES seating_seats(id) ON DELETE CASCADE,
  event_id UUID NOT NULL,
  user_id UUID,
  session_id TEXT,
  reservation_expires TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'held',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_seat_reservations_seat_id ON seat_reservations(seat_id);
CREATE INDEX IF NOT EXISTS idx_seat_reservations_event_id ON seat_reservations(event_id);
CREATE INDEX IF NOT EXISTS idx_seat_reservations_status ON seat_reservations(status);
CREATE INDEX IF NOT EXISTS idx_seat_reservations_expires ON seat_reservations(reservation_expires);

ALTER TABLE seat_reservations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_seat_reservations" ON seat_reservations;
CREATE POLICY "public_read_seat_reservations" ON seat_reservations
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "admin_manage_seat_reservations" ON seat_reservations;
CREATE POLICY "admin_manage_seat_reservations" ON seat_reservations
  FOR ALL USING (
    auth.uid() IN (
      SELECT id FROM admin_users WHERE role IN ('owner', 'super_admin', 'full_admin')
    )
  );

DROP POLICY IF EXISTS "service_manage_seat_reservations" ON seat_reservations;
CREATE POLICY "service_manage_seat_reservations" ON seat_reservations
  FOR ALL WITH CHECK (true);

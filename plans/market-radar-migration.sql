-- Market Radar Module Migration
-- Creates schema, tables, indexes, triggers, and RLS policies

-- ============================================================
-- SCHEMA
-- ============================================================
CREATE SCHEMA IF NOT EXISTS market_radar;

-- ============================================================
-- TABLES
-- ============================================================

-- Events table: stores normalized event data from all sources
CREATE TABLE IF NOT EXISTS market_radar.events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  artist_name TEXT NOT NULL,
  event_name TEXT,
  venue_name TEXT NOT NULL,
  venue_city TEXT NOT NULL,
  venue_state TEXT NOT NULL,
  venue_capacity INTEGER,
  event_date DATE NOT NULL,
  announce_date DATE,
  ticket_price_low NUMERIC(10,2),
  ticket_price_high NUMERIC(10,2),
  ticket_url TEXT,
  ticket_provider TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  distance_from_shoals DOUBLE PRECISION,
  tracker_count INTEGER,
  rsvp_count INTEGER,
  estimated_tickets_sold INTEGER,
  estimated_tickets_remaining INTEGER,
  sale_velocity NUMERIC(10,2),
  competition_score NUMERIC(5,2),
  routing_cluster_id UUID,
  source TEXT NOT NULL, -- 'ticketmaster', 'bandsintown', 'venue_scrape'
  source_event_id TEXT,
  raw_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(artist_name, venue_name, event_date)
);

-- Routing clusters: groups of nearby shows suggesting a tour route
CREATE TABLE IF NOT EXISTS market_radar.routing_clusters (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  artist_name TEXT NOT NULL,
  cluster_start_date DATE NOT NULL,
  cluster_end_date DATE NOT NULL,
  event_count INTEGER NOT NULL,
  confidence_score NUMERIC(5,2) NOT NULL,
  avg_distance_between_stops DOUBLE PRECISION,
  cities TEXT[],
  nearest_event_id UUID REFERENCES market_radar.events(id),
  nearest_distance DOUBLE PRECISION,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Competition: pairwise competition analysis between events
CREATE TABLE IF NOT EXISTS market_radar.competition (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id UUID NOT NULL REFERENCES market_radar.events(id) ON DELETE CASCADE,
  competing_event_id UUID NOT NULL REFERENCES market_radar.events(id) ON DELETE CASCADE,
  distance_between DOUBLE PRECISION NOT NULL,
  date_overlap BOOLEAN DEFAULT TRUE,
  price_similarity NUMERIC(5,2),
  capacity_overlap NUMERIC(5,2),
  competition_score NUMERIC(5,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(event_id, competing_event_id)
);

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_events_artist ON market_radar.events(artist_name);
CREATE INDEX IF NOT EXISTS idx_events_date ON market_radar.events(event_date);
CREATE INDEX IF NOT EXISTS idx_events_city ON market_radar.events(venue_city);
CREATE INDEX IF NOT EXISTS idx_events_source ON market_radar.events(source);
CREATE INDEX IF NOT EXISTS idx_events_routing_cluster ON market_radar.events(routing_cluster_id);
CREATE INDEX IF NOT EXISTS idx_events_competition_score ON market_radar.events(competition_score);

CREATE INDEX IF NOT EXISTS idx_routing_artist ON market_radar.routing_clusters(artist_name);
CREATE INDEX IF NOT EXISTS idx_routing_dates ON market_radar.routing_clusters(cluster_start_date, cluster_end_date);

CREATE INDEX IF NOT EXISTS idx_competition_event ON market_radar.competition(event_id);
CREATE INDEX IF NOT EXISTS idx_competition_competing ON market_radar.competition(competing_event_id);

-- ============================================================
-- UPDATED_AT TRIGGER
-- ============================================================

CREATE OR REPLACE FUNCTION market_radar.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_events_updated_at
  BEFORE UPDATE ON market_radar.events
  FOR EACH ROW
  EXECUTE FUNCTION market_radar.set_updated_at();

CREATE TRIGGER trg_routing_clusters_updated_at
  BEFORE UPDATE ON market_radar.routing_clusters
  FOR EACH ROW
  EXECUTE FUNCTION market_radar.set_updated_at();

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE market_radar.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE market_radar.routing_clusters ENABLE ROW LEVEL SECURITY;
ALTER TABLE market_radar.competition ENABLE ROW LEVEL SECURITY;

-- Authenticated users: read-only SELECT
CREATE POLICY "Authenticated users can read events"
  ON market_radar.events
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can read routing_clusters"
  ON market_radar.routing_clusters
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can read competition"
  ON market_radar.competition
  FOR SELECT
  TO authenticated
  USING (true);

-- Service role: full access on all tables
CREATE POLICY "Service role full access on events"
  ON market_radar.events
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role full access on routing_clusters"
  ON market_radar.routing_clusters
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role full access on competition"
  ON market_radar.competition
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

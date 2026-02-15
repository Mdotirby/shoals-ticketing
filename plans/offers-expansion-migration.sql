-- ============================================================
-- Offers Expansion Migration
-- Expands artist_offers to support full offer sheet template.
-- Run in Supabase SQL Editor.
-- ============================================================

-- Agency info
ALTER TABLE artist_offers ADD COLUMN IF NOT EXISTS agency TEXT;
ALTER TABLE artist_offers ADD COLUMN IF NOT EXISTS agent_name TEXT;
ALTER TABLE artist_offers ADD COLUMN IF NOT EXISTS agent_phone TEXT;
ALTER TABLE artist_offers ADD COLUMN IF NOT EXISTS agent_email TEXT;

-- Show details
ALTER TABLE artist_offers ADD COLUMN IF NOT EXISTS day_of_event TEXT;
ALTER TABLE artist_offers ADD COLUMN IF NOT EXISTS num_shows INTEGER DEFAULT 1;
ALTER TABLE artist_offers ADD COLUMN IF NOT EXISTS show_length TEXT;
ALTER TABLE artist_offers ADD COLUMN IF NOT EXISTS show_time TEXT;
ALTER TABLE artist_offers ADD COLUMN IF NOT EXISTS billing TEXT DEFAULT '100% Headline';

-- Show lineup (dynamic array)
ALTER TABLE artist_offers ADD COLUMN IF NOT EXISTS show_lineup JSONB DEFAULT '[]'::jsonb;

-- Deal terms
ALTER TABLE artist_offers ADD COLUMN IF NOT EXISTS other_terms TEXT;
ALTER TABLE artist_offers ADD COLUMN IF NOT EXISTS radius_distance TEXT;
ALTER TABLE artist_offers ADD COLUMN IF NOT EXISTS radius_days_prior INTEGER;
ALTER TABLE artist_offers ADD COLUMN IF NOT EXISTS radius_days_after INTEGER;
ALTER TABLE artist_offers ADD COLUMN IF NOT EXISTS production_by TEXT;
ALTER TABLE artist_offers ADD COLUMN IF NOT EXISTS deposit_pct NUMERIC(5,2);
ALTER TABLE artist_offers ADD COLUMN IF NOT EXISTS deposit_amount NUMERIC(10,2);
ALTER TABLE artist_offers ADD COLUMN IF NOT EXISTS deposit_due TEXT;
ALTER TABLE artist_offers ADD COLUMN IF NOT EXISTS balance_due TEXT DEFAULT 'Day of Show';
ALTER TABLE artist_offers ADD COLUMN IF NOT EXISTS merch_split TEXT;
ALTER TABLE artist_offers ADD COLUMN IF NOT EXISTS merch_seller TEXT;
ALTER TABLE artist_offers ADD COLUMN IF NOT EXISTS comps INTEGER DEFAULT 0;

-- Ticket scaling (dynamic array of rows)
ALTER TABLE artist_offers ADD COLUMN IF NOT EXISTS ticket_scaling JSONB DEFAULT '[]'::jsonb;

-- Expenses (dynamic)
ALTER TABLE artist_offers ADD COLUMN IF NOT EXISTS fixed_expenses JSONB DEFAULT '[]'::jsonb;
ALTER TABLE artist_offers ADD COLUMN IF NOT EXISTS variable_expenses JSONB DEFAULT '[]'::jsonb;

-- Calculated totals (stored for quick access)
ALTER TABLE artist_offers ADD COLUMN IF NOT EXISTS total_fixed NUMERIC(10,2) DEFAULT 0;
ALTER TABLE artist_offers ADD COLUMN IF NOT EXISTS total_variable NUMERIC(10,2) DEFAULT 0;
ALTER TABLE artist_offers ADD COLUMN IF NOT EXISTS total_expenses NUMERIC(10,2) DEFAULT 0;
ALTER TABLE artist_offers ADD COLUMN IF NOT EXISTS gross_potential NUMERIC(10,2) DEFAULT 0;
ALTER TABLE artist_offers ADD COLUMN IF NOT EXISTS adj_gross NUMERIC(10,2) DEFAULT 0;
ALTER TABLE artist_offers ADD COLUMN IF NOT EXISTS tax_rate NUMERIC(5,4) DEFAULT 0;
ALTER TABLE artist_offers ADD COLUMN IF NOT EXISTS net_potential NUMERIC(10,2) DEFAULT 0;
ALTER TABLE artist_offers ADD COLUMN IF NOT EXISTS splitpoint NUMERIC(10,2) DEFAULT 0;
ALTER TABLE artist_offers ADD COLUMN IF NOT EXISTS artist_backend NUMERIC(10,2) DEFAULT 0;
ALTER TABLE artist_offers ADD COLUMN IF NOT EXISTS pot_walkout NUMERIC(10,2) DEFAULT 0;
ALTER TABLE artist_offers ADD COLUMN IF NOT EXISTS offer_valid_days INTEGER DEFAULT 14;

-- Venue association
ALTER TABLE artist_offers ADD COLUMN IF NOT EXISTS venue_id UUID REFERENCES venues(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_artist_offers_venue_id ON artist_offers(venue_id);

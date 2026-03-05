-- Add event_venue_id column to artist_offers table
-- This tracks which event venue (where the show happens) is associated with the offer
-- Distinct from venue_id which tracks the management company
-- Run this in Supabase SQL Editor

ALTER TABLE artist_offers ADD COLUMN IF NOT EXISTS event_venue_id UUID REFERENCES event_venues(id);

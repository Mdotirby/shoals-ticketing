-- Add venue info fields to artist_offers table
-- Run this in Supabase SQL Editor

ALTER TABLE artist_offers ADD COLUMN IF NOT EXISTS venue_address TEXT;
ALTER TABLE artist_offers ADD COLUMN IF NOT EXISTS venue_contact TEXT;
ALTER TABLE artist_offers ADD COLUMN IF NOT EXISTS venue_phone TEXT;

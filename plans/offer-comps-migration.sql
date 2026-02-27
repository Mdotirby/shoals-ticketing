-- Add artist_comps and marketing_comps columns to artist_offers
-- Run in Supabase SQL Editor. Idempotent — safe to re-run.

ALTER TABLE artist_offers ADD COLUMN IF NOT EXISTS artist_comps INTEGER DEFAULT 0;
ALTER TABLE artist_offers ADD COLUMN IF NOT EXISTS marketing_comps INTEGER DEFAULT 0;

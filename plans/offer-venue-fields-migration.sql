-- Add venue info fields to artist_offers table
-- AND avatar_url to admin_users for artist photos
-- Run this in Supabase SQL Editor

ALTER TABLE artist_offers ADD COLUMN IF NOT EXISTS venue_address TEXT;
ALTER TABLE artist_offers ADD COLUMN IF NOT EXISTS venue_contact TEXT;
ALTER TABLE artist_offers ADD COLUMN IF NOT EXISTS venue_phone TEXT;

-- Artist avatar support
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- Create artist-avatars storage bucket (run as superuser or via Supabase dashboard)
-- INSERT INTO storage.buckets (id, name, public) VALUES ('artist-avatars', 'artist-avatars', true)
-- ON CONFLICT (id) DO NOTHING;

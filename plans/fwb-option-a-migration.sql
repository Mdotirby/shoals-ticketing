-- FWB Option A: Add is_fwb_subscriber flag, phone, and source to newsletter_subscribers
-- Run this in Supabase SQL Editor

-- Add source column (tracks where the signup came from)
ALTER TABLE newsletter_subscribers
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'homepage';

-- Add phone column (optional, collected at checkout and /fwb page)
ALTER TABLE newsletter_subscribers
  ADD COLUMN IF NOT EXISTS phone TEXT;

-- Add is_fwb_subscriber flag (true if signed up via /fwb page or checkout fwb_opt_in)
ALTER TABLE newsletter_subscribers
  ADD COLUMN IF NOT EXISTS is_fwb_subscriber BOOLEAN NOT NULL DEFAULT false;

-- Index for segmenting FWB subscribers in campaigns
CREATE INDEX IF NOT EXISTS idx_newsletter_fwb_subscribers
  ON newsletter_subscribers(is_fwb_subscriber)
  WHERE is_fwb_subscriber = true AND unsubscribed_at IS NULL;

-- Backfill existing records: mark any with FWB-related sources as FWB subscribers
UPDATE newsletter_subscribers
  SET is_fwb_subscriber = true
  WHERE source IN ('fwb_landing', 'checkout', 'checkout_fwb', 'exit_intent')
    AND is_fwb_subscriber = false;

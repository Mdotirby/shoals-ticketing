-- Go-Live Migration: Free Event Logic + On-Sale Scheduler
-- Run this in Supabase SQL Editor before deploying the code changes.

ALTER TABLE events ADD COLUMN IF NOT EXISTS is_free boolean DEFAULT false;
ALTER TABLE events ADD COLUMN IF NOT EXISTS on_sale_at timestamptz DEFAULT null;

-- ============================================================
-- Events — Email Flyer Image Migration
-- events.image_url is the website landing page's hero background (wide
-- crop). The announcement email needs a separate 1080x1350 portrait
-- flyer, purpose-built for email/social — not the same asset, not the
-- same aspect ratio. Additive only.
-- Run in Supabase SQL Editor.
-- ============================================================

ALTER TABLE events ADD COLUMN IF NOT EXISTS email_flyer_url TEXT;

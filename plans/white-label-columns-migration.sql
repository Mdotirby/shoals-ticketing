-- ============================================================
-- White-Label Branding Columns — SAFE TO RE-RUN
-- Adds all branding/theming columns missing from FULL-MIGRATION.
-- Run in Supabase SQL Editor.
-- ============================================================

-- Hero images (stored in Supabase storage, URL saved to DB)
ALTER TABLE venues ADD COLUMN IF NOT EXISTS hero_image_url   TEXT;
ALTER TABLE venues ADD COLUMN IF NOT EXISTS hero_image_2_url TEXT;

-- Favicon (custom per-venue browser tab icon)
ALTER TABLE venues ADD COLUMN IF NOT EXISTS favicon_url TEXT;

-- Brand colors (accent was added in settings migration, others may already exist)
ALTER TABLE venues ADD COLUMN IF NOT EXISTS primary_color   TEXT DEFAULT '#d0c290';
ALTER TABLE venues ADD COLUMN IF NOT EXISTS secondary_color TEXT DEFAULT '#111827';
ALTER TABLE venues ADD COLUMN IF NOT EXISTS accent_color    TEXT DEFAULT '#202045';

-- Contact & social
ALTER TABLE venues ADD COLUMN IF NOT EXISTS tagline            TEXT;
ALTER TABLE venues ADD COLUMN IF NOT EXISTS footer_description TEXT;
ALTER TABLE venues ADD COLUMN IF NOT EXISTS support_email      TEXT;
ALTER TABLE venues ADD COLUMN IF NOT EXISTS contact_email      TEXT;
ALTER TABLE venues ADD COLUMN IF NOT EXISTS instagram_url      TEXT;
ALTER TABLE venues ADD COLUMN IF NOT EXISTS facebook_url       TEXT;

-- Homepage content
ALTER TABLE venues ADD COLUMN IF NOT EXISTS homepage_headline    TEXT;
ALTER TABLE venues ADD COLUMN IF NOT EXISTS homepage_subheadline TEXT;
ALTER TABLE venues ADD COLUMN IF NOT EXISTS homepage_cta_text    TEXT DEFAULT 'See What''s Coming';
ALTER TABLE venues ADD COLUMN IF NOT EXISTS homepage_cta_url     TEXT DEFAULT '/events';

-- About page content
ALTER TABLE venues ADD COLUMN IF NOT EXISTS about_headline    TEXT;
ALTER TABLE venues ADD COLUMN IF NOT EXISTS about_description TEXT;
ALTER TABLE venues ADD COLUMN IF NOT EXISTS about_image_url   TEXT;
ALTER TABLE venues ADD COLUMN IF NOT EXISTS about_features    JSONB DEFAULT '[]';

-- Custom domain support (e.g. "www.myvenue.com" → maps to this venue's slug)
ALTER TABLE venues ADD COLUMN IF NOT EXISTS custom_domain TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_venues_custom_domain ON venues(custom_domain) WHERE custom_domain IS NOT NULL;

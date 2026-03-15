-- White-Label Branding Migration
-- Adds branding and content columns to venues table for the dynamic theming system

-- Branding colors (accent_color is new; primary/secondary already exist)
ALTER TABLE venues ADD COLUMN IF NOT EXISTS accent_color TEXT DEFAULT '#202045';

-- Favicon
ALTER TABLE venues ADD COLUMN IF NOT EXISTS favicon_url TEXT;

-- Contact & social
ALTER TABLE venues ADD COLUMN IF NOT EXISTS tagline TEXT;
ALTER TABLE venues ADD COLUMN IF NOT EXISTS footer_description TEXT;
ALTER TABLE venues ADD COLUMN IF NOT EXISTS support_email TEXT;
ALTER TABLE venues ADD COLUMN IF NOT EXISTS contact_email TEXT;

-- Homepage content
ALTER TABLE venues ADD COLUMN IF NOT EXISTS homepage_headline TEXT;
ALTER TABLE venues ADD COLUMN IF NOT EXISTS homepage_subheadline TEXT;
ALTER TABLE venues ADD COLUMN IF NOT EXISTS homepage_cta_text TEXT DEFAULT 'See What''s Coming';
ALTER TABLE venues ADD COLUMN IF NOT EXISTS homepage_cta_url TEXT DEFAULT '/events';

-- About page content
ALTER TABLE venues ADD COLUMN IF NOT EXISTS about_headline TEXT;
ALTER TABLE venues ADD COLUMN IF NOT EXISTS about_description TEXT;
ALTER TABLE venues ADD COLUMN IF NOT EXISTS about_image_url TEXT;
ALTER TABLE venues ADD COLUMN IF NOT EXISTS about_features JSONB DEFAULT '[]';

-- Custom domain support (e.g. "www.venueexample.com")
ALTER TABLE venues ADD COLUMN IF NOT EXISTS custom_domain TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_venues_custom_domain ON venues(custom_domain) WHERE custom_domain IS NOT NULL;

-- Add per-event Meta Pixel ID support
-- Allows co-promoters / advertisers to inject their own Meta Pixel
-- on the specific event pages where they're running paid social ads.
-- NULL = no event-level pixel (default); only the operator pixel fires.

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS meta_pixel_id text;

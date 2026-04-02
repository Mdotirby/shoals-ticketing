-- ============================================================================
-- TRACKABLE LINKS — Atomic Increment RPC Functions
-- ============================================================================
-- These functions provide atomic increment operations for the denormalized
-- counters on trackable_links, avoiding race conditions from read-then-write
-- patterns in the application layer.
-- ============================================================================

-- Atomically increment the clicks counter
CREATE OR REPLACE FUNCTION increment_trackable_link_clicks(link_row_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE trackable_links
  SET clicks = COALESCE(clicks, 0) + 1,
      updated_at = now()
  WHERE id = link_row_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Atomically increment conversions and revenue
CREATE OR REPLACE FUNCTION increment_trackable_link_conversion(
  link_row_id UUID,
  revenue_amt NUMERIC DEFAULT 0
)
RETURNS VOID AS $$
BEGIN
  UPDATE trackable_links
  SET conversions = COALESCE(conversions, 0) + 1,
      revenue = COALESCE(revenue, 0) + COALESCE(revenue_amt, 0),
      updated_at = now()
  WHERE id = link_row_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- Backfill: Record Jax Greenhill trackable link conversion
-- ============================================================
-- The Jax Greenhill link (slug: kruse-brothers-002) had a sale
-- but conversion was never recorded because tracking_ref wasn't
-- threaded through checkout. This script manually records it.
--
-- Run this in the Supabase SQL Editor (one time only).
-- ============================================================

-- Step 1: Find the trackable link
-- Verify this returns the Jax Greenhill link
SELECT id, slug, label, event_id, clicks, conversions, revenue
FROM trackable_links
WHERE slug = 'kruse-brothers-002';

-- Step 2: Find the order(s) for this event that came around the time
-- of the Jax Greenhill click. Adjust the date range if needed.
-- Look for orders on the same event_id as the trackable link.
SELECT o.id, o.event_id, o.customer_name, o.customer_email, 
       o.total_amount, o.created_at, o.status
FROM orders o
JOIN trackable_links tl ON tl.event_id = o.event_id
WHERE tl.slug = 'kruse-brothers-002'
  AND o.status = 'paid'
ORDER BY o.created_at DESC
LIMIT 10;

-- ============================================================
-- Step 3: Once you identify the correct order, run this block.
-- Replace <ORDER_ID> and <TOTAL_AMOUNT> with actual values from Step 2.
-- ============================================================

DO $$
DECLARE
  v_link_id UUID;
  v_order_id UUID := '<ORDER_ID>';  -- ← paste the order ID here
  v_revenue NUMERIC := <TOTAL_AMOUNT>;  -- ← paste the total_amount here
BEGIN
  -- Get the trackable link ID
  SELECT id INTO v_link_id
  FROM trackable_links
  WHERE slug = 'kruse-brothers-002'
  LIMIT 1;

  IF v_link_id IS NULL THEN
    RAISE EXCEPTION 'Trackable link with slug kruse-brothers-002 not found';
  END IF;

  -- Check if conversion already exists (idempotency)
  IF EXISTS (
    SELECT 1 FROM trackable_link_events
    WHERE link_id = v_link_id AND order_id = v_order_id AND event_type = 'conversion'
  ) THEN
    RAISE NOTICE 'Conversion already recorded for this order — skipping';
    RETURN;
  END IF;

  -- Insert the conversion event
  INSERT INTO trackable_link_events (link_id, event_type, order_id, revenue_amount)
  VALUES (v_link_id, 'conversion', v_order_id, v_revenue);

  -- Update denormalized counters on the trackable link
  UPDATE trackable_links
  SET conversions = COALESCE(conversions, 0) + 1,
      revenue = COALESCE(revenue, 0) + v_revenue
  WHERE id = v_link_id;

  RAISE NOTICE 'Conversion recorded: link=%, order=%, revenue=%', v_link_id, v_order_id, v_revenue;
END $$;

-- Step 4: Verify it worked
SELECT id, slug, label, clicks, conversions, revenue
FROM trackable_links
WHERE slug = 'kruse-brothers-002';

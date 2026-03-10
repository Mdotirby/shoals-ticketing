-- Backfill existing events and venues to new fee infrastructure
-- This migration ensures all existing records have proper fee values

-- 1. Copy fees from venues to event_venues where events link both tables
UPDATE event_venues ev
SET 
  ticketing_fee = COALESCE(ev.ticketing_fee, v.ticketing_fee, 3.00),
  facility_fee = COALESCE(ev.facility_fee, v.facility_fee, 0),
  tax_rate = COALESCE(ev.tax_rate, v.tax_rate, 0.095)
FROM events e
JOIN venues v ON e.venue_id = v.id
WHERE e.event_venue_id = ev.id
  AND (ev.ticketing_fee IS NULL OR ev.facility_fee IS NULL OR ev.tax_rate IS NULL);

-- 2. Set facility_fee_enabled for all existing events
UPDATE events 
SET facility_fee_enabled = true 
WHERE facility_fee_enabled IS NULL;

-- 3. Set platform defaults for any event_venues without fees
UPDATE event_venues 
SET 
  ticketing_fee = COALESCE(ticketing_fee, 3.00),
  facility_fee = COALESCE(facility_fee, 0),
  tax_rate = COALESCE(tax_rate, 0.095)
WHERE ticketing_fee IS NULL OR facility_fee IS NULL OR tax_rate IS NULL;

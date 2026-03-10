-- Add fee columns to event_venues (per physical venue)
ALTER TABLE event_venues ADD COLUMN IF NOT EXISTS ticketing_fee NUMERIC(10,2) DEFAULT 3.00;
ALTER TABLE event_venues ADD COLUMN IF NOT EXISTS facility_fee NUMERIC(10,2) DEFAULT 0;
ALTER TABLE event_venues ADD COLUMN IF NOT EXISTS tax_rate NUMERIC(6,4) DEFAULT 0.095;

-- Add per-event facility fee toggle to events table
ALTER TABLE events ADD COLUMN IF NOT EXISTS facility_fee_enabled BOOLEAN DEFAULT true;

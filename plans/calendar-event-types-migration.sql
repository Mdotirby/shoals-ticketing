-- Calendar & Event Types Migration
-- Adds support for non-ticketed and private events on the venue calendar

-- Add event_type column: ticketed (default), non_ticketed, private
ALTER TABLE events ADD COLUMN IF NOT EXISTS event_type TEXT DEFAULT 'ticketed'
  CHECK (event_type IN ('ticketed', 'non_ticketed', 'private'));

-- Add internal notes for calendar context
ALTER TABLE events ADD COLUMN IF NOT EXISTS notes TEXT;

-- Add optional calendar display color
ALTER TABLE events ADD COLUMN IF NOT EXISTS calendar_color TEXT;

-- Add end_time for events that span a time range  
ALTER TABLE events ADD COLUMN IF NOT EXISTS end_time TIMESTAMPTZ;

-- Index for efficient calendar queries
CREATE INDEX IF NOT EXISTS idx_events_date_venue ON events(date, venue_id);
CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type);

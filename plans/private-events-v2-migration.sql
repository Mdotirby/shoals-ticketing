-- Private Events V2 Migration
-- Adds client fields to events, lessor fields to venues, and attachments table

-- Venues: add lessor fields
ALTER TABLE venues ADD COLUMN IF NOT EXISTS lessor_name TEXT;
ALTER TABLE venues ADD COLUMN IF NOT EXISTS lessor_company TEXT;

-- Events: add client fields for private events
ALTER TABLE events ADD COLUMN IF NOT EXISTS client_name TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS client_email TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS client_phone TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS client_billing_address TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS client_company TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS tax_exempt BOOLEAN DEFAULT false;
ALTER TABLE events ADD COLUMN IF NOT EXISTS start_time TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS end_time TEXT;

-- Attachments table
CREATE TABLE IF NOT EXISTS private_event_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  file_url TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_type TEXT DEFAULT 'application/pdf',
  uploaded_by UUID,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pe_attachments_event ON private_event_attachments(event_id);

-- RLS policies for private_event_attachments
ALTER TABLE private_event_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to private_event_attachments"
  ON private_event_attachments
  FOR ALL
  USING (true)
  WITH CHECK (true);

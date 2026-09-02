-- ============================================================
-- Venues account_type + Event Workspace fields + manual Holds log
-- Run in Supabase SQL Editor.
-- ============================================================

-- 1) venues.account_type — distinguishes West72's own venues from venues
--    onboarded as clients of the platform. Powers the Venues page's
--    "Your venues" / "Client venues" split.
ALTER TABLE venues ADD COLUMN IF NOT EXISTS account_type TEXT NOT NULL DEFAULT 'client'
  CHECK (account_type IN ('own', 'client'));

-- Backfill: the two venues West72 Entertainment itself operates.
UPDATE venues SET account_type = 'own' WHERE slug IN ('srb', 'West72');

-- 2) events — a few fields the Event Workspace's "At a Glance" card
--    displays. All nullable; the UI shows "—" when unset.
ALTER TABLE events ADD COLUMN IF NOT EXISTS doors_time TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS age_restriction TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS talent_buyer TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS booking_agent TEXT;

-- 3) event_holds — manual bookkeeping only. Records that a human decided
--    to set aside N tickets of a tier for a named reason. Does NOT touch
--    checkout/availability math anywhere — that interaction (does a hold
--    reduce what buyers see as available in real time?) is still an open
--    decision. This table exists so the Event Workspace's Inventory &
--    Holds tab and the Dashboard's "+ New Hold" quick action have
--    something real to read and write, without pre-deciding that question.
CREATE TABLE IF NOT EXISTS event_holds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  ticket_tier_id UUID REFERENCES ticket_tiers(id) ON DELETE SET NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  hold_type TEXT NOT NULL DEFAULT 'other' CHECK (hold_type IN ('artist', 'promoter', 'house_comp', 'other')),
  owner_label TEXT NOT NULL,       -- e.g. "Cole Phillips team", "Matt Irby", "Staff & press"
  reason TEXT,                     -- e.g. "3 of 5 assigned"
  release_note TEXT,               -- e.g. "releases day-of-show", "no release date set"
  released_at TIMESTAMPTZ,         -- set when someone clicks Release
  created_by UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_event_holds_event ON event_holds(event_id);

ALTER TABLE event_holds ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_manage_event_holds" ON event_holds;
CREATE POLICY "admin_manage_event_holds" ON event_holds
  FOR ALL USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "service_manage_event_holds" ON event_holds;
CREATE POLICY "service_manage_event_holds" ON event_holds
  FOR ALL WITH CHECK (true);

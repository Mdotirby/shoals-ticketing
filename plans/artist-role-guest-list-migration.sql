-- Artist Role + Guest List Migration (idempotent — safe to re-run)
-- Run in Supabase SQL Editor.

-- 1. Add 'artist' to role constraint
DO $$ BEGIN
  ALTER TABLE admin_users DROP CONSTRAINT IF EXISTS admin_users_role_check;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

ALTER TABLE admin_users ADD CONSTRAINT admin_users_role_check
  CHECK (role IN (
    'owner','super_admin','venue_admin','promoter',
    'full_admin','box_office','read_only','door_greeter','artist'
  ));

-- 2. Ensure must_change_password column exists
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT true;

-- 3. Artist↔Event assignment with per-event comp limit
CREATE TABLE IF NOT EXISTS artist_event_assignments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  artist_id   UUID NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  event_id    UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  comp_limit  INTEGER NOT NULL DEFAULT 4,
  UNIQUE (artist_id, event_id)
);

CREATE INDEX IF NOT EXISTS idx_artist_event ON artist_event_assignments(artist_id, event_id);

-- 4. Guest list entries
CREATE TABLE IF NOT EXISTS guest_list (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id    UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  artist_id   UUID NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  first_name  TEXT NOT NULL,
  last_name   TEXT NOT NULL,
  quantity    INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  notes       TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_guest_list_event   ON guest_list(event_id);
CREATE INDEX IF NOT EXISTS idx_guest_list_artist  ON guest_list(artist_id);

-- 5. RLS on artist_event_assignments
ALTER TABLE artist_event_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "organizer_manage_assignments" ON artist_event_assignments;
CREATE POLICY "organizer_manage_assignments" ON artist_event_assignments
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM admin_users au
      WHERE au.id = auth.uid()
        AND au.role IN ('owner','venue_admin')
    )
  );

DROP POLICY IF EXISTS "artist_read_own_assignments" ON artist_event_assignments;
CREATE POLICY "artist_read_own_assignments" ON artist_event_assignments
  FOR SELECT USING (artist_id = auth.uid());

-- 6. RLS on guest_list
ALTER TABLE guest_list ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "artist_manage_own_guests" ON guest_list;
CREATE POLICY "artist_manage_own_guests" ON guest_list
  FOR ALL USING (artist_id = auth.uid());

DROP POLICY IF EXISTS "organizer_read_guests" ON guest_list;
CREATE POLICY "organizer_read_guests" ON guest_list
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM admin_users au
      WHERE au.id = auth.uid()
        AND au.role IN ('owner','venue_admin')
    )
  );

-- 7. Allow organizers to INSERT/UPDATE/DELETE guest_list entries (not just SELECT)
DROP POLICY IF EXISTS "organizer_manage_guests" ON guest_list;
CREATE POLICY "organizer_manage_guests" ON guest_list
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM admin_users au
      WHERE au.id = auth.uid()
        AND au.role IN ('owner','venue_admin')
    )
  );

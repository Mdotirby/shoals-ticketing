-- ============================================================
-- VenueCore Supabase Migration (Incremental)
-- Works with EXISTING tables: admin_users, events, orders,
-- tickets, ticket_types, artist_offers
-- Run in Supabase SQL Editor
-- ============================================================


-- ============================================================
-- 1) ALTER admin_users — add new roles + venue_id column
-- ============================================================

-- Drop the old role CHECK constraint if it exists, then add expanded one
DO $$
BEGIN
  -- Try to drop old constraint (name may vary)
  ALTER TABLE admin_users DROP CONSTRAINT IF EXISTS admin_users_role_check;
EXCEPTION WHEN OTHERS THEN
  NULL; -- ignore if no constraint exists
END $$;

-- Add venue_id column if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'admin_users' AND column_name = 'venue_id'
  ) THEN
    ALTER TABLE admin_users ADD COLUMN venue_id UUID DEFAULT NULL;
  END IF;
END $$;

-- Add the expanded role constraint
ALTER TABLE admin_users ADD CONSTRAINT admin_users_role_check
  CHECK (role IN ('owner', 'super_admin', 'venue_admin', 'promoter', 'full_admin', 'box_office'));

-- Indexes
CREATE INDEX IF NOT EXISTS idx_admin_users_role ON admin_users(role);
CREATE INDEX IF NOT EXISTS idx_admin_users_venue_id ON admin_users(venue_id);

-- RLS
ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;

-- Owner/super_admin can see all admin users
DROP POLICY IF EXISTS "owner_super_read_all" ON admin_users;
CREATE POLICY "owner_super_read_all" ON admin_users
  FOR SELECT USING (
    auth.uid() IN (
      SELECT id FROM admin_users WHERE role IN ('owner', 'super_admin')
    )
  );

-- Owner can manage (insert/update/delete) admin users
DROP POLICY IF EXISTS "owner_manage_admins" ON admin_users;
CREATE POLICY "owner_manage_admins" ON admin_users
  FOR ALL USING (
    auth.uid() IN (
      SELECT id FROM admin_users WHERE role = 'owner'
    )
  );

-- All roles can read their own record
DROP POLICY IF EXISTS "self_read" ON admin_users;
CREATE POLICY "self_read" ON admin_users
  FOR SELECT USING (auth.uid() = id);


-- ============================================================
-- 2) ALTER events — add venue_id if missing
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'events' AND column_name = 'venue_id'
  ) THEN
    ALTER TABLE events ADD COLUMN venue_id UUID DEFAULT NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_events_venue_id ON events(venue_id);
CREATE INDEX IF NOT EXISTS idx_events_date ON events(date);

-- RLS for events (idempotent — drop if exists first)
ALTER TABLE events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_events" ON events;
CREATE POLICY "public_read_events" ON events
  FOR SELECT USING (status = 'published' OR status IS NULL);

DROP POLICY IF EXISTS "admin_manage_events" ON events;
CREATE POLICY "admin_manage_events" ON events
  FOR ALL USING (
    auth.uid() IN (
      SELECT id FROM admin_users WHERE role IN ('owner', 'super_admin', 'full_admin')
    )
  );

DROP POLICY IF EXISTS "venue_admin_manage_events" ON events;
CREATE POLICY "venue_admin_manage_events" ON events
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM admin_users a
      WHERE a.id = auth.uid()
      AND a.role = 'venue_admin'
      AND a.venue_id = events.venue_id
    )
  );


-- ============================================================
-- 3) ALTER ticket_types — add indexes
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_ticket_types_event_id ON ticket_types(event_id);


-- ============================================================
-- 4) ALTER orders — add indexes + RLS
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_orders_event_id ON orders(event_id);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);

-- Add stripe_checkout_session_id index if column exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'stripe_checkout_session_id'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_orders_stripe_session ON orders(stripe_checkout_session_id);
  END IF;
END $$;

ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_read_orders" ON orders;
CREATE POLICY "admin_read_orders" ON orders
  FOR SELECT USING (
    auth.uid() IN (SELECT id FROM admin_users)
  );

-- Allow service role to insert orders (Stripe webhook)
DROP POLICY IF EXISTS "service_insert_orders" ON orders;
CREATE POLICY "service_insert_orders" ON orders
  FOR INSERT WITH CHECK (true);


-- ============================================================
-- 5) ALTER tickets — add indexes + RLS
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_tickets_order_id ON tickets(order_id);
CREATE INDEX IF NOT EXISTS idx_tickets_event_id ON tickets(event_id);
CREATE INDEX IF NOT EXISTS idx_tickets_qr_code ON tickets(qr_code);

ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;

-- Admins can read/update tickets (scanning)
DROP POLICY IF EXISTS "admin_manage_tickets" ON tickets;
CREATE POLICY "admin_manage_tickets" ON tickets
  FOR ALL USING (
    auth.uid() IN (SELECT id FROM admin_users)
  );

-- Public can view tickets (for QR code display page)
DROP POLICY IF EXISTS "public_read_tickets" ON tickets;
CREATE POLICY "public_read_tickets" ON tickets
  FOR SELECT USING (true);

-- Allow service role to insert tickets (Stripe webhook)
DROP POLICY IF EXISTS "service_insert_tickets" ON tickets;
CREATE POLICY "service_insert_tickets" ON tickets
  FOR INSERT WITH CHECK (true);


-- ============================================================
-- 6) ALTER artist_offers — add RLS
-- ============================================================

ALTER TABLE artist_offers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_manage_offers" ON artist_offers;
CREATE POLICY "admin_manage_offers" ON artist_offers
  FOR ALL USING (
    auth.uid() IN (
      SELECT id FROM admin_users WHERE role IN ('owner', 'super_admin', 'full_admin')
    )
  );

-- Allow service role insert (for API routes using service key)
DROP POLICY IF EXISTS "service_insert_offers" ON artist_offers;
CREATE POLICY "service_insert_offers" ON artist_offers
  FOR INSERT WITH CHECK (true);


-- ============================================================
-- SEED: Promote an existing user to owner
-- After creating a user in Supabase Auth → Users,
-- uncomment and run with their UUID:
-- ============================================================
-- UPDATE admin_users
-- SET role = 'owner'
-- WHERE email = 'you@example.com';
--
-- Or if the user doesn't exist in admin_users yet:
-- INSERT INTO admin_users (id, email, role)
-- VALUES ('YOUR-AUTH-USER-UUID', 'you@example.com', 'owner');

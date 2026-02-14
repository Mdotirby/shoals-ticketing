# Supabase Database Setup — Step-by-Step Guide

## Prerequisites
- A Supabase project (you already have one with the `events` table)
- Access to your Supabase Dashboard → SQL Editor

---

## Step 1: Update the Existing `events` Table

Go to **Supabase Dashboard → SQL Editor** and run:

```sql
-- Add new columns to your existing events table
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS image_crop_data JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'published' CHECK (status IN ('draft', 'published'));
```

This adds:
- `description` — event description text
- `image_crop_data` — JSON storing crop coordinates for the event card image
- `status` — draft or published (defaults to published so your existing events still show)

---

## Step 2: Create the `ticket_types` Table

```sql
CREATE TABLE ticket_types (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name TEXT NOT NULL,                    -- e.g. 'GA', 'VIP', 'Table'
  price NUMERIC(10, 2) NOT NULL,
  quantity_available INTEGER NOT NULL DEFAULT 0,
  quantity_sold INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast lookups by event
CREATE INDEX idx_ticket_types_event_id ON ticket_types(event_id);
```

---

## Step 3: Create the `orders` Table

```sql
CREATE TABLE orders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id UUID NOT NULL REFERENCES events(id),
  customer_name TEXT NOT NULL,
  customer_email TEXT NOT NULL,
  customer_phone TEXT,
  stripe_payment_intent_id TEXT,
  stripe_checkout_session_id TEXT,
  total_amount NUMERIC(10, 2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'refunded', 'cancelled')),
  delivery_method TEXT NOT NULL DEFAULT 'digital' CHECK (delivery_method IN ('digital', 'physical')),
  shipping_address JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_orders_event_id ON orders(event_id);
CREATE INDEX idx_orders_customer_email ON orders(customer_email);
CREATE INDEX idx_orders_stripe_session ON orders(stripe_checkout_session_id);
```

---

## Step 4: Create the `tickets` Table

```sql
CREATE TABLE tickets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES events(id),
  ticket_type_id UUID NOT NULL REFERENCES ticket_types(id),
  qr_code TEXT NOT NULL UNIQUE,          -- unique string for QR generation + scanning
  customer_name TEXT NOT NULL,
  customer_email TEXT NOT NULL,
  is_scanned BOOLEAN NOT NULL DEFAULT FALSE,
  scanned_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_tickets_order_id ON tickets(order_id);
CREATE INDEX idx_tickets_event_id ON tickets(event_id);
CREATE INDEX idx_tickets_qr_code ON tickets(qr_code);
```

---

## Step 5: Create the `admin_users` Table

```sql
-- This works alongside Supabase Auth
-- When you create an admin in Supabase Auth, also insert a row here
CREATE TABLE admin_users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL DEFAULT 'box_office' CHECK (role IN ('full_admin', 'box_office')),
  must_change_password BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Step 6: Create the `artist_offers` Table

```sql
CREATE TABLE artist_offers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  artist_name TEXT NOT NULL,
  venue TEXT,
  event_date DATE,
  guarantee NUMERIC(10, 2),
  door_split TEXT,                       -- e.g. '80/20' or '70/30'
  merch_split TEXT,                      -- e.g. '85/15'
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'accepted', 'declined', 'expired')),
  terms TEXT,                            -- contract terms / notes
  notes TEXT,                            -- internal notes
  created_by UUID REFERENCES admin_users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Step 7: Enable Row Level Security (RLS)

```sql
-- Enable RLS on all tables
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE artist_offers ENABLE ROW LEVEL SECURITY;

-- Public can read published events
CREATE POLICY "Public can read published events"
  ON events FOR SELECT
  USING (status = 'published');

-- Public can read ticket types for published events
CREATE POLICY "Public can read ticket types"
  ON ticket_types FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM events WHERE events.id = ticket_types.event_id AND events.status = 'published'
    )
  );

-- Admins can do everything (using Supabase Auth)
CREATE POLICY "Admins full access to events"
  ON events FOR ALL
  USING (
    EXISTS (SELECT 1 FROM admin_users WHERE admin_users.id = auth.uid())
  );

CREATE POLICY "Admins full access to ticket_types"
  ON ticket_types FOR ALL
  USING (
    EXISTS (SELECT 1 FROM admin_users WHERE admin_users.id = auth.uid())
  );

CREATE POLICY "Admins full access to orders"
  ON orders FOR ALL
  USING (
    EXISTS (SELECT 1 FROM admin_users WHERE admin_users.id = auth.uid())
  );

CREATE POLICY "Admins full access to tickets"
  ON tickets FOR ALL
  USING (
    EXISTS (SELECT 1 FROM admin_users WHERE admin_users.id = auth.uid())
  );

CREATE POLICY "Admins full access to artist_offers"
  ON artist_offers FOR ALL
  USING (
    EXISTS (SELECT 1 FROM admin_users WHERE admin_users.id = auth.uid())
  );

CREATE POLICY "Admins can read own profile"
  ON admin_users FOR SELECT
  USING (id = auth.uid());
```

---

## Step 8: Create Your First Admin User

1. Go to **Supabase Dashboard → Authentication → Users**
2. Click **Add User** → **Create New User**
3. Enter your email and a temporary password
4. Copy the user's UUID from the users list
5. Go to **SQL Editor** and run:

```sql
INSERT INTO admin_users (id, email, role, must_change_password)
VALUES (
  'PASTE-THE-UUID-HERE',
  'your-email@example.com',
  'full_admin',
  TRUE
);
```

---

## Step 9: Enable Supabase Storage (for event images)

1. Go to **Supabase Dashboard → Storage**
2. Click **New Bucket**
3. Name it `event-images`
4. Set it to **Public** (so images can be displayed on the site)
5. Add a policy: Allow authenticated users to upload

```sql
CREATE POLICY "Admins can upload event images"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'event-images'
    AND EXISTS (SELECT 1 FROM admin_users WHERE admin_users.id = auth.uid())
  );

CREATE POLICY "Public can view event images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'event-images');
```

---

## Verification

After running all SQL, go to **Supabase Dashboard → Table Editor** and confirm you see:
- ✅ `events` (with new columns)
- ✅ `ticket_types`
- ✅ `orders`
- ✅ `tickets`
- ✅ `admin_users`
- ✅ `artist_offers`

All tables should show a 🔒 lock icon indicating RLS is enabled.

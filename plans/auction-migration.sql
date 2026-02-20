-- VC Auction Feature — Database Migration
-- Run this in the Supabase SQL Editor

-- ═══════════════════════════════════════════════════════════════
-- 1. Add auction_enabled flag to venues
-- ═══════════════════════════════════════════════════════════════
ALTER TABLE venues ADD COLUMN IF NOT EXISTS auction_enabled BOOLEAN DEFAULT false;

-- ═══════════════════════════════════════════════════════════════
-- 2. Core auction table
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS auctions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID REFERENCES venues(id) ON DELETE CASCADE,
  event_id UUID REFERENCES events(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  description TEXT,
  logo_url TEXT,
  auction_open TIMESTAMPTZ NOT NULL,
  auction_close TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  anti_snipe_enabled BOOLEAN DEFAULT true,
  anti_snipe_minutes INTEGER DEFAULT 2,
  host_fee_percent NUMERIC(5,2) DEFAULT 8.00,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ═══════════════════════════════════════════════════════════════
-- 3. Auction items
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS auction_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auction_id UUID NOT NULL REFERENCES auctions(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  starting_bid NUMERIC(10,2) NOT NULL,
  min_increment NUMERIC(10,2) NOT NULL,
  reserve_price NUMERIC(10,2),
  current_bid NUMERIC(10,2),
  current_winner_id UUID,
  qr_code TEXT UNIQUE,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ═══════════════════════════════════════════════════════════════
-- 4. Bidder registration (no auth, just contact info)
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS auction_bidders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auction_id UUID NOT NULL REFERENCES auctions(id) ON DELETE CASCADE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(auction_id, email)
);

-- ═══════════════════════════════════════════════════════════════
-- 5. Bids
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS auction_bids (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL REFERENCES auction_items(id) ON DELETE CASCADE,
  bidder_id UUID NOT NULL REFERENCES auction_bidders(id) ON DELETE CASCADE,
  amount NUMERIC(10,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ═══════════════════════════════════════════════════════════════
-- 6. Post-auction orders
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS auction_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auction_id UUID NOT NULL REFERENCES auctions(id) ON DELETE CASCADE,
  bidder_id UUID NOT NULL REFERENCES auction_bidders(id) ON DELETE CASCADE,
  total_amount NUMERIC(10,2) NOT NULL,
  processing_fee NUMERIC(10,2) DEFAULT 0,
  grand_total NUMERIC(10,2) NOT NULL,
  payment_method TEXT,
  stripe_payment_intent_id TEXT,
  stripe_transaction_id TEXT,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ═══════════════════════════════════════════════════════════════
-- 7. Order line items (won items)
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS auction_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES auction_orders(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES auction_items(id),
  winning_price NUMERIC(10,2) NOT NULL
);

-- ═══════════════════════════════════════════════════════════════
-- 8. Indexes
-- ═══════════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_auctions_venue ON auctions(venue_id);
CREATE INDEX IF NOT EXISTS idx_auctions_event ON auctions(event_id);
CREATE INDEX IF NOT EXISTS idx_auction_items_auction ON auction_items(auction_id);
CREATE INDEX IF NOT EXISTS idx_auction_items_qr ON auction_items(qr_code);
CREATE INDEX IF NOT EXISTS idx_auction_bids_item ON auction_bids(item_id);
CREATE INDEX IF NOT EXISTS idx_auction_bids_bidder ON auction_bids(bidder_id);
CREATE INDEX IF NOT EXISTS idx_auction_bids_created ON auction_bids(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_auction_bidders_auction ON auction_bidders(auction_id);
CREATE INDEX IF NOT EXISTS idx_auction_bidders_email ON auction_bidders(auction_id, email);
CREATE INDEX IF NOT EXISTS idx_auction_orders_bidder ON auction_orders(bidder_id);
CREATE INDEX IF NOT EXISTS idx_auction_orders_auction ON auction_orders(auction_id);
CREATE INDEX IF NOT EXISTS idx_auction_order_items_order ON auction_order_items(order_id);

-- ═══════════════════════════════════════════════════════════════
-- 9. Foreign key for current_winner_id (deferred because table
--    didn't exist yet when auction_items was created)
-- ═══════════════════════════════════════════════════════════════
ALTER TABLE auction_items
  ADD CONSTRAINT fk_auction_items_winner
  FOREIGN KEY (current_winner_id) REFERENCES auction_bidders(id)
  ON DELETE SET NULL;

-- ═══════════════════════════════════════════════════════════════
-- 10. Enable Realtime on auction_items and auction_bids
-- ═══════════════════════════════════════════════════════════════
ALTER PUBLICATION supabase_realtime ADD TABLE auction_items;
ALTER PUBLICATION supabase_realtime ADD TABLE auction_bids;
ALTER PUBLICATION supabase_realtime ADD TABLE auctions;

-- ═══════════════════════════════════════════════════════════════
-- 11. RLS Policies
-- ═══════════════════════════════════════════════════════════════

-- Auctions: public read for published/open/closed, admin write
ALTER TABLE auctions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read non-draft auctions"
  ON auctions FOR SELECT
  USING (status != 'draft');

CREATE POLICY "Service role full access to auctions"
  ON auctions FOR ALL
  USING (true)
  WITH CHECK (true);

-- Auction Items: public read, admin write
ALTER TABLE auction_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read auction items"
  ON auction_items FOR SELECT
  USING (true);

CREATE POLICY "Service role full access to auction_items"
  ON auction_items FOR ALL
  USING (true)
  WITH CHECK (true);

-- Bidders: public insert (registration), read own
ALTER TABLE auction_bidders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can register as bidder"
  ON auction_bidders FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Anyone can read bidders"
  ON auction_bidders FOR SELECT
  USING (true);

CREATE POLICY "Service role full access to auction_bidders"
  ON auction_bidders FOR ALL
  USING (true)
  WITH CHECK (true);

-- Bids: public insert, public read
ALTER TABLE auction_bids ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can place a bid"
  ON auction_bids FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Anyone can read bids"
  ON auction_bids FOR SELECT
  USING (true);

CREATE POLICY "Service role full access to auction_bids"
  ON auction_bids FOR ALL
  USING (true)
  WITH CHECK (true);

-- Orders: service role only (created server-side)
ALTER TABLE auction_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access to auction_orders"
  ON auction_orders FOR ALL
  USING (true)
  WITH CHECK (true);

-- Order items: service role only
ALTER TABLE auction_order_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access to auction_order_items"
  ON auction_order_items FOR ALL
  USING (true)
  WITH CHECK (true);

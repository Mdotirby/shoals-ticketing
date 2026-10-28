-- Holds, kills and price overrides painted onto one show
--
-- The seat map builder's Show mode (handoff/screens/seatmap-builder.dc.html):
-- the room is locked, and you mark individual seats as held for the artist,
-- held for production, set aside as comps, or killed for sightlines — and you
-- can override a section's price — all for ONE show, without touching the
-- saved room.
--
-- WHY THESE CANNOT LIVE ON THE ROWS THEY DESCRIBE
--
-- A seat has no event. It belongs to a section, a section to a layout, and a
-- layout is attached to an event by event_layout_maps — so two shows can run
-- on the same room, and a mark written onto seats.status would be a mark on
-- every show in that room at once. seats.status stays what it is: available,
-- held by a checkout session, or sold.
--
-- Same for price. sections.price_cents is the room's price; a show that
-- charges more for the same seats needs to say so without rewriting the room.
--
-- WHAT ALREADY EXISTS, AND IS NOT DUPLICATED HERE
--
-- event_holds already holds BY COUNT, per event and tier, with hold_type
-- 'artist' | 'production' | 'house_comp', and lib/capacity.ts already counts
-- it. That is the design's "Held by count", and it is what a first-come or
-- standing section uses, because there are no particular seats to point at.
-- These tables are the seat-level half, and they deliberately reuse the same
-- hold_type words so the two halves report as one number.
--
-- Run in the Supabase SQL editor. Safe to re-run.

-- ═══════════════════════════════════════════
-- 1. SEAT MARKS — one row per seat, per show
-- ═══════════════════════════════════════════
CREATE TABLE IF NOT EXISTS event_seat_marks (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id   uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  seat_id    uuid NOT NULL REFERENCES seats(id) ON DELETE CASCADE,
  -- 'artist', 'production', 'house_comp' match event_holds.hold_type so the
  -- painted seats and the counted holds add up together. 'kill' is the fourth
  -- and has no counted equivalent: a killed seat is not held for anybody, it
  -- is out of the room for this show.
  mark       text NOT NULL CHECK (mark IN ('artist','production','house_comp','kill')),
  note       text,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- A seat carries one mark per show. Painting over an existing one replaces
  -- it, which is what the tool does; releasing deletes the row.
  UNIQUE (event_id, seat_id)
);

CREATE INDEX IF NOT EXISTS idx_event_seat_marks_event ON event_seat_marks (event_id);

COMMENT ON TABLE event_seat_marks IS
  'Per-show seat holds and kills. Seats belong to a layout, not an event, so a '
  'mark cannot live on the seat row without applying to every show in that room.';

-- ═══════════════════════════════════════════
-- 2. PRICE OVERRIDES — one row per section, per show
-- ═══════════════════════════════════════════
CREATE TABLE IF NOT EXISTS event_section_prices (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id         uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  section_id       uuid NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
  -- NULL means "no override for this field" — a show can move the table price
  -- without touching the per-seat price, or the other way round.
  price_cents      integer,
  seat_price_cents integer,
  created_by       text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, section_id)
);

CREATE INDEX IF NOT EXISTS idx_event_section_prices_event ON event_section_prices (event_id);

COMMENT ON TABLE event_section_prices IS
  'What a section costs for ONE show, overriding sections.price_cents. The room '
  'keeps its own price; this is the show charging something else for it.';

-- ═══════════════════════════════════════════
-- 3. RLS — through the event, as the other admin tables do
-- ═══════════════════════════════════════════
ALTER TABLE event_seat_marks ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_section_prices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_manage_event_seat_marks" ON event_seat_marks;
CREATE POLICY "admin_manage_event_seat_marks" ON event_seat_marks FOR ALL USING (
  EXISTS (
    SELECT 1 FROM events e JOIN admin_users au ON au.id = auth.uid()
    WHERE e.id = event_seat_marks.event_id
      AND (au.role IN ('owner','super_admin') OR (au.role = 'venue_admin' AND au.venue_id = e.venue_id))
  )
);

DROP POLICY IF EXISTS "admin_manage_event_section_prices" ON event_section_prices;
CREATE POLICY "admin_manage_event_section_prices" ON event_section_prices FOR ALL USING (
  EXISTS (
    SELECT 1 FROM events e JOIN admin_users au ON au.id = auth.uid()
    WHERE e.id = event_section_prices.event_id
      AND (au.role IN ('owner','super_admin') OR (au.role = 'venue_admin' AND au.venue_id = e.venue_id))
  )
);

-- ═══════════════════════════════════════════
-- CHECK
-- ═══════════════════════════════════════════
--   SELECT e.title, m.mark, count(*)
--   FROM event_seat_marks m JOIN events e ON e.id = m.event_id
--   GROUP BY 1, 2 ORDER BY 1, 2;
--
--   SELECT e.title, s.name, s.price_cents AS room, p.price_cents AS this_show
--   FROM event_section_prices p
--   JOIN events e ON e.id = p.event_id
--   JOIN sections s ON s.id = p.section_id;

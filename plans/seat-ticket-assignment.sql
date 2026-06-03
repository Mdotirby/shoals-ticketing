-- Migration: seat-ticket-assignment.sql
-- Adds ticket_id to seats so each ticket knows its specific seat(s),
-- then backfills all existing orders.
--
-- Run this in the Supabase SQL editor BEFORE deploying the matching code change.

-- ── 1. Add column ─────────────────────────────────────────────────────────────

ALTER TABLE seats ADD COLUMN IF NOT EXISTS ticket_id UUID REFERENCES tickets(id);
CREATE INDEX IF NOT EXISTS idx_seats_ticket_id ON seats(ticket_id);

-- ── 2. Backfill individual seats (non-table sections) ─────────────────────────
-- Sort seats within each order by section + seat_number.
-- Sort tickets within each order by created_at.
-- Pair positionally: seat rank 0 → ticket rank 0, etc.

WITH ranked_seats AS (
  SELECT
    s.id                                                           AS seat_id,
    s.order_id,
    ROW_NUMBER() OVER (
      PARTITION BY s.order_id
      ORDER BY s.section_id, s.seat_number, s.id
    ) - 1                                                          AS rn
  FROM seats s
  JOIN sections sec ON sec.id = s.section_id
  WHERE s.status      = 'sold'
    AND s.order_id    IS NOT NULL
    AND s.ticket_id   IS NULL
    AND (sec.sells_as_table IS FALSE OR sec.sells_as_table IS NULL)
),
ranked_tickets AS (
  SELECT
    id         AS ticket_id,
    order_id,
    ROW_NUMBER() OVER (PARTITION BY order_id ORDER BY created_at, id) - 1 AS rn
  FROM tickets
  WHERE order_id IS NOT NULL
)
UPDATE seats
SET ticket_id = rt.ticket_id
FROM ranked_seats rs
JOIN ranked_tickets rt ON rt.order_id = rs.order_id AND rt.rn = rs.rn
WHERE seats.id = rs.seat_id;

-- ── 3. Backfill table seats (sells_as_table = true) ───────────────────────────
-- All seats sharing the same object_id are one physical table → one ticket.
-- Sort table objects within each order by object_id for a deterministic pairing.

WITH table_groups AS (
  SELECT
    s.order_id,
    s.object_id,
    ROW_NUMBER() OVER (
      PARTITION BY s.order_id
      ORDER BY s.object_id
    ) - 1                    AS rn,
    ARRAY_AGG(s.id)          AS seat_ids
  FROM seats s
  JOIN sections sec ON sec.id = s.section_id
  WHERE s.status      = 'sold'
    AND s.order_id    IS NOT NULL
    AND s.ticket_id   IS NULL
    AND sec.sells_as_table IS TRUE
    AND s.object_id   IS NOT NULL
  GROUP BY s.order_id, s.object_id
),
ranked_tickets AS (
  SELECT
    id         AS ticket_id,
    order_id,
    ROW_NUMBER() OVER (PARTITION BY order_id ORDER BY created_at, id) - 1 AS rn
  FROM tickets
  WHERE order_id IS NOT NULL
)
UPDATE seats
SET ticket_id = rt.ticket_id
FROM table_groups tg
JOIN ranked_tickets rt ON rt.order_id = tg.order_id AND rt.rn = tg.rn
WHERE seats.id = ANY(tg.seat_ids);

-- ── Verify ────────────────────────────────────────────────────────────────────
-- Run these to confirm the backfill looks correct before deploying code.

-- How many sold seats now have a ticket_id:
-- SELECT COUNT(*) FILTER (WHERE ticket_id IS NOT NULL) AS linked,
--        COUNT(*) FILTER (WHERE ticket_id IS NULL)     AS unlinked
-- FROM seats WHERE status = 'sold' AND order_id IS NOT NULL;

-- Spot-check: pick an order with multiple tickets and confirm 1 seat per ticket:
-- SELECT t.qr_code, s.row_label, s.seat_number, sec.name AS section
-- FROM tickets t
-- JOIN seats s ON s.ticket_id = t.id
-- JOIN sections sec ON sec.id = s.section_id
-- WHERE t.order_id = '<paste order id here>'
-- ORDER BY t.created_at;

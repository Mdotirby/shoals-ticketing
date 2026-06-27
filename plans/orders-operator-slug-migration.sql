-- Store which operator (platform brand) sold each ticket.
-- Used to send ticket emails to the correct domain and brand the ticket view page.
-- NULL = legacy order pre-migration, defaults to 'venuecore' at display time.

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS operator_slug text
  CHECK (operator_slug IN ('venuecore', 'west72'));

-- Backfill operator_slug on all legacy orders.
-- All customer-facing ticket sales were made through west72ent.com —
-- venuecore.live is the admin/platform domain, not a customer purchase portal.
-- Orders created going forward will have operator_slug set by the webhook.

UPDATE orders
SET operator_slug = 'west72'
WHERE operator_slug IS NULL;

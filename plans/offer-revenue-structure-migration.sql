-- Whose money is it: the risk and revenue structure of an offer
--
-- artist_offers.deal_type already answers "how is the ARTIST paid" — VS,
-- FLAT, PLUS, BONUS. It does not answer "whose risk is this show", which is a
-- separate axis and the one that decides who keeps the ticket money.
-- lib/eventClass.ts has carried that distinction for events since the merge
-- plan (§ 9.1: "event_type → does this sell through our ticketing?
-- deal_type → whose money is it?"); the offer never had it.
--
-- Three structures, per Matt:
--
--   own_risk    We promote, we take the risk, we keep the box office.
--   co_promote  Revenue is shared with a partner, measured on either the
--               GROSS or the NET AFTER EXPENSES — those produce very
--               different numbers, so the basis is stored, not assumed.
--   rental      A client pays a flat rental rate and we sell their tickets.
--               The ticket money is theirs; the rental fee is ours.
--
-- Safe to run while selling: every column is nullable or defaulted, nothing
-- is dropped, and no existing row changes meaning. Every offer on file is
-- own_risk, which is what the default sets them to.
--
-- Run in the Supabase SQL editor. Safe to re-run.

ALTER TABLE artist_offers
  ADD COLUMN IF NOT EXISTS revenue_structure text NOT NULL DEFAULT 'own_risk',
  ADD COLUMN IF NOT EXISTS copro_basis       text,
  ADD COLUMN IF NOT EXISTS copro_venue_pct   numeric,
  ADD COLUMN IF NOT EXISTS rental_fee        numeric;

-- Constraints added separately so a re-run does not fail on an existing one.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'artist_offers_revenue_structure_check') THEN
    ALTER TABLE artist_offers ADD CONSTRAINT artist_offers_revenue_structure_check
      CHECK (revenue_structure IN ('own_risk', 'co_promote', 'rental'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'artist_offers_copro_basis_check') THEN
    ALTER TABLE artist_offers ADD CONSTRAINT artist_offers_copro_basis_check
      CHECK (copro_basis IS NULL OR copro_basis IN ('gross', 'net_after_expenses'));
  END IF;

  -- A split outside 0–100 is a typo, not a deal.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'artist_offers_copro_pct_check') THEN
    ALTER TABLE artist_offers ADD CONSTRAINT artist_offers_copro_pct_check
      CHECK (copro_venue_pct IS NULL OR (copro_venue_pct >= 0 AND copro_venue_pct <= 100));
  END IF;
END $$;

COMMENT ON COLUMN artist_offers.revenue_structure IS
  'own_risk | co_promote | rental — whose risk the show is. Separate from deal_type, which is how the artist is paid.';
COMMENT ON COLUMN artist_offers.copro_basis IS
  'gross | net_after_expenses — what the co-promote split is measured against. Null unless revenue_structure = co_promote.';
COMMENT ON COLUMN artist_offers.copro_venue_pct IS
  'The VENUE''S share of the co-promote split, as a percentage. The partner takes the remainder.';
COMMENT ON COLUMN artist_offers.rental_fee IS
  'Flat rental rate the client pays, in dollars — the same unit as guarantee. Null unless revenue_structure = rental.';

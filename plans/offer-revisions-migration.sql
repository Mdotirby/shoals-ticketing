-- Offer revisions — design handoff PHASE1-EDIT-PAGES § 2.
--
-- A countersigned offer is a contract: it is never edited in place. Changing
-- it means a revision — a new artist_offers row that points back at the one it
-- revises. The signed version stays operative until the revision is itself
-- countersigned, at which point the old one is marked superseded. Both stay on
-- file.
--
-- Additive only. Existing offers become version 1 of their own chain; nothing
-- about how drafts are created, edited or sent changes.
--
-- Run once in the Supabase SQL editor. The app works before this runs (the
-- "Create revision" button explains the migration is needed); it just can't
-- create revisions until it has.

alter table artist_offers
  add column if not exists revision_of uuid references artist_offers(id) on delete set null,
  add column if not exists version integer not null default 1,
  add column if not exists superseded_at timestamptz;

-- The version history reads a chain by its root.
create index if not exists artist_offers_revision_of_idx on artist_offers (revision_of);

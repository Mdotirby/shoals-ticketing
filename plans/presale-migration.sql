-- Presale codes migration
-- Creates the event_presales table for artist + venue presale code support.
-- Run once against your Supabase project via the SQL editor or psql.

CREATE TABLE IF NOT EXISTS public.event_presales (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id    uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  type        text NOT NULL CHECK (type IN ('artist', 'venue')),
  enabled     boolean NOT NULL DEFAULT false,
  code        varchar(15),
  starts_at   timestamptz,
  ends_at     timestamptz,
  capacity    integer,
  created_at  timestamptz NOT NULL DEFAULT now(),

  UNIQUE (event_id, type)
);

-- Index for fast lookups on validation path
CREATE INDEX IF NOT EXISTS event_presales_event_id_idx ON public.event_presales (event_id);

-- RLS: admin client (service role) bypasses RLS, so no policies needed for
-- server-side routes. Enable RLS to block anonymous direct DB access.
ALTER TABLE public.event_presales ENABLE ROW LEVEL SECURITY;

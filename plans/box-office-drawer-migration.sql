-- The door's cash count for a show: opening float, denominations counted, what
-- was expected, and whether the drawer is closed. One row per show. Run this
-- before using the Drawer tab; until then it can't save a count.
create table if not exists box_office_drawers (
  event_id uuid primary key references events(id) on delete cascade,
  opening_float numeric(10,2) not null default 0,
  denominations jsonb not null default '{}'::jsonb,
  counted numeric(10,2),
  expected numeric(10,2),
  variance numeric(10,2),
  note text,
  counted_by text,
  counted_at timestamptz,
  closed_by text,
  closed_at timestamptz,
  updated_at timestamptz not null default now()
);

-- Read and written only through the admin API.
alter table box_office_drawers enable row level security;

-- The people on a show: name, role, email and phone, in the event's Contacts
-- tab. The settlement send box picks from this list. The agent and assistant
-- come from the offer and aren't stored here unless someone adds them by hand.
create table if not exists show_contacts (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  name text,
  role text not null default 'other',
  email text,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists show_contacts_event_idx on show_contacts (event_id);

-- One row per address on a show.
create unique index if not exists show_contacts_event_email_idx
  on show_contacts (event_id, lower(email))
  where email is not null;

-- Read and written only through the admin API.
alter table show_contacts enable row level security;

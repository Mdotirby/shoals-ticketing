-- Transactional email templates
-- Run in Supabase SQL editor.
-- Stores editable block-v1 EmailDocument JSON for system-triggered emails.
-- If no row exists for a given key, the hardcoded fallback is used.

create table if not exists transactional_email_templates (
  key          text primary key,
  label        text not null,
  body_json    jsonb not null,
  updated_at   timestamptz not null default now(),
  updated_by   uuid references auth.users(id) on delete set null
);

-- Only admins should be able to read/write this table
alter table transactional_email_templates enable row level security;

create policy "admins can manage transactional templates"
  on transactional_email_templates
  for all
  using (
    exists (
      select 1 from admin_users
      where id = auth.uid()
      and role in ('owner', 'super_admin', 'venue_admin')
    )
  );

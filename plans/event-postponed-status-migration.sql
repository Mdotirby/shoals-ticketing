-- Lets a show be marked postponed. The check on events.status didn't allow it,
-- so the hub's "Postpone, date to be announced" was refused by the database.
-- booking_status has its own constraint, and \m keeps this from touching it.
do $$
declare
  c record;
begin
  for c in
    select conname
      from pg_constraint
     where conrelid = 'events'::regclass
       and contype = 'c'
       and pg_get_constraintdef(oid) ~ '\mstatus\M'
  loop
    execute format('alter table events drop constraint %I', c.conname);
  end loop;
end $$;

alter table events add constraint events_status_check
  check (status is null or status in ('draft', 'published', 'postponed', 'cancelled', 'closed', 'archived', 'completed'));

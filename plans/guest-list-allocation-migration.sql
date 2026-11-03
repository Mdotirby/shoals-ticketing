-- Who a guest's comp is charged to: the artist, the venue or marketing. Guests
-- already on an artist's list start as artist, and everyone else as venue. The
-- app works before this runs, but a choice won't be saved.
alter table guest_list add column if not exists comp_allocation text;

update guest_list g
   set comp_allocation = case when u.role = 'artist' then 'artist' else 'venue' end
  from admin_users u
 where u.id = g.artist_id and g.comp_allocation is null;

update guest_list set comp_allocation = 'venue' where comp_allocation is null;

alter table guest_list alter column comp_allocation set default 'venue';
alter table guest_list alter column comp_allocation set not null;

alter table guest_list drop constraint if exists guest_list_comp_allocation_check;
alter table guest_list add constraint guest_list_comp_allocation_check
  check (comp_allocation in ('artist', 'venue', 'marketing'));

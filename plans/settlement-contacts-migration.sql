-- Tour manager and artist manager, copied on the settlement email. The app
-- works before this runs, but the addresses won't be saved.
alter table settlements add column if not exists tour_manager_email text;
alter table settlements add column if not exists artist_manager_email text;

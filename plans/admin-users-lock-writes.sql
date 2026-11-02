-- Only the API should write admin_users, so the role rule in lib/auth/roles.ts
-- can't be walked around from a browser. plans/supabase-migration.sql created a
-- policy letting ANY owner insert, update or delete rows with the public anon key.
-- No page writes this table directly (all writes go through /api/admin/users),
-- so dropping it breaks nothing. Owners keep read access via owner_super_read_all.

drop policy if exists "owner_manage_admins" on admin_users;

-- Check: should list no row with cmd ALL, INSERT, UPDATE or DELETE.
select policyname, cmd, roles from pg_policies
where schemaname = 'public' and tablename = 'admin_users';

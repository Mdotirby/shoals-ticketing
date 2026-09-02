-- ============================================================
-- Let admin_users actually be deletable when they've created other
-- records — settlements, email campaigns/templates, ad-engine/deal-lab
-- rows, agent profiles. Those columns reference admin_users(id) with no
-- ON DELETE action (Postgres default: RESTRICT), so deleting a staff
-- member who has ever finalized a settlement or sent a campaign fails
-- with a raw foreign-key-violation error — that's the "error when
-- trying to delete an admin user" bug. Switches each to ON DELETE
-- SET NULL: the historical record survives, it just loses the
-- attribution to a since-deleted account.
--
-- Written as a DO block that looks up each constraint's real name from
-- information_schema rather than assuming Postgres's default
-- "<table>_<column>_fkey" naming, in case any of these were created
-- with an explicit name. Safe to re-run.
--
-- Run in Supabase SQL Editor.
-- ============================================================

DO $$
DECLARE
  rec RECORD;
  targets TEXT[][] := ARRAY[
    ARRAY['agents', 'user_id'],
    ARRAY['email_templates', 'created_by'],
    ARRAY['email_campaigns', 'created_by'],
    ARRAY['settlements', 'finalized_by'],
    ARRAY['contracts', 'finalized_by']
  ];
  t TEXT[];
BEGIN
  FOREACH t SLICE 1 IN ARRAY targets
  LOOP
    -- Skip cleanly if the table or column doesn't exist in this database
    -- (some of these come from migration files that may not all be applied).
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = t[1] AND column_name = t[2]
    ) THEN
      RAISE NOTICE 'Skipping %.% — column not found', t[1], t[2];
      CONTINUE;
    END IF;

    FOR rec IN
      SELECT tc.constraint_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
      JOIN information_schema.constraint_column_usage ccu
        ON tc.constraint_name = ccu.constraint_name
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_name = t[1]
        AND kcu.column_name = t[2]
        AND ccu.table_name = 'admin_users'
    LOOP
      EXECUTE format('ALTER TABLE %I DROP CONSTRAINT %I', t[1], rec.constraint_name);
      EXECUTE format(
        'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES admin_users(id) ON DELETE SET NULL',
        t[1], rec.constraint_name, t[2]
      );
      RAISE NOTICE 'Fixed %.% (constraint %)', t[1], t[2], rec.constraint_name;
    END LOOP;
  END LOOP;
END $$;

-- ── ad_campaigns / deal_lab_entries — same issue, different table names
-- depending on which migration actually ran. Same dynamic approach,
-- broadened to catch created_by columns on any ad-engine/deal-lab table
-- referencing admin_users, whatever it ended up called.
DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT tc.table_name, tc.constraint_name, kcu.column_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
    JOIN information_schema.constraint_column_usage ccu
      ON tc.constraint_name = ccu.constraint_name
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND ccu.table_name = 'admin_users'
      AND kcu.column_name = 'created_by'
      AND tc.table_name NOT IN ('email_templates', 'email_campaigns')
  LOOP
    EXECUTE format('ALTER TABLE %I DROP CONSTRAINT %I', rec.table_name, rec.constraint_name);
    EXECUTE format(
      'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES admin_users(id) ON DELETE SET NULL',
      rec.table_name, rec.constraint_name, rec.column_name
    );
    RAISE NOTICE 'Fixed %.created_by (constraint %)', rec.table_name, rec.constraint_name;
  END LOOP;
END $$;

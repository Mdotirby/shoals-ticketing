import type { StaffLevel, ExternalIdentity } from "@/lib/auth/roles";

/**
 * Legacy role strings still present in admin_users until
 * plans/role-taxonomy-migration.sql has been run everywhere.
 *
 * They stay in the union ON PURPOSE. Narrowing to the canonical six would make
 * TypeScript reject the ~30 files that still compare against these strings, so
 * a "type cleanup" would turn into a 30-file rewrite in the same commit. Route
 * every decision through normalizeRole() from lib/auth/roles instead, and let
 * this union shrink once the data and the call sites are both migrated.
 */
export type LegacyRole =
  | "super_admin"
  | "full_admin"
  | "promoter"
  | "door_greeter"
  | "read_only";

export type AdminRole = StaffLevel | ExternalIdentity | LegacyRole;

export type AdminUser = {
  id: string;
  email: string;
  role: AdminRole;
  venue_id?: string | null;
  must_change_password: boolean;
  created_at: string;
};

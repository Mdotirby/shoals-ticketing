/**
 * Role taxonomy — the single definition.
 *
 * Before this file the taxonomy existed four times and no two agreed
 * (ADMIN_MERGE_PLAN.md § 2): lib/types/admin.ts had 10 roles, the permissions
 * screen 7, the users route 9, and the design 6. This is now the source; the
 * others should read from here.
 *
 * TWO AXES, not one. That is the whole point:
 *
 *   - StaffLevel      — what the design's matrix edits and the Users screen
 *                       assigns. Six levels, L1 to L6.
 *   - ExternalIdentity — artist / partner / agent. NOT staff access levels.
 *                       They are portal identities with their own routes
 *                       (/agent, /admin/partner-dashboard, artist guest lists)
 *                       and their own API surface. Collapsing them into the
 *                       staff matrix would break those portals, so the matrix
 *                       never sees them.
 *
 * LEGACY STRINGS ARE STILL IN THE DATABASE. normalizeRole() maps them, and it
 * is deliberately tolerant: the SQL migration in
 * plans/role-taxonomy-migration.sql is hand-run in the Supabase SQL editor, so
 * for some window the code and the data disagree. Code that accepts both
 * cannot lock anyone out in that window, and the migration becomes a cleanup
 * rather than a flag day. Do not "simplify" this by dropping the legacy map
 * until the migration has run everywhere and `select distinct role from
 * admin_users` returns only canonical values.
 */

export const STAFF_LEVELS = [
  "owner",
  "venue_admin",
  "talent_buyer",
  "finance",
  "events_manager",
  "box_office",
] as const;
export type StaffLevel = (typeof STAFF_LEVELS)[number];

export const EXTERNAL_IDENTITIES = ["artist", "partner", "agent"] as const;
export type ExternalIdentity = (typeof EXTERNAL_IDENTITIES)[number];

export const STAFF_LEVEL_LABELS: Record<StaffLevel, string> = {
  owner: "Owner",
  venue_admin: "Venue Admin",
  talent_buyer: "Talent Buyer",
  finance: "Finance",
  events_manager: "Events Manager",
  box_office: "Box Office",
};

export const EXTERNAL_IDENTITY_LABELS: Record<ExternalIdentity, string> = {
  artist: "Artist",
  partner: "Partner",
  agent: "Agent",
};

/**
 * Legacy staff strings → canonical level. Settled in ADMIN_MERGE_PLAN.md § 8.
 *
 * `full_admin` → `venue_admin` is the one with teeth: those users GAIN
 * sign_payout and view_settlement at full, because Venue Admin is where
 * settlement-signing authority now lives. That is an intentional widening, not
 * a side effect.
 */
const LEGACY_STAFF: Record<string, StaffLevel> = {
  super_admin: "owner", // platform level, folds in
  full_admin: "venue_admin", // gains settlement-signing authority
  promoter: "talent_buyer", // closest fit
  door_greeter: "box_office", // scoped to scan-only via the matrix, not the role
};

export type ResolvedRole = {
  /** Canonical staff level, or null for external identities and read_only. */
  level: StaffLevel | null;
  /** Portal identity, or null for staff. */
  external: ExternalIdentity | null;
  /**
   * Legacy `read_only`. UNRESOLVED BY DESIGN — ADMIN_MERGE_PLAN.md § 8 lists
   * "read_only as a scope, not a role?" as still open and says it blocks the
   * role migration, so this file does not decide it.
   *
   * Until it is decided, a read_only user resolves to level: null with this
   * flag set, and can() grants nothing. That preserves exactly what these
   * users can do today. Folding them into any staff level instead would hand
   * write access to accounts that have never had it, which is the one outcome
   * that is worse than waiting.
   */
  readOnly: boolean;
  /** The string as stored, for logging and for round-tripping unknowns. */
  raw: string;
};

export function normalizeRole(raw: string | null | undefined): ResolvedRole {
  const value = (raw ?? "").trim();
  const base: ResolvedRole = { level: null, external: null, readOnly: false, raw: value };

  if (!value) return base;

  if ((STAFF_LEVELS as readonly string[]).includes(value)) {
    return { ...base, level: value as StaffLevel };
  }
  if ((EXTERNAL_IDENTITIES as readonly string[]).includes(value)) {
    return { ...base, external: value as ExternalIdentity };
  }
  if (value in LEGACY_STAFF) {
    return { ...base, level: LEGACY_STAFF[value] };
  }
  if (value === "read_only") {
    return { ...base, readOnly: true };
  }

  // Unknown string: no level, no identity, no capabilities. Failing closed is
  // the only safe reading of a role we do not recognise.
  return base;
}

/** True for the six staff levels. External identities and read_only are false. */
export function isStaff(raw: string | null | undefined): boolean {
  return normalizeRole(raw).level !== null;
}

/** Display label for any role string, legacy included. */
export function roleLabel(raw: string | null | undefined): string {
  const r = normalizeRole(raw);
  if (r.level) return STAFF_LEVEL_LABELS[r.level];
  if (r.external) return EXTERNAL_IDENTITY_LABELS[r.external];
  if (r.readOnly) return "Read Only";
  return r.raw || "Unknown";
}

/**
 * Seniority for the "no editing at or above your own level" guardrail
 * (ADMIN_MERGE_PLAN.md § 3.4). Lower number = more senior.
 */
const LEVEL_RANK: Record<StaffLevel, number> = {
  owner: 1,
  venue_admin: 2,
  talent_buyer: 3,
  finance: 3,
  events_manager: 4,
  box_office: 5,
};

export function levelRank(level: StaffLevel): number {
  return LEVEL_RANK[level];
}

/**
 * Can `actor` edit a user who holds `target`? False when the actor is not
 * staff, and false at or above their own rank — an actor may not edit a peer
 * or a senior, which also blocks self-elevation.
 */
export function canEditRole(
  actor: string | null | undefined,
  target: string | null | undefined
): boolean {
  const a = normalizeRole(actor);
  const t = normalizeRole(target);
  if (!a.level) return false;
  // Editing an external identity or an unresolved role is gated on being able
  // to assign roles at all; seniority does not apply since they have no rank.
  if (!t.level) return true;
  return levelRank(a.level) < levelRank(t.level);
}

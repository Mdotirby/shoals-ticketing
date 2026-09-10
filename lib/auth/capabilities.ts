import { STAFF_LEVELS, type StaffLevel } from "./roles";

/**
 * The sixteen capabilities, taken verbatim from the design's permRows
 * (handoff/mockup/VenueCore.dc.html:4018) and keyed per ADMIN_MERGE_PLAN.md § 3.1.
 *
 * This replaces nav visibility as the unit of access control. sidebar_permissions
 * only ever answered "can this role SEE this tab", which is the weaker question —
 * hiding Settlements in the sidebar never stopped a Box Office user deep-linking
 * to /admin/settlements/[id]. Capabilities answer "can this role DO this thing",
 * and they are checked on the server.
 */
export const CAPABILITIES = [
  "assign_roles",
  "venue_lifecycle",
  "cross_tenant_reporting",
  "holds",
  "offers",
  "ticket_scaling",
  "inventory_release",
  "door_sales_comps",
  "scan_checkin",
  "view_settlement",
  "sign_payout",
  "quote_contract_rentals",
  "invoices_payments",
  "expenses",
  "export_ledger",
  "read_audit",
] as const;
export type Capability = (typeof CAPABILITIES)[number];

/**
 * FOUR states, not three.
 *
 * ADMIN_MERGE_PLAN.md § 3.1 describes `level ∈ full | scoped | none`, but the
 * design's own matrix uses four — it has a distinct `R` / "Read" marker,
 * separate from `S` / "Scoped", and uses it in four places (offers for Finance,
 * view_settlement for Talent Buyer, read_audit for Finance). Collapsing Read
 * into Scoped would silently grant write where the design shows read, so the
 * code follows the design and this discrepancy is flagged rather than guessed.
 */
export type CapabilityLevel = "full" | "scoped" | "read" | "none";

const F: CapabilityLevel = "full";
const S: CapabilityLevel = "scoped";
const R: CapabilityLevel = "read";
const N: CapabilityLevel = "none";

/**
 * Column order matches the design's roleCols exactly:
 * Owner · Venue Admin · Talent Buyer · Finance · Events Mgr · Box Office
 *
 * These are the DEFAULTS. § 3.1 puts the live values in a role_capabilities
 * table (venue_id, role, capability_key, level) so they are editable per venue.
 * That table does not exist yet, so can() reads this map. When the table lands,
 * this becomes the seed and the fallback for a venue with no overrides — do not
 * delete it.
 */
const MATRIX: Record<Capability, readonly CapabilityLevel[]> = {
  assign_roles: [F, F, N, N, N, N],
  venue_lifecycle: [F, N, N, N, N, N],
  cross_tenant_reporting: [F, N, N, N, N, N],
  holds: [F, F, F, N, S, N],
  offers: [F, F, F, R, N, N],
  ticket_scaling: [F, F, F, N, N, N],
  inventory_release: [F, F, F, N, N, S],
  door_sales_comps: [F, F, N, N, S, F],
  scan_checkin: [F, F, N, N, F, F],
  view_settlement: [F, F, R, F, N, N],
  sign_payout: [F, F, N, S, N, N],
  quote_contract_rentals: [F, F, N, N, F, N],
  invoices_payments: [F, F, N, F, S, N],
  expenses: [F, F, S, F, S, N],
  export_ledger: [F, F, N, F, N, N],
  read_audit: [F, F, N, R, N, N],
};

/** Default capability level for a staff level, from the design matrix. */
export function defaultCapabilityLevel(
  level: StaffLevel,
  capability: Capability
): CapabilityLevel {
  const column = STAFF_LEVELS.indexOf(level);
  if (column < 0) return "none";
  return MATRIX[capability][column] ?? "none";
}

/** Any access at all — the usual gate. Distinguish full/scoped/read at the call site. */
export function grants(level: CapabilityLevel): boolean {
  return level !== "none";
}

/** Write access. `read` and `none` are both refusals for a mutating handler. */
export function grantsWrite(level: CapabilityLevel): boolean {
  return level === "full" || level === "scoped";
}

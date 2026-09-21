import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The field lock model for editing a show that is already selling —
 * design handoff PHASE1-EDIT-PAGES § 1.
 *
 *   hard      fixed after the first sale, never writable on the form
 *   lockable  read-only while published with sales; the edit form unlocks
 *             them behind an audit entry, and every save that changes one
 *             is recorded with before and after
 *   open      everything else (artwork, billing, description, Spotify…) —
 *             can't invalidate a ticket, so never locked
 *
 * Enforced in PUT /api/events/[id], not only in the form: the form is one
 * client of that route, and the publish button is another.
 */

/** Event class decides which fields exist; a sold ticket was sold under it. */
export const HARD_FIELDS = ["event_type"] as const;

/** A buyer paid for each of these. */
export const LOCKABLE_FIELDS = ["title", "date", "venue", "event_venue_id", "venue_id"] as const;

type Row = Record<string, unknown>;

/**
 * Dates round-trip through the edit form as "YYYY-MM-DDTHH:MM:00" while the
 * column comes back as "…+00:00" — the form reads and writes the first 16
 * characters as wall time. Compare on those, or every save of an unchanged
 * date would look like a move.
 */
function comparable(field: string, v: unknown): string {
  if (v === undefined || v === null || v === "") return "";
  const s = String(v);
  return field === "date" ? s.slice(0, 16).replace(" ", "T") : s.trim();
}

export type LockCheck = {
  /** Hard fields this update would change. Non-empty = refuse. */
  hardChanged: string[];
  /** Lockable fields this update changes, for the audit entry. */
  lockableChanged: { field: string; before: unknown; after: unknown }[];
};

/** Pure: which locked fields does `updates` actually change on `current`? */
export function checkLocks(current: Row, updates: Row): LockCheck {
  const changed = (f: string) =>
    f in updates && comparable(f, updates[f]) !== comparable(f, current[f]);
  return {
    hardChanged: HARD_FIELDS.filter(changed),
    lockableChanged: LOCKABLE_FIELDS.filter(changed).map((field) => ({
      field,
      before: current[field] ?? null,
      after: updates[field] ?? null,
    })),
  };
}

/** Does this update touch any field the lock model cares about? */
export function touchesLockedFields(updates: Row): boolean {
  return [...HARD_FIELDS, ...LOCKABLE_FIELDS].some((f) => f in updates);
}

/**
 * Paid, non-comp orders — "has this show sold a ticket". A comp is an order
 * with real zeros (PHASE1B rule 3), not a sale.
 */
export async function paidSaleCount(admin: SupabaseClient, eventId: string): Promise<number> {
  const { count } = await admin
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("event_id", eventId)
    .eq("status", "paid")
    .neq("source", "comp");
  return count ?? 0;
}

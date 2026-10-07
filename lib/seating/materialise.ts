import type { SeatingObject, DerivedSeat } from "@/lib/seating/geometry";
import { geometryOf, snapFt } from "@/lib/seating/geometry";

/**
 * Turning an object's parameters into seat rows, without losing a sold seat.
 *
 * The builder edits SHAPE — "make it 14 across, curve it 2ft, open an aisle
 * after seat 7" — and lib/seating/geometry.ts derives where every seat lands.
 * The database holds seats as rows, because a sold seat has an order against
 * it, a scan, maybe a refund, and derived geometry cannot carry any of that.
 *
 * This is the join between the two, and the whole job is the rule below.
 *
 * ── A sold seat is not editable inventory ───────────────────────────────
 * Someone paid for Row F Seat 12. Regenerating the room must not delete it,
 * must not renumber it, and must not move it somewhere the holder will not
 * find. So:
 *
 *   created    derived seat with no row yet          → insert
 *   moved      row exists, geometry says elsewhere   → update coordinates
 *   removed    row exists, geometry no longer has it → DELETE only if free;
 *                                                      otherwise keep it and
 *                                                      report a conflict
 *
 * The caller decides what to do with conflicts. The builder's job is to show
 * them — "3 sold seats sit outside the new layout" — and let an operator
 * resolve it deliberately, because the alternatives are destroying a ticket
 * someone holds or silently refusing an edit.
 */

/** A seat as it exists in the database. */
export type StoredSeat = {
  id: string;
  object_id: string | null;
  row_label: string | null;
  seat_number: number | null;
  x_ft: number;
  y_ft: number;
  status: string | null;
  order_id: string | null;
};

export type SeatInsert = {
  section_id: string;
  object_id: string;
  row_label: string;
  seat_number: number;
  x_ft: number;
  y_ft: number;
};

export type SeatMove = { id: string; x_ft: number; y_ft: number };

export type MaterialisePlan = {
  insert: SeatInsert[];
  move: SeatMove[];
  /** Free seats the new layout has no place for. Safe to delete. */
  deleteIds: string[];
  /**
   * Sold or held seats the new layout has no place for. NOT deleted — each
   * is a ticket somebody holds.
   */
  conflicts: { id: string; label: string; status: string }[];
};

/** A seat is spoken for when it is sold, held, or attached to an order. */
export function isSpokenFor(s: Pick<StoredSeat, "status" | "order_id">): boolean {
  if (s.order_id) return true;
  const st = (s.status ?? "").toLowerCase();
  return st === "sold" || st === "held";
}

/**
 * Match a stored seat to a derived one.
 *
 * By row label and number, not by coordinates: the point of an edit is that
 * coordinates change. Row F Seat 12 stays Row F Seat 12 when the block
 * shifts three feet left, and the holder's ticket still reads true.
 */
const keyOf = (rowLabel: string | null, seatNumber: number | null) =>
  `${(rowLabel ?? "").trim().toUpperCase()}|${seatNumber ?? ""}`;

/**
 * What it would take to make the stored seats match the object's parameters.
 *
 * Pure, so the builder can show the consequences before anything is written —
 * "this removes 4 seats, 1 of them sold" is a question worth asking before
 * the fact rather than after.
 */
export function planMaterialise(
  object: SeatingObject,
  sectionId: string,
  stored: StoredSeat[],
): MaterialisePlan {
  const removed = new Set(object.removed ?? []);
  const derived: DerivedSeat[] = geometryOf(object).seats.filter((s) => !removed.has(s.id));

  const byKey = new Map<string, StoredSeat>();
  for (const s of stored) byKey.set(keyOf(s.row_label, s.seat_number), s);

  const insert: SeatInsert[] = [];
  const move: SeatMove[] = [];
  const matched = new Set<string>();

  for (const d of derived) {
    const k = keyOf(d.rowLabel, d.seatNumber);
    const existing = byKey.get(k);
    // Room coordinates: the object's corner plus the seat's local offset.
    const x = snapFt(object.x + d.lx);
    const y = snapFt(object.y + d.ly);

    if (!existing) {
      insert.push({
        section_id: sectionId,
        object_id: object.id,
        row_label: d.rowLabel,
        seat_number: d.seatNumber,
        x_ft: x,
        y_ft: y,
      });
      continue;
    }
    matched.add(existing.id);
    // Half a foot is the snap grid, so anything smaller is noise.
    if (Math.abs(existing.x_ft - x) >= 0.25 || Math.abs(existing.y_ft - y) >= 0.25) {
      move.push({ id: existing.id, x_ft: x, y_ft: y });
    }
  }

  const deleteIds: string[] = [];
  const conflicts: MaterialisePlan["conflicts"] = [];
  for (const s of stored) {
    if (matched.has(s.id)) continue;
    if (isSpokenFor(s)) {
      conflicts.push({
        id: s.id,
        label: `${s.row_label ?? "?"} ${s.seat_number ?? "?"}`.trim(),
        status: s.order_id ? "sold" : (s.status ?? "held"),
      });
    } else {
      deleteIds.push(s.id);
    }
  }

  return { insert, move, deleteIds, conflicts };
}

/** One line for the builder, before anything is written. */
export function describePlan(p: MaterialisePlan): string {
  const bits: string[] = [];
  if (p.insert.length) bits.push(`${p.insert.length} seat${p.insert.length === 1 ? "" : "s"} added`);
  if (p.move.length) bits.push(`${p.move.length} moved`);
  if (p.deleteIds.length) bits.push(`${p.deleteIds.length} removed`);
  if (!bits.length) bits.push("nothing to change");
  let out = bits.join(", ");
  if (p.conflicts.length) {
    const n = p.conflicts.length;
    out +=
      n === 1
        ? " — 1 sold or held seat sits outside the new layout and was kept"
        : ` — ${n} sold or held seats sit outside the new layout and were kept`;
  }
  return out;
}

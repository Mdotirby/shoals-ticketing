import type { SeatingObject, ObjectKind } from "@/lib/seating/geometry";

/**
 * Reading the objects already in the database as the design's parameters.
 *
 * lib/seating/geometry.ts speaks the design's vocabulary — rows, perRow,
 * seatSp, curve, aisle, diam, num. The 57 objects on file speak an older one:
 *
 *   row_block    { row_label: "A", seats_per_row: 14 }
 *   table_group  { table_number: 9, diameter_inches: 72, seats_per_table: 8 }
 *   stage        { label: "STAGE" }
 *
 * ── One object per ROW, not per block ───────────────────────────────────
 * The important difference, and the reason this is a translation rather than
 * a rewrite. `row_label` is singular: each stored object is ONE row, so
 * Section 1 is seven row_block objects. The design models a whole block in
 * one object with rows: 7.
 *
 * Merging seven objects into one would change object_id — which every seat
 * references, including 732 sold MSM tickets. So it does not merge. A stored
 * row becomes a block of rows: 1, which geometry.ts handles as an ordinary
 * case, and every seat keeps the object it already points at.
 *
 * The builder can still create proper multi-row blocks going forward; this
 * only governs what is already there.
 *
 * ── Why translate rather than migrate the column ────────────────────────
 * Rewriting metadata in place would be a one-way door on live data whose
 * seats are sold. Reading both shapes costs nothing, keeps the old rows
 * valid, and means a half-finished conversion cannot exist.
 */

type StoredObject = {
  id: string;
  section_id: string | null;
  type: string;
  x_ft: number;
  y_ft: number;
  width_ft: number;
  height_ft: number;
  rotation: number | null;
  metadata: Record<string, unknown> | null;
};

const num = (v: unknown, fallback: number): number =>
  typeof v === "number" && Number.isFinite(v) ? v : fallback;

/** Stored type names → the design's. */
const KIND: Record<string, ObjectKind> = {
  row_block: "row",
  table_group: "table",
  long_table: "long",
  ga_zone: "ga",
  stage: "stage",
  obstacle: "obstacle",
  label: "label",
};

export function kindOf(storedType: string): ObjectKind {
  return KIND[storedType] ?? "label";
}

/**
 * A stored object as the geometry module expects it.
 *
 * Accepts the design's own keys too, so an object written by the new builder
 * round-trips unchanged and the two shapes can coexist indefinitely.
 */
export function toSeatingObject(o: StoredObject): SeatingObject {
  const m = o.metadata ?? {};
  const type = kindOf(o.type);
  const base = {
    id: o.id,
    type,
    x: o.x_ft,
    y: o.y_ft,
    rot: o.rotation ?? 0,
    sec: o.section_id,
    level: (m.level as SeatingObject["level"]) ?? "floor",
    removed: Array.isArray(m.removed) ? (m.removed as string[]) : [],
    ada: Array.isArray(m.ada) ? (m.ada as string[]) : [],
    name: typeof m.label === "string" ? m.label : typeof m.name === "string" ? m.name : "",
  };

  if (type === "row") {
    // One stored object is one row. `start` carries its letter so the
    // derived seat ids keep reading A1, B1 — matching the tickets already
    // sold against them.
    const letter = typeof m.row_label === "string" ? m.row_label.trim().toUpperCase() : "";
    const LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ";
    const idx = letter ? LETTERS.indexOf(letter[0]) : -1;
    return {
      ...base,
      name: base.name || (letter ? `Row ${letter}` : "Rows"),
      rows: num(m.rows, 1),
      perRow: num(m.perRow, num(m.seats_per_row, 0)),
      seatSp: num(m.seatSp, 2),
      rowSp: num(m.rowSp, 3),
      curve: num(m.curve, 0),
      aisle: num(m.aisle, 0),
      start: num(m.start, idx >= 0 ? idx : 0),
      dir: m.dir === "rtl" ? "rtl" : "ltr",
    } as SeatingObject;
  }

  if (type === "table") {
    return {
      ...base,
      name: base.name || `Table ${num(m.table_number, num(m.num, 1))}`,
      seats: num(m.seats, num(m.seats_per_table, 0)),
      // Stored in inches; the design works in feet.
      diam: num(m.diam, num(m.diameter_inches, 60) / 12),
      num: num(m.num, num(m.table_number, 1)),
    } as SeatingObject;
  }

  if (type === "long") {
    return {
      ...base,
      seats: num(m.seats, num(m.seats_per_table, 0)),
      len: num(m.len, o.width_ft - 2),
      num: num(m.num, num(m.table_number, 1)),
    } as SeatingObject;
  }

  if (type === "ga") {
    return {
      ...base,
      w: num(m.w, o.width_ft),
      h: num(m.h, o.height_ft),
      capAuto: m.capAuto === undefined ? m.cap === undefined : m.capAuto !== false,
      cap: num(m.cap, 0),
    } as SeatingObject;
  }

  // stage / obstacle / label — a labelled box.
  return { ...base, w: num(m.w, o.width_ft), h: num(m.h, o.height_ft) } as SeatingObject;
}

/** True when an object is hidden from the room (one VIP table carries this). */
export function isHidden(o: StoredObject): boolean {
  return (o.metadata ?? {}).hidden === true;
}

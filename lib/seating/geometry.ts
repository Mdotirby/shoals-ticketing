/**
 * Where every seat in a room actually is.
 *
 * A direct port of `mk()` and `geo()` from
 * handoff/screens/seatmap-builder.dc.html, so the builder, the storefront
 * picker and the seat materialiser all place seats identically. If this
 * drifts from the design the three surfaces stop agreeing about what a room
 * looks like, which is the one thing a seat map cannot get wrong.
 *
 * ── Parameters, not seats ────────────────────────────────────────────────
 * The design stores an object's SHAPE — "6 rows of 14, curved 2ft, aisle
 * after seat 7" — and derives the seats from it. Editing is then a matter of
 * changing a number rather than moving 84 rows in a table, and a curve or an
 * aisle stays a property of the block instead of being baked into
 * coordinates nobody can edit back.
 *
 * The database still materialises seats, because a sold seat needs durable
 * identity: an order, a scan, a refund. Derived geometry cannot hold that.
 * So these parameters live on objects.metadata, and the materialiser writes
 * seat rows from them — never moving or deleting a seat that has been sold.
 *
 * ── Units ────────────────────────────────────────────────────────────────
 * Feet throughout, origin at the object's top-left. `lx` / `ly` are local to
 * the object; add the object's x / y for room coordinates.
 */

/** The eight things you can put in a room. */
export type ObjectKind = "row" | "table" | "long" | "ga" | "stage" | "obstacle" | "label";

/** Which deck. The design carries two. */
export type Level = "floor" | "balcony";

export type RowParams = {
  rows: number;
  perRow: number;
  /** Feet between seats across a row. */
  seatSp: number;
  /** Feet between rows. */
  rowSp: number;
  /** Depth of the arc, in feet. 0 is a straight row. */
  curve: number;
  /** Aisle after this many seats. 0 for none. */
  aisle: number;
  /** Offset into the row-letter alphabet. */
  start: number;
  /** Numbering direction. */
  dir: "ltr" | "rtl";
};

export type TableParams = { seats: number; diam: number; num: number };
export type LongParams = { seats: number; len: number; num: number };
export type GaParams = { w: number; h: number; capAuto: boolean; cap: number };
export type BoxParams = { w: number; h: number };

export type SeatingObject = {
  id: string;
  type: ObjectKind;
  /** Room coordinates of the object's top-left corner, in feet. */
  x: number;
  y: number;
  rot: number;
  name: string;
  /** Section id, or null for stage / obstacle / label. */
  sec: string | null;
  level: Level;
  /** Seat ids removed by hand — a pillar, a sightline, a missing chair. */
  removed: string[];
  /** Seat ids marked accessible. */
  ada: string[];
} & Partial<RowParams & TableParams & LongParams & GaParams & BoxParams>;

export type DerivedSeat = {
  /** Stable within the object: `${objectId}-A12` or `${objectId}-T4-3`. */
  id: string;
  /** Local feet from the object's top-left. */
  lx: number;
  ly: number;
  label: string;
  /** Row letter, for a row block. Table number as `T4` for a table. */
  rowLabel: string;
  /** Seat number within its row or table, 1-based. */
  seatNumber: number;
};

export type DerivedShape = { lx: number; ly: number; lw: number; lh: number; radius: string; text: string };

export type Geometry = {
  /** Footprint in feet. */
  w: number;
  h: number;
  seats: DerivedSeat[];
  rowLabels: { lx: number; ly: number; text: string }[];
  /** The table top itself, drawn under its chairs. */
  shapes: DerivedShape[];
};

/** Row letters. I and O are skipped — they read as 1 and 0 on a ticket. */
export const LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ".split("");

/** The design snaps to the half foot. */
export const snapFt = (v: number): number => Math.round(v * 2) / 2;

const DEFAULTS: Record<ObjectKind, Record<string, unknown>> = {
  row:      { name: "Rows", rows: 4, perRow: 12, seatSp: 2, rowSp: 3, curve: 0, aisle: 0, start: 0, dir: "ltr" },
  table:    { name: "Table", seats: 6, diam: 5, num: 1 },
  long:     { name: "Long table", seats: 8, len: 10, num: 1 },
  ga:       { name: "Standing", w: 24, h: 14, capAuto: true, cap: 60 },
  stage:    { name: "Stage", w: 32, h: 9 },
  obstacle: { name: "Bar", w: 18, h: 4 },
  label:    { name: "Label", w: 14, h: 3 },
};

/** A new object of `type` at (x, y), with the design's defaults. */
export function makeObject(
  type: ObjectKind,
  x: number,
  y: number,
  id: string,
  extra: Partial<SeatingObject> = {},
): SeatingObject {
  return {
    id,
    type,
    x,
    y,
    rot: 0,
    sec: null,
    level: "floor",
    removed: [],
    ada: [],
    ...(DEFAULTS[type] as Partial<SeatingObject>),
    ...extra,
  } as SeatingObject;
}

/**
 * Every seat in an object, and the footprint it occupies.
 *
 * `removed` is NOT applied here — the builder needs to draw a removed seat as
 * a gap, and the materialiser needs to know it was removed rather than never
 * existing. Callers filter.
 */
export function geometryOf(o: SeatingObject): Geometry {
  if (o.type === "row") {
    const rows = o.rows ?? 4;
    const perRow = o.perRow ?? 12;
    const seatSp = o.seatSp ?? 2;
    const rowSp = o.rowSp ?? 3;
    const curve = o.curve ?? 0;
    const aisle = o.aisle ?? 0;
    const start = o.start ?? 0;
    const dir = o.dir ?? "ltr";

    const aisleW = aisle ? 3 : 0;
    const w = (perRow - 1) * seatSp + aisleW + 3;
    const h = (rows - 1) * rowSp + curve + 2;
    const seats: DerivedSeat[] = [];
    const rowLabels: Geometry["rowLabels"] = [];

    for (let r = 0; r < rows; r++) {
      const L = LETTERS[(start + r) % LETTERS.length];
      for (let i = 0; i < perRow; i++) {
        const lx = 1.5 + i * seatSp + (aisle && i >= aisle ? aisleW : 0);
        // Parabolic arc: deepest at the centre, flat at the ends.
        const t = (lx - w / 2) / (w / 2);
        const ly = 1 + r * rowSp + curve * (1 - t * t);
        const n = dir === "ltr" ? i + 1 : perRow - i;
        seats.push({ id: `${o.id}-${L}${n}`, lx, ly, label: `Row ${L}, Seat ${n}`, rowLabel: L, seatNumber: n });
        if (i === 0) rowLabels.push({ lx: 0.2, ly, text: L });
      }
    }
    return { w, h, seats, rowLabels, shapes: [] };
  }

  if (o.type === "table") {
    const count = o.seats ?? 6;
    const diam = o.diam ?? 5;
    const num = o.num ?? 1;
    const w = diam + 3.2;
    const c = w / 2;
    const R = diam / 2 + 1;
    const seats: DerivedSeat[] = [];
    for (let k = 0; k < count; k++) {
      // Seat 1 at twelve o'clock, going clockwise.
      const a = (2 * Math.PI * k) / count - Math.PI / 2;
      seats.push({
        id: `${o.id}-T${num}-${k + 1}`,
        lx: c + R * Math.cos(a),
        ly: c + R * Math.sin(a),
        label: `Table ${num}, Seat ${k + 1}`,
        rowLabel: `T${num}`,
        seatNumber: k + 1,
      });
    }
    return { w, h: w, seats, rowLabels: [], shapes: [{ lx: 1.6, ly: 1.6, lw: diam, lh: diam, radius: "999px", text: `T${num}` }] };
  }

  if (o.type === "long") {
    const count = o.seats ?? 8;
    const len = o.len ?? 10;
    const num = o.num ?? 1;
    const w = len + 2;
    const h = 6.4;
    const per = Math.ceil(count / 2);
    const seats: DerivedSeat[] = [];
    for (let k = 0; k < count; k++) {
      const side = k < per ? 0 : 1;
      const i = side ? k - per : k;
      const cnt = side ? count - per : per;
      seats.push({
        id: `${o.id}-T${num}-${k + 1}`,
        lx: 1 + (len * (i + 0.5)) / cnt,
        ly: side ? 5.6 : 0.8,
        label: `Table ${num}, Seat ${k + 1}`,
        rowLabel: `T${num}`,
        seatNumber: k + 1,
      });
    }
    return { w, h, seats, rowLabels: [], shapes: [{ lx: 1, ly: 1.9, lw: len, lh: 2.6, radius: "6px", text: `T${num}` }] };
  }

  // ga / stage / obstacle / label — a box with no seats.
  return { w: o.w ?? 10, h: o.h ?? 10, seats: [], rowLabels: [], shapes: [] };
}

/**
 * Standing capacity. Five square feet a person is the design's rule, and the
 * same figure fire code is usually written against.
 */
export function gaCapacity(o: SeatingObject): number {
  if (o.type !== "ga") return 0;
  return o.capAuto === false ? o.cap ?? 0 : Math.floor(((o.w ?? 0) * (o.h ?? 0)) / 5);
}

/** Seats that actually exist and sell — `removed` taken out. */
export function sellableSeats(o: SeatingObject): DerivedSeat[] {
  const removed = new Set(o.removed ?? []);
  return geometryOf(o).seats.filter((s) => !removed.has(s.id));
}

/** What a room holds: seats plus standing. */
export function roomCapacity(objects: SeatingObject[]): number {
  return objects.reduce(
    (n, o) => n + (o.type === "ga" ? gaCapacity(o) : sellableSeats(o).length),
    0,
  );
}

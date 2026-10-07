import {
  makeObject,
  geometryOf,
  gaCapacity,
  sellableSeats,
  roomCapacity,
  snapFt,
  LETTERS,
  type SeatingObject,
} from "@/lib/seating/geometry";

/**
 * These pin the port to handoff/screens/seatmap-builder.dc.html. The figures
 * are what the design's own geo() produces — if a change here makes one fail,
 * the port has drifted from the design and the builder, the picker and the
 * materialiser have stopped agreeing about where a seat is.
 */

const row = (extra: Partial<SeatingObject> = {}) =>
  makeObject("row", 0, 0, "o1", extra);

describe("row blocks", () => {
  it("lays out rows x perRow with the design's defaults", () => {
    const g = geometryOf(row());
    expect(g.seats).toHaveLength(4 * 12);
    // w = (perRow-1)*seatSp + aisleW + 3 = 11*2 + 0 + 3
    expect(g.w).toBe(25);
    // h = (rows-1)*rowSp + curve + 2 = 3*3 + 0 + 2
    expect(g.h).toBe(11);
  });

  it("numbers left to right and labels rows from A", () => {
    const g = geometryOf(row({ rows: 2, perRow: 3 }));
    expect(g.seats.map((s) => s.id)).toEqual([
      "o1-A1", "o1-A2", "o1-A3",
      "o1-B1", "o1-B2", "o1-B3",
    ]);
    expect(g.seats[0].label).toBe("Row A, Seat 1");
    expect(g.rowLabels.map((r) => r.text)).toEqual(["A", "B"]);
  });

  it("reverses numbering right to left without moving the seats", () => {
    const ltr = geometryOf(row({ rows: 1, perRow: 4 }));
    const rtl = geometryOf(row({ rows: 1, perRow: 4, dir: "rtl" }));
    expect(rtl.seats.map((s) => s.seatNumber)).toEqual([4, 3, 2, 1]);
    // Same positions — only the numbers flip.
    expect(rtl.seats.map((s) => s.lx)).toEqual(ltr.seats.map((s) => s.lx));
  });

  it("skips I and O, which read as 1 and 0 on a ticket", () => {
    expect(LETTERS).not.toContain("I");
    expect(LETTERS).not.toContain("O");
    expect(LETTERS.slice(0, 9).join("")).toBe("ABCDEFGHJ");
  });

  it("starts the lettering at an offset, for a balcony continuing the floor", () => {
    const g = geometryOf(row({ rows: 2, perRow: 1, start: 9 }));
    expect(g.rowLabels.map((r) => r.text)).toEqual(["K", "L"]);
  });

  it("curves deepest at the centre and flat at the ends", () => {
    const g = geometryOf(row({ rows: 1, perRow: 5, curve: 2 }));
    const ys = g.seats.map((s) => s.ly);
    const mid = ys[2];
    expect(mid).toBeGreaterThan(ys[0]);
    expect(mid).toBeGreaterThan(ys[4]);
    // Symmetric about the centre.
    expect(ys[0]).toBeCloseTo(ys[4], 10);
    expect(ys[1]).toBeCloseTo(ys[3], 10);
  });

  it("opens a 3ft aisle after the nth seat and widens the block by it", () => {
    const noAisle = geometryOf(row({ rows: 1, perRow: 8 }));
    const aisled = geometryOf(row({ rows: 1, perRow: 8, aisle: 4 }));
    expect(aisled.w - noAisle.w).toBe(3);
    // Seats before the aisle are unmoved; everything after shifts by 3ft.
    expect(aisled.seats[3].lx).toBe(noAisle.seats[3].lx);
    expect(aisled.seats[4].lx - noAisle.seats[4].lx).toBe(3);
  });
});

describe("round tables", () => {
  it("spaces seats evenly around the table, seat 1 at twelve o'clock", () => {
    const g = geometryOf(makeObject("table", 0, 0, "t1", { seats: 4, diam: 4, num: 7 }));
    expect(g.seats).toHaveLength(4);
    expect(g.w).toBe(g.h); // square footprint
    const c = g.w / 2;
    // Seat 1 directly above centre.
    expect(g.seats[0].lx).toBeCloseTo(c, 10);
    expect(g.seats[0].ly).toBeLessThan(c);
    // All at the same radius.
    const radii = g.seats.map((s) => Math.hypot(s.lx - c, s.ly - c));
    for (const r of radii) expect(r).toBeCloseTo(radii[0], 10);
  });

  it("ids and labels carry the table number", () => {
    const g = geometryOf(makeObject("table", 0, 0, "t1", { seats: 2, num: 4 }));
    expect(g.seats.map((s) => s.id)).toEqual(["t1-T4-1", "t1-T4-2"]);
    expect(g.seats[0].label).toBe("Table 4, Seat 1");
    expect(g.seats[0].rowLabel).toBe("T4");
    expect(g.shapes[0].text).toBe("T4");
  });

  it("an 8-top is eight individually identified seats", () => {
    // The sixth sell mode depends on this: each chair is addressable, so a
    // party can take all eight or a stranger can take one.
    const g = geometryOf(makeObject("table", 0, 0, "t1", { seats: 8, diam: 6, num: 1 }));
    expect(g.seats).toHaveLength(8);
    expect(new Set(g.seats.map((s) => s.id)).size).toBe(8);
  });
});

describe("long tables", () => {
  it("splits seats down both sides, the larger half nearest the stage", () => {
    const g = geometryOf(makeObject("long", 0, 0, "l1", { seats: 7, len: 10, num: 2 }));
    expect(g.seats).toHaveLength(7);
    const top = g.seats.filter((s) => s.ly < 3);
    const bottom = g.seats.filter((s) => s.ly > 3);
    expect(top).toHaveLength(4); // ceil(7/2)
    expect(bottom).toHaveLength(3);
  });
});

describe("standing room", () => {
  it("computes capacity at five square feet a head", () => {
    expect(gaCapacity(makeObject("ga", 0, 0, "g1", { w: 40, h: 15 }))).toBe(120);
  });
  it("honours a typed-in capacity over the area", () => {
    expect(gaCapacity(makeObject("ga", 0, 0, "g1", { w: 40, h: 15, capAuto: false, cap: 90 }))).toBe(90);
  });
  it("has no seats", () => {
    expect(geometryOf(makeObject("ga", 0, 0, "g1")).seats).toHaveLength(0);
  });
});

describe("removed seats", () => {
  it("are drawn by geometryOf but do not sell", () => {
    const o = row({ rows: 1, perRow: 4, removed: ["o1-A2"] });
    expect(geometryOf(o).seats).toHaveLength(4);
    expect(sellableSeats(o).map((s) => s.id)).toEqual(["o1-A1", "o1-A3", "o1-A4"]);
  });
});

describe("room capacity", () => {
  it("adds seats and standing together", () => {
    const objects = [
      row({ rows: 2, perRow: 10 }),                                   // 20
      makeObject("table", 0, 0, "t1", { seats: 8 }),                   // 8
      makeObject("ga", 0, 0, "g1", { w: 20, h: 10 }),                  // 40
      makeObject("stage", 0, 0, "s1"),                                 // 0
    ];
    expect(roomCapacity(objects)).toBe(68);
  });
});

describe("snapping", () => {
  it("snaps to the half foot", () => {
    expect(snapFt(3.2)).toBe(3);
    expect(snapFt(3.3)).toBe(3.5);
    expect(snapFt(3.74)).toBe(3.5);
    expect(snapFt(3.8)).toBe(4);
  });
});

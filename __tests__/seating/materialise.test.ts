import { planMaterialise, describePlan, isSpokenFor, type StoredSeat } from "@/lib/seating/materialise";
import { makeObject, geometryOf } from "@/lib/seating/geometry";

const SEC = "sec-1";
const seat = (over: Partial<StoredSeat> = {}): StoredSeat => ({
  id: "s-" + Math.random().toString(36).slice(2, 8),
  object_id: "o1",
  row_label: "A",
  seat_number: 1,
  x_ft: 0,
  y_ft: 0,
  status: "available",
  order_id: null,
  ...over,
});

/** Stored seats matching an object exactly, as a fresh materialise would leave them. */
function storedFor(o: ReturnType<typeof makeObject>): StoredSeat[] {
  return geometryOf(o).seats.map((d) =>
    seat({
      id: `stored-${d.id}`,
      row_label: d.rowLabel,
      seat_number: d.seatNumber,
      x_ft: Math.round((o.x + d.lx) * 2) / 2,
      y_ft: Math.round((o.y + d.ly) * 2) / 2,
    }),
  );
}

describe("a fresh object", () => {
  it("inserts every seat and moves none", () => {
    const o = makeObject("row", 10, 10, "o1", { rows: 2, perRow: 4 });
    const p = planMaterialise(o, SEC, []);
    expect(p.insert).toHaveLength(8);
    expect(p.move).toHaveLength(0);
    expect(p.deleteIds).toHaveLength(0);
    expect(p.conflicts).toHaveLength(0);
    expect(p.insert[0]).toMatchObject({ section_id: SEC, object_id: "o1", row_label: "A", seat_number: 1 });
  });

  it("is a no-op when the room already matches", () => {
    const o = makeObject("row", 10, 10, "o1", { rows: 2, perRow: 4 });
    const p = planMaterialise(o, SEC, storedFor(o));
    expect(p.insert).toHaveLength(0);
    expect(p.move).toHaveLength(0);
    expect(p.deleteIds).toHaveLength(0);
    expect(describePlan(p)).toBe("nothing to change");
  });
});

describe("moving a block", () => {
  it("moves seats rather than recreating them, so a ticket stays true", () => {
    const before = makeObject("row", 10, 10, "o1", { rows: 2, perRow: 4 });
    const stored = storedFor(before);
    const after = { ...before, x: 20 };

    const p = planMaterialise(after, SEC, stored);
    expect(p.insert).toHaveLength(0);
    expect(p.deleteIds).toHaveLength(0);
    expect(p.move).toHaveLength(8);
    // Same rows, new coordinates — the ids are preserved.
    expect(p.move.map((m) => m.id).sort()).toEqual(stored.map((s) => s.id).sort());
  });

  it("ignores a shift smaller than the snap grid", () => {
    const o = makeObject("row", 10, 10, "o1", { rows: 1, perRow: 3 });
    const stored = storedFor(o);
    const p = planMaterialise({ ...o, x: 10.1 }, SEC, stored);
    expect(p.move).toHaveLength(0);
  });
});

describe("growing and shrinking", () => {
  it("adds only the new seats when a row gets wider", () => {
    const before = makeObject("row", 0, 0, "o1", { rows: 1, perRow: 4 });
    const stored = storedFor(before);
    const p = planMaterialise({ ...before, perRow: 6 }, SEC, stored);
    expect(p.insert.map((i) => i.seat_number)).toEqual([5, 6]);
    expect(p.deleteIds).toHaveLength(0);
  });

  it("deletes the seats that are gone, when nobody holds them", () => {
    const before = makeObject("row", 0, 0, "o1", { rows: 1, perRow: 6 });
    const stored = storedFor(before);
    const p = planMaterialise({ ...before, perRow: 4 }, SEC, stored);
    expect(p.deleteIds).toHaveLength(2);
    expect(p.conflicts).toHaveLength(0);
  });
});

/**
 * The rule the whole file exists for. 732 of the seats on file are sold MSM
 * tickets; an edit must never be able to delete one.
 */
describe("a sold seat is not editable inventory", () => {
  it("keeps a SOLD seat the new layout has no place for, and reports it", () => {
    const before = makeObject("row", 0, 0, "o1", { rows: 1, perRow: 6 });
    const stored = storedFor(before);
    stored[5] = { ...stored[5], status: "sold", order_id: "ord-1" };

    const p = planMaterialise({ ...before, perRow: 5 }, SEC, stored);
    expect(p.deleteIds).not.toContain(stored[5].id);
    expect(p.conflicts).toHaveLength(1);
    expect(p.conflicts[0]).toMatchObject({ id: stored[5].id, status: "sold" });
  });

  it("keeps a HELD seat too — someone is mid-checkout", () => {
    const before = makeObject("row", 0, 0, "o1", { rows: 1, perRow: 4 });
    const stored = storedFor(before);
    stored[3] = { ...stored[3], status: "held" };
    const p = planMaterialise({ ...before, perRow: 3 }, SEC, stored);
    expect(p.deleteIds).toHaveLength(0);
    expect(p.conflicts).toHaveLength(1);
  });

  it("says so in words, so the builder can ask before writing", () => {
    const before = makeObject("row", 0, 0, "o1", { rows: 1, perRow: 6 });
    const stored = storedFor(before);
    stored[5] = { ...stored[5], status: "sold", order_id: "ord-1" };
    const text = describePlan(planMaterialise({ ...before, perRow: 5 }, SEC, stored));
    expect(text).toMatch(/1 sold or held seat sits outside the new layout/);
  });

  it("a removed seat that is sold is kept, not quietly destroyed", () => {
    const o = makeObject("row", 0, 0, "o1", { rows: 1, perRow: 4 });
    const stored = storedFor(o);
    stored[1] = { ...stored[1], status: "sold", order_id: "ord-9" };
    // Operator marks A2 as removed — a pillar went in.
    const p = planMaterialise({ ...o, removed: ["o1-A2"] }, SEC, stored);
    expect(p.deleteIds).toHaveLength(0);
    expect(p.conflicts.map((c) => c.label)).toEqual(["A 2"]);
  });
});

describe("isSpokenFor", () => {
  it.each([
    [{ status: "sold", order_id: null }, true],
    [{ status: "held", order_id: null }, true],
    [{ status: "available", order_id: "ord-1" }, true],
    [{ status: "available", order_id: null }, false],
    [{ status: null, order_id: null }, false],
  ])("%o -> %s", (s, expected) => {
    expect(isSpokenFor(s as StoredSeat)).toBe(expected);
  });
});

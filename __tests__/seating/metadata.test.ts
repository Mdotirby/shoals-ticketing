import { toSeatingObject, kindOf, isHidden } from "@/lib/seating/metadata";
import { geometryOf, sellableSeats } from "@/lib/seating/geometry";

/** A real VIP Tables row, copied from the live database. */
const VIP_TABLE = {
  id: "5417fa57-a9a6-4f6d-8fe2-fbca7198ee21",
  section_id: "ca8454f3-f464-4181-ade6-f502d1419ac6",
  type: "table_group",
  x_ft: 47.6335,
  y_ft: 49.826,
  width_ft: 6,
  height_ft: 6,
  rotation: 0,
  metadata: { table_number: 9, diameter_inches: 72, seats_per_table: 8 },
};

/** A real row_block, from the GA section. */
const GA_ROW = {
  id: "row-1",
  section_id: "sec-ga",
  type: "row_block",
  x_ft: 5,
  y_ft: 45,
  width_ft: 25.4,
  height_ft: 2,
  rotation: 0,
  metadata: { row_label: "A", seats_per_row: 14 },
};

describe("type names", () => {
  it.each([
    ["row_block", "row"],
    ["table_group", "table"],
    ["ga_zone", "ga"],
    ["stage", "stage"],
  ])("%s -> %s", (stored, expected) => {
    expect(kindOf(stored)).toBe(expected);
  });
});

describe("a stored row is one row, not a block", () => {
  it("reads seats_per_row and keeps the object id", () => {
    const o = toSeatingObject(GA_ROW);
    expect(o.id).toBe("row-1");
    expect(o.rows).toBe(1);
    expect(o.perRow).toBe(14);
    expect(sellableSeats(o)).toHaveLength(14);
  });

  it("keeps the row's own letter, so seat ids match the tickets sold", () => {
    const b = toSeatingObject({ ...GA_ROW, metadata: { row_label: "B", seats_per_row: 3 } });
    const seats = geometryOf(b).seats;
    expect(seats.map((s) => s.rowLabel)).toEqual(["B", "B", "B"]);
    expect(seats[0].id).toBe("row-1-B1");
  });

  it("does NOT merge rows — merging would change object_id, which sold seats reference", () => {
    const a = toSeatingObject({ ...GA_ROW, id: "r-a", metadata: { row_label: "A", seats_per_row: 10 } });
    const b = toSeatingObject({ ...GA_ROW, id: "r-b", metadata: { row_label: "B", seats_per_row: 10 } });
    expect(a.id).not.toBe(b.id);
    expect(a.rows).toBe(1);
    expect(b.rows).toBe(1);
  });
});

describe("a stored table", () => {
  it("converts the diameter from inches to feet", () => {
    const o = toSeatingObject(VIP_TABLE);
    expect(o.diam).toBe(6); // 72in
    expect(o.seats).toBe(8);
    expect(o.num).toBe(9);
  });

  it("derives the eight addressable chairs the sixth sell mode needs", () => {
    const seats = sellableSeats(toSeatingObject(VIP_TABLE));
    expect(seats).toHaveLength(8);
    expect(seats[0].id).toBe(`${VIP_TABLE.id}-T9-1`);
    expect(seats[0].rowLabel).toBe("T9");
    expect(new Set(seats.map((s) => s.id)).size).toBe(8);
  });

  it("names itself from the table number when there is no label", () => {
    expect(toSeatingObject(VIP_TABLE).name).toBe("Table 9");
  });
});

describe("the design's own keys round-trip", () => {
  it("prefers them, so a new object written by the builder is read back unchanged", () => {
    const o = toSeatingObject({
      ...GA_ROW,
      metadata: { rows: 6, perRow: 14, curve: 2, aisle: 7, start: 0, dir: "rtl", name: "Orchestra" },
    });
    expect(o.rows).toBe(6);
    expect(o.perRow).toBe(14);
    expect(o.curve).toBe(2);
    expect(o.aisle).toBe(7);
    expect(o.dir).toBe("rtl");
    expect(o.name).toBe("Orchestra");
    expect(sellableSeats(o)).toHaveLength(84);
  });
});

describe("boxes", () => {
  it("takes a stage's label and size", () => {
    const o = toSeatingObject({
      id: "s1", section_id: null, type: "stage", x_ft: 1.4, y_ft: 2.8,
      width_ft: 32, height_ft: 6, rotation: 0, metadata: { label: "STAGE" },
    });
    expect(o.name).toBe("STAGE");
    expect(o.w).toBe(32);
    expect(geometryOf(o).seats).toHaveLength(0);
  });
});

describe("hidden objects", () => {
  it("is recognised — one VIP table carries it", () => {
    expect(isHidden({ ...VIP_TABLE, metadata: { ...VIP_TABLE.metadata, hidden: true } })).toBe(true);
    expect(isHidden(VIP_TABLE)).toBe(false);
  });
});

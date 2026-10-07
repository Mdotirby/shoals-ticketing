import { resolveSaleShape, isAssigned } from "@/lib/seating/sellMode";

/** VIP Tables as it stands in the live room: 11 tables of 8, $800 a table. */
const VIP = {
  name: "VIP Tables",
  price_cents: 80000,
  type: "table",
  sells_as_table: true,
};

describe("resolveSaleShape", () => {
  it("prices a whole-table section by the table", () => {
    const r = resolveSaleShape({ ...VIP, sale_unit: "table" });
    expect(r).toEqual({ byTable: true, priceCents: 80000 });
  });

  it("prices individual seats at a table from the per-seat price", () => {
    const r = resolveSaleShape({ ...VIP, sale_unit: "seat", seat_price_cents: 10000 });
    expect(r).toEqual({ byTable: false, priceCents: 10000 });
  });

  it("REFUSES to guess a seat price by dividing the table price", () => {
    // $800 / 8 would be $100 and would look right, which is exactly the
    // problem — nobody set it, and on a 4-top the same guess is $200.
    const r = resolveSaleShape({ ...VIP, sale_unit: "seat" });
    expect(r).toHaveProperty("error");
    expect((r as { error: string }).error).toMatch(/per-seat price/i);
  });

  it("a party taking every seat at a table is just eight seat purchases", () => {
    const r = resolveSaleShape({ ...VIP, sale_unit: "seat", seat_price_cents: 10000 });
    expect(r).toEqual({ byTable: false, priceCents: 10000 });
    // Eight of them is the table price, so nothing is given away by allowing it.
    expect(8 * (r as { priceCents: number }).priceCents).toBe(80000);
  });

  it("does not let a non-table section sell by the table", () => {
    const r = resolveSaleShape({ name: "GA", price_cents: 2000, type: "row", sale_unit: "table" });
    expect(r).toHaveProperty("error");
  });

  it("prices an ordinary row section per seat", () => {
    expect(resolveSaleShape({ name: "Section 1", price_cents: 7500, type: "row" }))
      .toEqual({ byTable: false, priceCents: 7500 });
  });
});

/**
 * The old rule was `sells_as_table || type === "table"`, which meant a table
 * section ALWAYS billed per table. These are the cases that rule got wrong.
 */
describe("the hardcode this replaces", () => {
  it("sale_unit beats the legacy flag, so turning table-selling off now works", () => {
    const r = resolveSaleShape({ ...VIP, sells_as_table: true, sale_unit: "seat", seat_price_cents: 10000 });
    expect((r as { byTable: boolean }).byTable).toBe(false);
  });

  it("falls back to sells_as_table before the migration has run", () => {
    // No sale_unit column yet: behave exactly as today.
    expect(resolveSaleShape(VIP)).toEqual({ byTable: true, priceCents: 80000 });
    expect(resolveSaleShape({ name: "Sec 1", price_cents: 7500, type: "row", sells_as_table: false }))
      .toEqual({ byTable: false, priceCents: 7500 });
  });
});

describe("isAssigned", () => {
  it("defaults to assigned, which is what every section was before the column", () => {
    expect(isAssigned({})).toBe(true);
    expect(isAssigned({ seating_mode: "assigned" })).toBe(true);
  });
  it("recognises first come", () => {
    expect(isAssigned({ seating_mode: "first_come" })).toBe(false);
  });
});

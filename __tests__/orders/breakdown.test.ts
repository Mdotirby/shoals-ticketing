import { feeIsInsideFace, orderBreakdown, type LedgerSale } from "@/lib/orders/breakdown";

/** Sum of the lines, which must always equal what the buyer was charged. */
const sum = (sale: LedgerSale) =>
  Math.round(orderBreakdown(sale).reduce((n, l) => n + l.amount, 0) * 100) / 100;

const line = (sale: LedgerSale, label: string) =>
  orderBreakdown(sale).find((l) => l.label === label)!.amount;

describe("orderBreakdown", () => {
  // Real shapes, taken from the ledger: one per way a ticket gets sold.
  const online: LedgerSale = { gross_amount: 33.0, ticket_revenue: 30, ticketing_fee: 3, facility_fee: 0, tax_collected: 0 };
  const boxOffice: LedgerSale = { gross_amount: 32.85, ticket_revenue: 30, ticketing_fee: 3, facility_fee: 0, tax_collected: 2.85 };
  const inlineCheckout: LedgerSale = { gross_amount: 29.01, ticket_revenue: 20, ticketing_fee: 3, facility_fee: 3, tax_collected: 1.9 };
  const comp: LedgerSale = { gross_amount: 0, ticket_revenue: 0, ticketing_fee: 0, facility_fee: 0, tax_collected: 0 };

  it("always sums to what the buyer was charged", () => {
    for (const sale of [online, boxOffice, inlineCheckout, comp]) {
      expect(sum(sale)).toBe(sale.gross_amount);
    }
  });

  it("leaves a face value that does not contain the fee alone", () => {
    expect(feeIsInsideFace(online)).toBe(false);
    expect(line(online, "Face value")).toBe(30);
    expect(line(online, "Card surcharge")).toBe(0);
  });

  it("nets the fee out of the face when the box office priced it in", () => {
    // 30 already contains the 3 fee: 27 + 3 + 2.85 = 32.85, not 35.85.
    expect(feeIsInsideFace(boxOffice)).toBe(true);
    expect(line(boxOffice, "Face value")).toBe(27);
    expect(line(boxOffice, "Service fee")).toBe(3);
    expect(line(boxOffice, "Card surcharge")).toBe(0);
  });

  it("keeps a real card surcharge as the leftover", () => {
    expect(feeIsInsideFace(inlineCheckout)).toBe(false);
    expect(line(inlineCheckout, "Face value")).toBe(20);
    expect(line(inlineCheckout, "Card surcharge")).toBe(1.11);
  });

  it("never reports a negative surcharge — that was the bug", () => {
    for (const sale of [online, boxOffice, inlineCheckout, comp]) {
      expect(line(sale, "Card surcharge")).toBeGreaterThanOrEqual(0);
    }
  });

  it("handles a comp without dividing by anything", () => {
    expect(sum(comp)).toBe(0);
    expect(line(comp, "Face value")).toBe(0);
  });
});

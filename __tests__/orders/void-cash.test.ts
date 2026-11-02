import { isCashSource, voidBlocker, voidReversal } from "@/lib/orders/voidPolicy";
import { refusalReason } from "@/lib/tickets/void";

/**
 * Voiding a cash sale rung up by mistake: no money moved, so it comes off the
 * books instead of being refunded. Card sales still go through Stripe.
 */
describe("void a cash sale", () => {
  it("knows every cash source", () => {
    expect(isCashSource("cash")).toBe(true);
    expect(isCashSource("box_office_cash")).toBe(true);
    expect(isCashSource("terminal")).toBe(false);
    expect(isCashSource("inline_checkout")).toBe(false);
    expect(isCashSource(null)).toBe(false);
  });

  it("voids a paid cash sale", () => {
    expect(voidBlocker({ status: "paid", source: "cash", total_amount: 15 })).toBeNull();
  });

  it("refuses card sales, refunds and repeats", () => {
    expect(voidBlocker({ status: "paid", source: "terminal" })).toMatch(/refund it instead/);
    expect(voidBlocker({ status: "paid", source: "inline_checkout" })).toMatch(/Only cash sales/);
    expect(voidBlocker({ status: "refunded", source: "cash" })).toMatch(/refunded/);
    expect(voidBlocker({ status: "voided", source: "cash" })).toMatch(/already voided/);
  });

  it("reverses what the order's ledger rows still add up to", () => {
    expect(voidReversal([{ gross_amount: 15, ticket_revenue: 15, net_to_venue: 15 }])).toEqual({
      gross_amount: -15, ticket_revenue: -15, net_to_venue: -15,
    });
  });

  it("writes nothing when the rows already net to zero", () => {
    expect(voidReversal([
      { gross_amount: 43.56, ticket_revenue: 30, net_to_venue: 38 },
      { gross_amount: -43.56, ticket_revenue: -30, net_to_venue: -38 },
    ])).toBeNull();
    expect(voidReversal([])).toBeNull();
  });

  it("a voided sale's tickets are refused at the door", () => {
    expect(refusalReason({ orderStatus: "voided" })).toMatch(/voided/);
    expect(refusalReason({ orderStatus: "paid" })).toBeNull();
  });
});

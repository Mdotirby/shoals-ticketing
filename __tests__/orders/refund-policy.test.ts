import { refundBlocker } from "@/lib/orders/refundPolicy";

const paid = { status: "paid", source: "online" };
const live = { booking_status: "confirmed" };
const cancelled = { booking_status: "cancelled" };

describe("refundBlocker", () => {
  test("a glitch refund on a paid online order goes ahead", () => {
    expect(refundBlocker(paid, live, "glitch")).toBeNull();
  });
  test("a cancelled show's orders refund as show_cancelled", () => {
    expect(refundBlocker(paid, cancelled, "show_cancelled")).toBeNull();
  });
  test("no reason, or any other reason, is refused — there's no courtesy refund", () => {
    expect(refundBlocker(paid, live, undefined)).toMatch(/only issued when a show is cancelled/);
    expect(refundBlocker(paid, live, "changed_mind")).toMatch(/only issued/);
  });
  test("show_cancelled needs the show actually cancelled", () => {
    expect(refundBlocker(paid, live, "show_cancelled")).toMatch(/isn't marked cancelled/);
  });
  test("cash is refunded at the drawer, not here", () => {
    expect(refundBlocker({ status: "paid", source: "cash" }, cancelled, "show_cancelled")).toMatch(/drawer is physical/);
  });
  test("already refunded is refused", () => {
    expect(refundBlocker({ status: "refunded", source: "online" }, cancelled, "show_cancelled")).toMatch(/already refunded/);
  });
});

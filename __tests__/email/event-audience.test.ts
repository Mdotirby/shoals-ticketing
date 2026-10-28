import { eventEmailAudience } from "@/lib/email/event-audience";

/**
 * Who gets an email about one show.
 *
 * This is the rule that, if it is wrong, puts a message in front of hundreds
 * of people it was not meant for — so it is pinned harder than most things
 * here: who is in, who is out, and that one buyer is one email however many
 * times they ordered.
 */

type Row = { customer_email: string | null; customer_name: string | null; status: string | null };

/** Stands in for PostgREST, including its 1,000-row page. */
function fakeAdmin(rows: Row[], opts: { pageSize?: number } = {}) {
  const page = opts.pageSize ?? 1000;
  const queries: Array<[number, number]> = [];
  return {
    queries,
    from() {
      const q = {
        select: () => q,
        eq: () => q,
        range(from: number, to: number) {
          queries.push([from, to]);
          return Promise.resolve({ data: rows.slice(from, Math.min(from + page, to + 1)), error: null });
        },
      };
      return q;
    },
  } as never;
}

const paid = (email: string | null, name: string | null = "A Buyer"): Row =>
  ({ customer_email: email, customer_name: name, status: "paid" });
const refunded = (email: string): Row =>
  ({ customer_email: email, customer_name: "Refunded Person", status: "refunded" });

describe("who is in", () => {
  test("paid buyers, one per distinct address", async () => {
    const a = await eventEmailAudience(
      fakeAdmin([paid("one@example.com"), paid("two@example.com")]),
      "evt",
    );
    expect(a.recipients.map((r) => r.email)).toEqual(["one@example.com", "two@example.com"]);
    expect(a.paidOrders).toBe(2);
  });

  test("three orders from one buyer is one email", async () => {
    // Muscle Shoals Meets: 237 orders, 225 people.
    const a = await eventEmailAudience(
      fakeAdmin([paid("repeat@example.com"), paid("repeat@example.com"), paid("repeat@example.com")]),
      "evt",
    );
    expect(a.recipients).toHaveLength(1);
    expect(a.paidOrders).toBe(3);
  });

  test("the same address in different case or with spaces is the same person", async () => {
    const a = await eventEmailAudience(
      fakeAdmin([paid("Sam@Example.com"), paid("  sam@example.com  "), paid("SAM@EXAMPLE.COM")]),
      "evt",
    );
    expect(a.recipients).toEqual([{ email: "sam@example.com", name: "A Buyer" }]);
  });

  test("the first order's name is the one used, so two runs agree", async () => {
    const a = await eventEmailAudience(
      fakeAdmin([paid("x@example.com", "First Name"), paid("x@example.com", "Later Name")]),
      "evt",
    );
    expect(a.recipients[0].name).toBe("First Name");
  });
});

describe("who is out", () => {
  test("refunded buyers are excluded by default", async () => {
    // They no longer hold a ticket. "See you Saturday" to someone you
    // refunded is a complaint, not a reminder.
    const a = await eventEmailAudience(
      fakeAdmin([paid("still@example.com"), refunded("gone@example.com")]),
      "evt",
    );
    expect(a.recipients.map((r) => r.email)).toEqual(["still@example.com"]);
    expect(a.refundedOrders).toBe(1);
  });

  test("but can be included deliberately — the cancellation case", async () => {
    const a = await eventEmailAudience(
      fakeAdmin([paid("still@example.com"), refunded("gone@example.com")]),
      "evt",
      { includeRefunded: true },
    );
    expect(a.recipients.map((r) => r.email).sort()).toEqual(["gone@example.com", "still@example.com"]);
  });

  test("a refunded buyer who also has a paid order still gets it", async () => {
    // They hold a ticket. The refund was for a different order.
    const a = await eventEmailAudience(
      fakeAdmin([refunded("both@example.com"), paid("both@example.com")]),
      "evt",
    );
    expect(a.recipients.map((r) => r.email)).toEqual(["both@example.com"]);
  });
});

describe("orders this cannot reach", () => {
  test("no address is counted, not silently dropped", async () => {
    // Box office cash sales. 11 of the first 1,000 orders on file have none.
    const a = await eventEmailAudience(
      fakeAdmin([paid("has@example.com"), paid(null), paid("")]),
      "evt",
    );
    expect(a.recipients).toHaveLength(1);
    expect(a.unreachableOrders).toBe(2);
  });

  test("something that is not an address counts as unreachable", async () => {
    const a = await eventEmailAudience(fakeAdmin([paid("walk-up"), paid("n/a")]), "evt");
    expect(a.recipients).toHaveLength(0);
    expect(a.unreachableOrders).toBe(2);
  });

  test("a show with nobody to write to", async () => {
    const a = await eventEmailAudience(fakeAdmin([]), "evt");
    expect(a.recipients).toEqual([]);
    expect(a.paidOrders).toBe(0);
  });
});

describe("a show bigger than one page", () => {
  test("buyers past the 1,000th are not lost", async () => {
    // PostgREST stops an unbounded select at 1,000 rows. A show that sold
    // 1,200 tickets would quietly lose its last 200 buyers — the same
    // truncation that made eventSales under-report.
    const rows = Array.from({ length: 1150 }, (_, i) => paid(`buyer${i}@example.com`));
    const admin = fakeAdmin(rows);
    const a = await eventEmailAudience(admin, "evt");
    expect(a.recipients).toHaveLength(1150);
    expect(a.paidOrders).toBe(1150);
    // Two full pages and a short one, which is what ends the loop.
    expect((admin as unknown as { queries: Array<[number, number]> }).queries.length).toBe(2);
  });
});

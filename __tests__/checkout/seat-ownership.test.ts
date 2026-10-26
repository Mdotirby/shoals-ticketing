import { assertSeatsBelongToEvent } from "@/lib/checkout-helpers";

/**
 * Seats have no event_id. A seat belongs to a section, a section to a layout,
 * and a layout is attached to an event by event_layout_maps — so every
 * checkout path that took seat ids from a request body and wrote them with
 * `.in("id", seatIds)` was holding and selling seats without asking whose
 * show they were.
 *
 * Confirmed against a running server: create-intent with Bottomland's eventId
 * and two Comic Invasion seat ids returned 200, created a PaymentIntent
 * priced at Comic Invasion's $30 seats rather than Bottomland's $15 GA, and
 * held both seats against a Bottomland order.
 *
 * These pin the guard that now stands underneath all three routes.
 */

/** The three reads the guard makes, in order. */
function fakeAdmin(opts: {
  layoutForEvent?: Record<string, string | null>;
  sectionsByLayout?: Record<string, string[]>;
  seats?: Array<{ id: string; section_id: string }>;
}) {
  const calls: string[] = [];
  const client = {
    calls,
    from(table: string) {
      calls.push(table);
      if (table === "event_layout_maps") {
        let eventId = "";
        const q = {
          select: () => q,
          eq(col: string, val: string) { if (col === "event_id") eventId = val; return q; },
          maybeSingle: async () => {
            const layout = opts.layoutForEvent?.[eventId] ?? null;
            return { data: layout ? { layout_id: layout } : null };
          },
        };
        return q;
      }
      if (table === "sections") {
        let layoutId = "";
        const q = {
          select: () => q,
          eq(_col: string, val: string) { layoutId = val; return Promise.resolve({ data: (opts.sectionsByLayout?.[layoutId] ?? []).map((id) => ({ id })) }) as never; },
        };
        return q;
      }
      if (table === "seats") {
        const q = {
          select: () => q,
          in: (_col: string, ids: string[]) =>
            Promise.resolve({ data: (opts.seats ?? []).filter((s) => ids.includes(s.id)) }),
        };
        return q;
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
  return client as never;
}

const SEATED = {
  layoutForEvent: { showA: "layoutA", showB: "layoutB" },
  sectionsByLayout: { layoutA: ["secA1", "secA2"], layoutB: ["secB1"] },
  seats: [
    { id: "a1", section_id: "secA1" },
    { id: "a2", section_id: "secA2" },
    { id: "b1", section_id: "secB1" },
  ],
};

describe("seats from the show being bought", () => {
  test("its own seats pass", async () => {
    const r = await assertSeatsBelongToEvent(fakeAdmin(SEATED), "showA", ["a1", "a2"]);
    expect(r.ok).toBe(true);
  });

  test("another show's seats are refused, and named", async () => {
    // The exact shape of the live bug: show B's seats under show A.
    const r = await assertSeatsBelongToEvent(fakeAdmin(SEATED), "showA", ["b1"]);
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("unreachable");
    expect(r.foreign).toEqual(["b1"]);
    expect(r.error).toMatch(/not part of this show/i);
  });

  test("one foreign seat among its own spoils the whole request", async () => {
    // Not "drop the bad one and sell the rest" — the buyer picked a set, and
    // half a set at the wrong price is its own wrong answer.
    const r = await assertSeatsBelongToEvent(fakeAdmin(SEATED), "showA", ["a1", "b1", "a2"]);
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("unreachable");
    expect(r.foreign).toEqual(["b1"]);
  });

  test("a seat id that does not exist is foreign too", async () => {
    const r = await assertSeatsBelongToEvent(fakeAdmin(SEATED), "showA", ["a1", "nope"]);
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("unreachable");
    expect(r.foreign).toEqual(["nope"]);
  });
});

describe("a show with no seat map", () => {
  test("seats sent to it are all refused", async () => {
    // Bottomland is general admission. Any seat id at all is somebody else's.
    const r = await assertSeatsBelongToEvent(fakeAdmin(SEATED), "showGA", ["a1", "b1"]);
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("unreachable");
    expect(r.foreign).toEqual(["a1", "b1"]);
    expect(r.error).toMatch(/does not have reserved seating/i);
  });

  test("a show whose map is disabled counts as having none", async () => {
    // The guard only matches enabled:true, so a map switched off sells no seats.
    const r = await assertSeatsBelongToEvent(
      fakeAdmin({ ...SEATED, layoutForEvent: { showA: null } }),
      "showA",
      ["a1"],
    );
    expect(r.ok).toBe(false);
  });
});

describe("nothing to check", () => {
  test.each([[[]], [null], [undefined]])("%p passes without a query", async (seatIds) => {
    // A general-admission purchase sends no seats; it must not pay for three
    // round trips to find that out.
    const admin = fakeAdmin(SEATED);
    const r = await assertSeatsBelongToEvent(admin, "showA", seatIds as string[]);
    expect(r.ok).toBe(true);
    expect((admin as unknown as { calls: string[] }).calls).toEqual([]);
  });
});

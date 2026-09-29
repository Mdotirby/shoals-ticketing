import type { SupabaseClient } from "@supabase/supabase-js";
import { getEventSeatInventory } from "@/lib/checkout-helpers";

/**
 * Sold, capacity and gross for a set of events — the one definition the
 * Command Center's next-14-nights, the calendar's utilization and the show
 * list all read, so they can't disagree about the same show.
 *
 *   sold      paid tickets, comps excluded
 *   capacity  the seat map when the event has one, else the sum of its tiers
 *   scanned   tickets marked is_scanned — the drop count
 *   gross     settlement_ledger gross_amount (net of refunds — PHASE1B rule 1)
 *
 * ── Why capacity has two sources ─────────────────────────────────────────
 * ticket_tiers.capacity is a typed-in number and drifts on a seated show —
 * "10 tables" where the room really holds 80 seats. When the event has a
 * layout the seats table is counted instead, which is what it actually has
 * to sell.
 *
 * This used to live in two places. /api/marketing/event-performance had the
 * seat-map logic but summed orders.quantity for sold (comps included, and it
 * drifts on a refunded-but-still-reserved order), while this file counted
 * tickets correctly but never looked at the seat map. So the Ticket Sales
 * screen and the Command Center could report different numbers for the same
 * show, and did. One definition now, taking the right half of each.
 */
export type EventSales = { sold: number; capacity: number; scanned: number; gross: number };

/**
 * Read every row, not the first thousand.
 *
 * PostgREST caps an unbounded select at 1,000 rows and says nothing about
 * it. This function used to select tickets for every event in one go: with
 * 2,169 tickets across 42 shows it got 1,000 rows covering 12 of them, and
 * the other 30 reported ZERO SOLD — on the Command Center, on the calendar's
 * utilisation, and through /api/admin/events/sales. A sold-out show could
 * read empty depending on where it fell in the ordering.
 */
async function fetchAllRows<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const PAGE = 1000;
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error || !data) break;
    out.push(...data);
    if (data.length < PAGE) break;
  }
  return out;
}

export async function eventSales(admin: SupabaseClient, ids: string[]): Promise<Map<string, EventSales>> {
  const out = new Map<string, EventSales>();
  if (!ids.length) return out;
  for (const id of ids) out.set(id, { sold: 0, capacity: 0, scanned: 0, gross: 0 });

  type TierRow = { event_id: string; capacity: number | null };
  type TicketRow = {
    event_id: string;
    orders: { status: string; source: string | null } | { status: string; source: string | null }[];
  };
  type LedgerRow = { event_id: string; gross_amount: number | null };
  type ScanRow = { event_id: string };

  const [tierRows, ticketRows, ledgerRows, scanRows] = await Promise.all([
    fetchAllRows<TierRow>((f, t) =>
      admin.from("ticket_tiers").select("event_id, capacity").in("event_id", ids).range(f, t),
    ),
    fetchAllRows<TicketRow>((f, t) =>
      admin.from("tickets").select("event_id, orders!inner(status, source)").in("event_id", ids).range(f, t),
    ),
    fetchAllRows<LedgerRow>((f, t) =>
      admin.from("settlement_ledger").select("event_id, gross_amount").in("event_id", ids).range(f, t),
    ),
    fetchAllRows<ScanRow>((f, t) =>
      admin.from("tickets").select("event_id").eq("is_scanned", true).in("event_id", ids).range(f, t),
    ),
  ]);

  for (const t of tierRows) {
    const r = out.get(t.event_id);
    if (r) r.capacity += Number(t.capacity) || 0;
  }
  for (const t of ticketRows) {
    const o = Array.isArray(t.orders) ? t.orders[0] : t.orders;
    if (o?.status !== "paid" || o?.source === "comp") continue;
    const r = out.get(t.event_id);
    if (r) r.sold += 1;
  }
  for (const l of ledgerRows) {
    const r = out.get(l.event_id);
    if (r) r.gross += Number(l.gross_amount) || 0;
  }
  for (const t of scanRows) {
    const r = out.get(t.event_id);
    if (r) r.scanned += 1;
  }
  for (const r of out.values()) r.gross = Math.round(r.gross * 100) / 100;

  // A seated event's real capacity is its seat map, not the tier numbers.
  // Only events that actually have a layout are looked up; the rest keep the
  // tier sum, so this costs nothing on a general-admission show.
  const seated = await Promise.all(
    ids.map(async (id) => [id, await getEventSeatInventory(admin, id)] as const),
  );
  for (const [id, inv] of seated) {
    if (!inv) continue;
    const r = out.get(id);
    if (r) r.capacity = inv.capacity;
  }
  return out;
}

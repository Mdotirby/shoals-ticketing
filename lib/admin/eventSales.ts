import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Sold, capacity and gross for a set of events — the one definition the
 * Command Center's next-14-nights, the calendar's utilization and the show
 * list all read, so they can't disagree about the same show.
 *
 *   sold      paid tickets, comps excluded
 *   capacity  sum of the event's ticket tiers
 *   gross     settlement_ledger gross_amount (net of refunds — PHASE1B rule 1)
 */
export type EventSales = { sold: number; capacity: number; gross: number };

export async function eventSales(admin: SupabaseClient, ids: string[]): Promise<Map<string, EventSales>> {
  const out = new Map<string, EventSales>();
  if (!ids.length) return out;
  for (const id of ids) out.set(id, { sold: 0, capacity: 0, gross: 0 });

  const [tiersRes, ticketsRes, ledgerRes] = await Promise.all([
    admin.from("ticket_tiers").select("event_id, capacity").in("event_id", ids),
    admin.from("tickets").select("event_id, orders!inner(status, source)").in("event_id", ids),
    admin.from("settlement_ledger").select("event_id, gross_amount").in("event_id", ids),
  ]);

  for (const t of (tiersRes.data ?? []) as { event_id: string; capacity: number | null }[]) {
    const r = out.get(t.event_id);
    if (r) r.capacity += Number(t.capacity) || 0;
  }
  type TicketRow = { event_id: string; orders: { status: string; source: string | null } | { status: string; source: string | null }[] };
  for (const t of (ticketsRes.data ?? []) as TicketRow[]) {
    const o = Array.isArray(t.orders) ? t.orders[0] : t.orders;
    if (o?.status !== "paid" || o?.source === "comp") continue;
    const r = out.get(t.event_id);
    if (r) r.sold += 1;
  }
  for (const l of (ledgerRes.data ?? []) as { event_id: string; gross_amount: number | null }[]) {
    const r = out.get(l.event_id);
    if (r) r.gross += Number(l.gross_amount) || 0;
  }
  for (const r of out.values()) r.gross = Math.round(r.gross * 100) / 100;
  return out;
}

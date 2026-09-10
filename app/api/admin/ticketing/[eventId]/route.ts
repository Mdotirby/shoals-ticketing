import { createAdminClient } from "@/lib/supabase-server";
import { requireStaff } from "@/lib/auth/can";
import { fetchAll } from "@/lib/supabase/fetchAll";
import { resolveCapacity } from "@/lib/capacity";
import { salesWindowFor } from "@/lib/salesWindow";
import { NextResponse } from "next/server";

/**
 * GET /api/admin/ticketing/[eventId] — one show's inventory and pace.
 *
 * Everything the mockup's Ticketing screen asks for THAT THIS SYSTEM ACTUALLY
 * KNOWS. What it asks for and does not get, and why, is in REBUILD-REPORT.md:
 * add-on products do not exist in this schema, and "pace vs. comparable"
 * needs a comparable show nobody has nominated — inventing either would put a
 * made-up number on a screen used to decide whether to release inventory.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const guard = await requireStaff();
  if (!guard.ok) return guard.response;

  const { eventId } = await params;
  const admin = createAdminClient();

  const { data: event } = await admin
    .from("events")
    .select("id, title, date, venue, on_sale_at, event_venue_id, is_free, event_type")
    .eq("id", eventId)
    .maybeSingle();

  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  const [tiers, tickets, orders, ledger, promos, presales, roomRow] = await Promise.all([
    fetchAll<{ id: string; tier_name: string; price: number; capacity: number | null; sort_order: number | null }>(
      admin.from("ticket_tiers").select("id, tier_name, price, capacity, sort_order").eq("event_id", eventId)
    ),
    // fetchAll, not .limit(): PostgREST caps at 1000 and ignores the limit.
    // A sold-out 1,400-cap room is one show away from that.
    fetchAll<{ id: string; ticket_type_id: string | null; order_id: string | null; created_at: string; is_scanned: boolean }>(
      admin.from("tickets").select("id, ticket_type_id, order_id, created_at, is_scanned").eq("event_id", eventId)
    ),
    fetchAll<{ id: string; total_amount: number | null; source: string | null; created_at: string }>(
      admin.from("orders").select("id, total_amount, source, created_at").eq("event_id", eventId).eq("status", "paid")
    ),
    fetchAll<{ gross_amount: number | null; ticket_revenue: number | null; ticketing_fee: number | null; facility_fee: number | null; type: string | null }>(
      admin.from("settlement_ledger").select("gross_amount, ticket_revenue, ticketing_fee, facility_fee, type").eq("event_id", eventId)
    ),
    fetchAll<{ id: string; code: string; discount_type: string; discount_value: number; max_uses: number | null; current_uses: number | null; active: boolean; is_presale: boolean | null }>(
      admin.from("promo_codes").select("id, code, discount_type, discount_value, max_uses, current_uses, active, is_presale").eq("event_id", eventId)
    ),
    admin.from("event_presales").select("type, enabled, code, starts_at, ends_at, capacity").eq("event_id", eventId),
    event.event_venue_id
      ? admin.from("event_venues").select("capacity").eq("id", event.event_venue_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const holdsRes = await admin
    .from("event_holds")
    .select("ticket_tier_id, quantity, hold_type, owner_label, released_at")
    .eq("event_id", eventId);
  const holds = (holdsRes.data ?? []) as {
    ticket_tier_id: string | null; quantity: number | null;
    hold_type: string | null; owner_label: string | null; released_at: string | null;
  }[];

  // A comped ticket occupies a seat but is not a sale — the two are counted
  // apart everywhere in this codebase and this is no exception.
  const compOrders = new Set(orders.filter((o) => (Number(o.total_amount) || 0) === 0).map((o) => o.id));
  const isComp = (t: { order_id: string | null }) => !!t.order_id && compOrders.has(t.order_id);

  const soldByTier: Record<string, number> = {};
  const compByTier: Record<string, number> = {};
  for (const t of tickets) {
    const key = t.ticket_type_id ?? "__none";
    soldByTier[key] = (soldByTier[key] || 0) + 1;
    if (isComp(t)) compByTier[key] = (compByTier[key] || 0) + 1;
  }

  const heldByTier: Record<string, number> = {};
  for (const h of holds) {
    if (h.released_at) continue;
    const key = h.ticket_tier_id ?? "__event";
    heldByTier[key] = (heldByTier[key] || 0) + (Number(h.quantity) || 0);
  }

  const sum = (k: "gross_amount" | "ticket_revenue" | "ticketing_fee" | "facility_fee") =>
    Math.round(ledger.reduce((a, r) => a + (Number(r[k]) || 0), 0) * 100) / 100;

  const paidTickets = tickets.filter((t) => !isComp(t)).length;
  const compedTickets = tickets.length - paidTickets;

  const cap = resolveCapacity({
    roomCapacity: (roomRow as { data: { capacity: number | null } | null }).data?.capacity ?? null,
    tiers,
    holds,
    sold: tickets.length,
  });

  // Daily units for the last 45 days, venue-local. The mockup draws this
  // against a comparable show; nobody has nominated one, so it is this show's
  // own curve — a fact — rather than a comparison against an invented peer.
  const dayKey = (iso: string) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago" }).format(new Date(iso));
  const perDay: Record<string, number> = {};
  for (const t of tickets) perDay[dayKey(t.created_at)] = (perDay[dayKey(t.created_at)] || 0) + 1;
  const curve = Object.entries(perDay).sort(([a], [b]) => a.localeCompare(b)).slice(-45)
    .map(([date, units]) => ({ date, units }));

  const window = salesWindowFor(event.date);

  return NextResponse.json({
    event: {
      id: event.id, title: event.title, date: event.date, venue: event.venue,
      onSaleAt: event.on_sale_at, isFree: event.is_free,
    },
    window: {
      state: window.state,
      storefrontOpen: window.storefrontOpen,
      boxOfficeOpen: window.boxOfficeOpen,
      storefrontClosesAt: window.storefrontClosesAt,
      salesCloseAt: window.salesCloseAt,
    },
    kpis: {
      sold: tickets.length,
      paidTickets,
      compedTickets,
      scannedIn: tickets.filter((t) => t.is_scanned).length,
      sellable: cap.sellable,
      room: cap.room,
      sellThrough: cap.sellThrough,
      gross: sum("gross_amount"),
      faceValue: sum("ticket_revenue"),
      feesRetained: Math.round((sum("ticketing_fee") + sum("facility_fee")) * 100) / 100,
      avgTicket: paidTickets > 0 ? Math.round((sum("ticket_revenue") / paidTickets) * 100) / 100 : 0,
      orders: orders.length,
    },
    inventory: tiers
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
      .map((t) => {
        const alloc = Number(t.capacity) || 0;
        const sold = soldByTier[t.id] || 0;
        const held = heldByTier[t.id] || 0;
        return {
          id: t.id,
          name: t.tier_name,
          price: Number(t.price) || 0,
          alloc,
          sold,
          comped: compByTier[t.id] || 0,
          held,
          sellThrough: alloc > 0 ? Math.round((sold / alloc) * 1000) / 10 : 0,
        };
      }),
    // Holds not attached to a tier — the event-level allocation.
    eventHolds: holds
      .filter((h) => !h.released_at && !h.ticket_tier_id)
      .map((h) => ({ quantity: Number(h.quantity) || 0, type: h.hold_type, label: h.owner_label })),
    curve,
    codes: promos.map((p) => ({
      code: p.code,
      kind: p.is_presale ? "Access" : "Promo",
      note: p.discount_type === "percentage"
        ? `${p.discount_value}% off`
        : `$${Number(p.discount_value).toFixed(2)} off`,
      used: Number(p.current_uses) || 0,
      max: p.max_uses ?? null,
      active: p.active,
    })),
    presales: (presales.data ?? []).filter((p) => p.enabled),
  });
}

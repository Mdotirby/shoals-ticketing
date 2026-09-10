import { requireStaff } from "@/lib/auth/can";
import { createAdminClient } from "@/lib/supabase-server";
import { HARD_TICKET_TYPES_ARRAY } from "@/lib/eventClass";
import { NextResponse } from "next/server";

/**
 * GET /api/admin/dashboard?venue_id=…&event_ids=id1,id2
 *
 * Two callers, deliberately one endpoint: the Command Center (app/admin) and
 * the event workspace (app/admin/events/[id], via `event_ids=<one id>`). They
 * used to be fed the same wrong number; keeping them on one route is what
 * stops them from disagreeing about the same show.
 *
 * ── REVENUE COMES FROM settlement_ledger (ADMIN_MERGE_PLAN.md § 4b) ─────────
 * It used to sum `orders.total_amount`, which had three problems:
 *
 *   • It did not net refunds. The Stripe webhook writes a negative ledger row
 *     for a refund but does not reduce the order, so a fully refunded show
 *     still reported its full gross here while /admin/settlements — reading
 *     the ledger — reported it correctly. The two screens contradicted each
 *     other and settlements was the one that was right.
 *   • It could not separate face value from fees and tax, so "revenue" was a
 *     number nobody could act on: it was not what the venue keeps, not what
 *     the artist settles against, and not what the platform earned.
 *   • It counted every paid order — RSVPs, comps, private rentals and
 *     non-ticketed calendar holds all inflated the same figure.
 *
 * Now `totalRevenue` is `sum(gross_amount)` across every ledger row for the
 * band, which nets refunds and disputes because those rows are negative, and
 * the decomposition travels with it.
 *
 * ── THE BAND FILTER APPLIES ONLY WHEN WE PICK THE EVENTS ───────────────────
 * `event_ids` is a caller naming exact events — the workspace asking about the
 * show on screen, or an artist's assigned shows. Applying the hard-ticket
 * filter to that list would make the workspace read $0 for a free or private
 * event, which is a regression, not a correction. So the filter governs the
 * band we derive; an explicit list is honoured verbatim.
 */
export async function GET(request: Request) {
  const guard = await requireStaff();
  if (!guard.ok) return guard.response;

  const admin = createAdminClient();
  const { searchParams } = new URL(request.url);
  const venueId = searchParams.get("venue_id");
  const eventIdsParam = searchParams.get("event_ids");
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const yesterdayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1).toISOString();
  const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7).toISOString();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const emptyResponse = {
    totalEvents: 0,
    ticketsSoldToday: 0,
    ticketsSoldYesterday: 0,
    ticketsSoldThisWeek: 0,
    totalTicketsSold: 0,
    totalRevenue: 0,
    revenueToday: 0,
    revenueThisWeek: 0,
    faceValue: 0,
    netToVenue: 0,
    ticketingFees: 0,
    facilityFees: 0,
    taxCollected: 0,
    cardFees: 0,
    refunds: 0,
    paidTickets: 0,
    compedTickets: 0,
    avgTicket: 0,
    sellThrough: 0,
    totalCapacity: 0,
    tierBreakdown: [],
    dailySales: [],
    eventNames: [],
    upcomingEvents: [],
    recentOrders: [],
    revenueByEvent: [],
  };

  try {
    // ── Resolve the event set ────────────────────────────────────────────────
    let eventIds: string[];

    if (eventIdsParam) {
      eventIds = eventIdsParam.split(",").filter(Boolean);
    } else {
      // The hard-ticket band: shows that sell through our ticketing and are
      // not free. `inHardTicketBand()` reads CLASS, not deal — a co-promoted
      // show is in, because it is our inventory and our box office; an
      // external promotion is out, because it never was. See lib/eventClass.
      let bandQ = admin
        .from("events")
        .select("id")
        .in("event_type", HARD_TICKET_TYPES_ARRAY)
        // NOT `.neq("is_free", true)`. In SQL `is_free <> true` is NULL when
        // is_free is NULL, so a null would be silently dropped from the band —
        // a real paid show vanishing from the dashboard because a column was
        // never set. Nothing is null today; this makes sure nothing has to be.
        .or("is_free.is.null,is_free.eq.false");
      if (venueId) bandQ = bandQ.eq("venue_id", venueId);
      const { data: bandEvents } = await bandQ;
      eventIds = (bandEvents ?? []).map((e) => e.id);
    }

    if (eventIds.length === 0) return NextResponse.json(emptyResponse);

    // ── One round of queries, all scoped to the same event set ──────────────
    // Previously the ticket counts were scoped ONLY when event_ids was passed,
    // so the unscoped Command Center counted every ticket in the database
    // while its revenue figure was venue-scoped. The two headline numbers on
    // the same card were measuring different populations.
    const [
      ticketsRes, ledgerRes, tierBreakdownRes, dailySalesRes,
      upcomingEventsRes, recentOrdersRes, paidOrdersRes,
    ] = await Promise.all([
      admin.from("tickets").select("id, event_id, created_at, order_id").in("event_id", eventIds).limit(50000),
      admin
        .from("settlement_ledger")
        .select("event_id, created_at, type, gross_amount, ticket_revenue, ticketing_fee, facility_fee, tax_collected, stripe_fee, stripe_fee_actual, net_to_venue")
        .in("event_id", eventIds)
        .limit(50000),
      admin.from("tickets").select("ticket_type_id, ticket_tiers!inner(tier_name, event_id)").in("event_id", eventIds).limit(50000),
      admin
        .from("tickets")
        .select("created_at, event_id, events!inner(title)")
        .in("event_id", eventIds)
        .gte("created_at", thirtyDaysAgo)
        .order("created_at", { ascending: true })
        .limit(50000),
      admin
        .from("events")
        .select("id, title, date, venue, image_url")
        .in("id", eventIds)
        .gte("date", now.toISOString().slice(0, 10))
        .order("date", { ascending: true })
        .limit(5),
      admin
        .from("orders")
        .select("id, customer_name, customer_email, total_amount, quantity, created_at, event_id, events!inner(title)")
        .in("event_id", eventIds)
        .order("created_at", { ascending: false })
        .limit(10),
      // Comps and free tickets issue a ticket but are not a sale. Counting
      // them in "tickets sold" inflates it and drags the average ticket price
      // toward zero, so paid and comped are tracked apart.
      admin.from("orders").select("id, total_amount").in("event_id", eventIds).eq("status", "paid").limit(50000),
    ]);

    // ── Revenue, from the ledger ─────────────────────────────────────────────
    // Every row, including the negative ones: a refund or a dispute is revenue
    // moving backwards, and summing across types is what nets it.
    let totalRevenue = 0, revenueToday = 0, revenueThisWeek = 0;
    let faceValue = 0, netToVenue = 0, ticketingFees = 0, facilityFees = 0;
    let taxCollected = 0, cardFees = 0, refunds = 0;
    const revenueByEventMap: Record<string, number> = {};
    const faceByEventMap: Record<string, number> = {};

    for (const r of ledgerRes.data ?? []) {
      const gross = Number(r.gross_amount) || 0;
      totalRevenue += gross;
      if (r.created_at >= todayStart) revenueToday += gross;
      if (r.created_at >= weekStart) revenueThisWeek += gross;
      faceValue += Number(r.ticket_revenue) || 0;
      netToVenue += Number(r.net_to_venue) || 0;
      ticketingFees += Number(r.ticketing_fee) || 0;
      facilityFees += Number(r.facility_fee) || 0;
      taxCollected += Number(r.tax_collected) || 0;
      // The real Stripe cost where we have it, the surcharge we billed where
      // we don't — never a re-derivation from the rate card.
      cardFees += Number(r.stripe_fee_actual ?? r.stripe_fee) || 0;
      if (r.type === "refund" || r.type === "dispute") refunds += Math.abs(gross);
      if (r.event_id) {
        revenueByEventMap[r.event_id] = (revenueByEventMap[r.event_id] || 0) + gross;
        faceByEventMap[r.event_id] = (faceByEventMap[r.event_id] || 0) + (Number(r.ticket_revenue) || 0);
      }
    }

    const round = (n: number) => Math.round(n * 100) / 100;

    // ── Tickets ──────────────────────────────────────────────────────────────
    const compOrderIds = new Set(
      (paidOrdersRes.data ?? []).filter((o) => (Number(o.total_amount) || 0) === 0).map((o) => o.id)
    );
    const tickets = ticketsRes.data ?? [];
    const isComp = (t: { order_id: string | null }) => !!t.order_id && compOrderIds.has(t.order_id);

    const totalTicketsSold = tickets.length;
    const compedTickets = tickets.filter(isComp).length;
    const paidTickets = totalTicketsSold - compedTickets;
    const ticketsSoldToday = tickets.filter((t) => t.created_at >= todayStart).length;
    const ticketsSoldYesterday = tickets.filter((t) => t.created_at >= yesterdayStart && t.created_at < todayStart).length;
    const ticketsSoldThisWeek = tickets.filter((t) => t.created_at >= weekStart).length;

    const soldByEvent: Record<string, number> = {};
    const paidByEvent: Record<string, number> = {};
    for (const t of tickets) {
      soldByEvent[t.event_id] = (soldByEvent[t.event_id] || 0) + 1;
      if (!isComp(t)) paidByEvent[t.event_id] = (paidByEvent[t.event_id] || 0) + 1;
    }

    // ── Upcoming events — two grouped queries, not two per event ─────────────
    // This was an N+1 inside an `await`: five events meant ten serial round
    // trips after the ten parallel ones above.
    const upcomingIds = (upcomingEventsRes.data ?? []).map((e) => e.id);
    const { data: capacityRows } = upcomingIds.length
      ? await admin.from("ticket_tiers").select("event_id, capacity").in("event_id", upcomingIds)
      : { data: [] };
    const capacityByEvent: Record<string, number> = {};
    for (const t of capacityRows ?? []) {
      capacityByEvent[t.event_id] = (capacityByEvent[t.event_id] || 0) + (Number(t.capacity) || 0);
    }

    const upcomingEvents = (upcomingEventsRes.data ?? []).map((ev) => {
      const sold = soldByEvent[ev.id] || 0;
      const paid = paidByEvent[ev.id] || 0;
      const totalCapacity = capacityByEvent[ev.id] || 0;
      return {
        id: ev.id,
        title: ev.title,
        date: ev.date,
        venue: ev.venue,
        image_url: ev.image_url,
        ticketsSold: sold,
        revenue: round(revenueByEventMap[ev.id] || 0),
        totalCapacity,
        // Sell-through counts every seat that is gone, comps included — a
        // comped seat is not available to sell. Average ticket divides FACE
        // VALUE by PAID tickets: gross would let fees and tax inflate it, and
        // including comps would drag it toward zero.
        sellThrough: totalCapacity > 0 ? Math.round((sold / totalCapacity) * 1000) / 10 : 0,
        avgTicket: paid > 0 ? round((faceByEventMap[ev.id] || 0) / paid) : 0,
      };
    });

    // ── Tier breakdown ───────────────────────────────────────────────────────
    const tierCounts: Record<string, number> = {};
    for (const t of tierBreakdownRes.data ?? []) {
      const tierInfo = t.ticket_tiers as unknown as { tier_name: string } | null;
      const name = tierInfo?.tier_name || "Unknown";
      tierCounts[name] = (tierCounts[name] || 0) + 1;
    }
    const tierBreakdown = Object.entries(tierCounts).map(([name, count]) => ({
      tier_name: name,
      tickets_sold: count,
    }));

    // ── Daily sales ──────────────────────────────────────────────────────────
    const dailyMap: Record<string, Record<string, number>> = {};
    for (const t of dailySalesRes.data ?? []) {
      const date = new Date(t.created_at).toISOString().slice(0, 10);
      const eventInfo = t.events as unknown as { title: string } | null;
      const eventName = eventInfo?.title || "Unknown";
      if (!dailyMap[date]) dailyMap[date] = {};
      dailyMap[date][eventName] = (dailyMap[date][eventName] || 0) + 1;
    }
    const eventNames = new Set<string>();
    for (const dateData of Object.values(dailyMap)) {
      for (const name of Object.keys(dateData)) eventNames.add(name);
    }
    const dailySales = Object.entries(dailyMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, events]) => ({ date, ...events }));

    const recentOrders = (recentOrdersRes.data ?? []).map((o: Record<string, unknown>) => ({
      id: o.id,
      customerName: o.customer_name || "Guest",
      email: o.customer_email,
      amount: o.total_amount ?? 0,
      quantity: o.quantity ?? 1,
      createdAt: o.created_at,
      eventTitle: ((o.events as { title: string }) || {}).title || "Unknown",
    }));

    const totalCapacity = Object.values(capacityByEvent).reduce((s, c) => s + c, 0);

    return NextResponse.json({
      totalEvents: eventIds.length,
      ticketsSoldToday,
      ticketsSoldYesterday,
      ticketsSoldThisWeek,
      totalTicketsSold,
      totalRevenue: round(totalRevenue),
      revenueToday: round(revenueToday),
      revenueThisWeek: round(revenueThisWeek),
      // The decomposition the old shape could not express.
      faceValue: round(faceValue),
      netToVenue: round(netToVenue),
      ticketingFees: round(ticketingFees),
      facilityFees: round(facilityFees),
      taxCollected: round(taxCollected),
      cardFees: round(cardFees),
      refunds: round(refunds),
      paidTickets,
      compedTickets,
      avgTicket: paidTickets > 0 ? round(faceValue / paidTickets) : 0,
      sellThrough: totalCapacity > 0 ? Math.round((Object.values(soldByEvent).reduce((s, n) => s + n, 0) / totalCapacity) * 1000) / 10 : 0,
      totalCapacity,
      tierBreakdown,
      dailySales,
      eventNames: Array.from(eventNames),
      upcomingEvents,
      recentOrders,
      revenueByEvent: upcomingEvents.filter((e) => e.revenue > 0).sort((a, b) => b.revenue - a.revenue),
    });
  } catch (err) {
    console.error("Dashboard query error:", err);
    return NextResponse.json({ error: "Failed to load dashboard data" }, { status: 500 });
  }
}

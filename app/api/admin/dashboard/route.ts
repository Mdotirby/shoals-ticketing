import { requireStaff } from "@/lib/auth/can";
import { createAdminClient } from "@/lib/supabase-server";
import { HARD_TICKET_TYPES_ARRAY } from "@/lib/eventClass";
import { fetchAll } from "@/lib/supabase/fetchAll";
import { resolveCapacity } from "@/lib/capacity";
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
type LedgerRow = {
  event_id: string | null;
  created_at: string;
  type: string | null;
  gross_amount: number | null;
  ticket_revenue: number | null;
  ticketing_fee: number | null;
  facility_fee: number | null;
  tax_collected: number | null;
  stripe_fee: number | null;
  stripe_fee_actual: number | null;
  net_to_venue: number | null;
};

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
  // Calendar month, not a rolling 30 days. The mockup's hero reads
  // "Hard ticket — this month" against "+612 vs. last month", and a venue
  // closes its books on a month, not on a window that moves every time
  // somebody loads the page.
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
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
    monthTicketsSold: 0,
    monthGross: 0,
    monthFaceValue: 0,
    monthNetToVenue: 0,
    monthAvgTicket: 0,
    lastMonthTicketsSold: 0,
    lastMonthGross: 0,
    eventsWithSales: 0,
    eventsTotal: 0,
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
    //
    // EVERY ROW-LEVEL READ HERE GOES THROUGH fetchAll(). PostgREST caps a
    // response at 1000 rows and ignores the `.limit()` you asked for, with no
    // error and no truncation flag. These queries were written `.limit(50000)`
    // and returned 1000: with 1,664 tickets in the band, Tyler Halverson —
    // 42 sold — reported 15, because 15 was that show's share of the page it
    // landed on. The settlement ledger is at 748 rows and would have started
    // silently under-reporting GROSS at 1,001. See lib/supabase/fetchAll.ts.
    const [
      tickets, ledgerRows, tierRows, dailyRows,
      upcomingEventsRes, recentOrdersRes, paidOrders,
    ] = await Promise.all([
      fetchAll<{ id: string; event_id: string; created_at: string; order_id: string | null }>(
        admin.from("tickets").select("id, event_id, created_at, order_id").in("event_id", eventIds)
      ),
      fetchAll<LedgerRow>(
        admin
          .from("settlement_ledger")
          .select("event_id, created_at, type, gross_amount, ticket_revenue, ticketing_fee, facility_fee, tax_collected, stripe_fee, stripe_fee_actual, net_to_venue")
          .in("event_id", eventIds)
      ),
      fetchAll<{ ticket_type_id: string | null; ticket_tiers: unknown }>(
        admin.from("tickets").select("ticket_type_id, ticket_tiers!inner(tier_name, event_id)").in("event_id", eventIds)
      ),
      fetchAll<{ created_at: string; event_id: string; events: unknown }>(
        admin
          .from("tickets")
          .select("created_at, event_id, events!inner(title)")
          .in("event_id", eventIds)
          .gte("created_at", thirtyDaysAgo)
          .order("created_at", { ascending: true })
      ),
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
      fetchAll<{ id: string; total_amount: number | null }>(
        admin.from("orders").select("id, total_amount").in("event_id", eventIds).eq("status", "paid")
      ),
    ]);

    // ── Revenue, from the ledger ─────────────────────────────────────────────
    // Every row, including the negative ones: a refund or a dispute is revenue
    // moving backwards, and summing across types is what nets it.
    let totalRevenue = 0, revenueToday = 0, revenueThisWeek = 0;
    let faceValue = 0, netToVenue = 0, ticketingFees = 0, facilityFees = 0;
    let taxCollected = 0, cardFees = 0, refunds = 0;
    let monthGross = 0, monthFaceValue = 0, monthNetToVenue = 0, lastMonthGross = 0;
    const revenueByEventMap: Record<string, number> = {};
    const faceByEventMap: Record<string, number> = {};

    for (const r of ledgerRows) {
      const gross = Number(r.gross_amount) || 0;
      totalRevenue += gross;
      if (r.created_at >= todayStart) revenueToday += gross;
      if (r.created_at >= weekStart) revenueThisWeek += gross;
      if (r.created_at >= monthStart) {
        monthGross += gross;
        monthFaceValue += Number(r.ticket_revenue) || 0;
        monthNetToVenue += Number(r.net_to_venue) || 0;
      } else if (r.created_at >= lastMonthStart) {
        lastMonthGross += gross;
      }
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
      paidOrders.filter((o) => (Number(o.total_amount) || 0) === 0).map((o) => o.id)
    );
    const isComp = (t: { order_id: string | null }) => !!t.order_id && compOrderIds.has(t.order_id);

    const totalTicketsSold = tickets.length;
    const compedTickets = tickets.filter(isComp).length;
    const paidTickets = totalTicketsSold - compedTickets;
    const ticketsSoldToday = tickets.filter((t) => t.created_at >= todayStart).length;
    const ticketsSoldYesterday = tickets.filter((t) => t.created_at >= yesterdayStart && t.created_at < todayStart).length;
    const ticketsSoldThisWeek = tickets.filter((t) => t.created_at >= weekStart).length;
    const monthTickets = tickets.filter((t) => t.created_at >= monthStart);
    const monthTicketsSold = monthTickets.length;
    const lastMonthTicketsSold = tickets.filter(
      (t) => t.created_at >= lastMonthStart && t.created_at < monthStart
    ).length;
    // Face value over PAID tickets only — comps would drag the average toward
    // zero, and gross would let fees and tax inflate it.
    const monthPaidTickets = monthTickets.filter((t) => !isComp(t)).length;

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
    // Room capacity and holds travel with the tiers now — see lib/capacity.ts
    // for why the room and the sellable cap are two numbers, not one.
    const [capacityRes, holdsRes, roomRes] = upcomingIds.length
      ? await Promise.all([
          admin.from("ticket_tiers").select("event_id, capacity").in("event_id", upcomingIds),
          admin.from("event_holds").select("event_id, quantity, released_at").in("event_id", upcomingIds),
          admin.from("events").select("id, event_venue_id, event_venues(capacity)").in("id", upcomingIds),
        ])
      : [{ data: [] }, { data: [] }, { data: [] }];

    const tiersByEvent: Record<string, { capacity: number }[]> = {};
    for (const t of capacityRes.data ?? []) {
      (tiersByEvent[t.event_id] ??= []).push({ capacity: Number(t.capacity) || 0 });
    }
    const holdsByEvent: Record<string, { quantity: number; released_at: string | null }[]> = {};
    // event_holds is empty in production and the table may not exist on every
    // environment; a failure here must not take the dashboard down.
    for (const h of holdsRes.data ?? []) {
      (holdsByEvent[h.event_id] ??= []).push({
        quantity: Number(h.quantity) || 0,
        released_at: h.released_at ?? null,
      });
    }
    const roomByEvent: Record<string, number | null> = {};
    // PostgREST types an embedded to-one join as an array, so it is read
    // defensively rather than asserted into the shape we expect.
    for (const row of roomRes.data ?? []) {
      const e = row as { id: string; event_venues?: unknown };
      const joined = Array.isArray(e.event_venues) ? e.event_venues[0] : e.event_venues;
      const cap = (joined as { capacity?: number | null } | null | undefined)?.capacity;
      roomByEvent[e.id] = typeof cap === "number" ? cap : null;
    }

    const upcomingEvents = (upcomingEventsRes.data ?? []).map((ev) => {
      const sold = soldByEvent[ev.id] || 0;
      const paid = paidByEvent[ev.id] || 0;
      const cap = resolveCapacity({
        roomCapacity: roomByEvent[ev.id],
        tiers: tiersByEvent[ev.id],
        holds: holdsByEvent[ev.id],
        sold,
      });
      return {
        id: ev.id,
        title: ev.title,
        date: ev.date,
        venue: ev.venue,
        image_url: ev.image_url,
        ticketsSold: sold,
        revenue: round(revenueByEventMap[ev.id] || 0),
        // `totalCapacity` keeps its name and its meaning — the SELLABLE cap —
        // because that is what it has always been here and what sell-through
        // divides by. `roomCapacity` is the new, separate number.
        totalCapacity: cap.sellable,
        roomCapacity: cap.room,
        heldSeats: cap.held,
        // Sell-through counts every seat that is gone, comps included — a
        // comped seat is not available to sell — against the SELLABLE cap.
        // Measuring it against the room counts seats nobody was allowed to
        // sell as unsold inventory. Average ticket divides FACE VALUE by PAID
        // tickets: gross would let fees and tax inflate it, and including
        // comps would drag it toward zero.
        sellThrough: cap.sellThrough,
        avgTicket: paid > 0 ? round((faceByEventMap[ev.id] || 0) / paid) : 0,
      };
    });

    // ── Tier breakdown ───────────────────────────────────────────────────────
    const tierCounts: Record<string, number> = {};
    for (const t of tierRows) {
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
    for (const t of dailyRows) {
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

    const totalCapacity = upcomingEvents.reduce((s, e) => s + e.totalCapacity, 0);

    // "9 of 14" in the hero: how many events in the band have actually sold
    // something, against every event on the books — the second number includes
    // the private rentals and free nights the band deliberately excludes, so
    // the ratio says what share of the calendar this card is describing.
    const eventsWithSales = Object.keys(revenueByEventMap).filter(
      (id) => (revenueByEventMap[id] || 0) > 0
    ).length;
    const { count: eventsTotalCount } = await admin
      .from("events")
      .select("id", { count: "exact", head: true });

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
      // The hero's window.
      monthTicketsSold,
      monthGross: round(monthGross),
      monthFaceValue: round(monthFaceValue),
      monthNetToVenue: round(monthNetToVenue),
      monthAvgTicket: monthPaidTickets > 0 ? round(monthFaceValue / monthPaidTickets) : 0,
      lastMonthTicketsSold,
      lastMonthGross: round(lastMonthGross),
      eventsWithSales,
      eventsTotal: eventsTotalCount ?? eventIds.length,
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

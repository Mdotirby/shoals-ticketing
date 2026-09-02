import { createAdminClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";

// GET /api/admin/dashboard?venue_id=...&event_ids=id1,id2 (optional filters)
export async function GET(request: Request) {
  const admin = createAdminClient();
  const { searchParams } = new URL(request.url);
  const venueId = searchParams.get("venue_id");
  const eventIdsParam = searchParams.get("event_ids"); // comma-separated event IDs (for artist filtering)
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
    tierBreakdown: [],
    dailySales: [],
    eventNames: [],
    upcomingEvents: [],
    recentOrders: [],
    revenueByEvent: [],
  };

  try {
    // If explicit event IDs are provided (artist mode), use those directly
    let eventIds: string[] | null = null;
    if (eventIdsParam) {
      eventIds = eventIdsParam.split(",").filter(Boolean);
      if (eventIds.length === 0) {
        return NextResponse.json(emptyResponse);
      }
    } else if (venueId) {
      // If venue-scoped, get the event IDs for this venue first
      const { data: venueEvents } = await admin
        .from("events")
        .select("id")
        .eq("venue_id", venueId);
      eventIds = venueEvents?.map((e) => e.id) || [];
      if (eventIds.length === 0) {
        return NextResponse.json(emptyResponse);
      }
    }

    // Build queries with optional venue scoping
    let eventsQ = admin.from("events").select("id", { count: "exact", head: true });
    if (eventIds) eventsQ = eventsQ.in("id", eventIds);
    else if (venueId) eventsQ = eventsQ.eq("venue_id", venueId);

    let ticketsTodayQ = admin.from("tickets").select("id", { count: "exact", head: true }).gte("created_at", todayStart);
    if (eventIds) ticketsTodayQ = ticketsTodayQ.in("event_id", eventIds);

    let ticketsYesterdayQ = admin.from("tickets").select("id", { count: "exact", head: true }).gte("created_at", yesterdayStart).lt("created_at", todayStart);
    if (eventIds) ticketsYesterdayQ = ticketsYesterdayQ.in("event_id", eventIds);

    let ticketsWeekQ = admin.from("tickets").select("id", { count: "exact", head: true }).gte("created_at", weekStart);
    if (eventIds) ticketsWeekQ = ticketsWeekQ.in("event_id", eventIds);

    let totalTicketsQ = admin.from("tickets").select("id", { count: "exact", head: true });
    if (eventIds) totalTicketsQ = totalTicketsQ.in("event_id", eventIds);

    let revenueQ = admin.from("orders").select("total_amount, created_at, event_id").eq("status", "paid");
    if (eventIds) revenueQ = revenueQ.in("event_id", eventIds);

    let tierQ = admin.from("tickets").select("ticket_type_id, ticket_tiers!inner(tier_name, event_id)").limit(10000);
    if (eventIds) tierQ = tierQ.in("event_id", eventIds);

    let dailyQ = admin.from("tickets")
      .select("created_at, event_id, events!inner(title)")
      .gte("created_at", thirtyDaysAgo)
      .order("created_at", { ascending: true })
      .limit(10000);
    if (eventIds) dailyQ = dailyQ.in("event_id", eventIds);

    // Upcoming events with ticket counts
    let upcomingEventsQ = admin.from("events")
      .select("id, title, date, venue, image_url")
      .gte("date", now.toISOString().slice(0, 10))
      .order("date", { ascending: true })
      .limit(5);
    if (eventIds) upcomingEventsQ = upcomingEventsQ.in("id", eventIds);
    else if (venueId) upcomingEventsQ = upcomingEventsQ.eq("venue_id", venueId);

    // Recent orders
    let recentOrdersQ = admin.from("orders")
      .select("id, customer_name, customer_email, total_amount, quantity, created_at, event_id, events!inner(title)")
      .order("created_at", { ascending: false })
      .limit(10);
    if (eventIds) recentOrdersQ = recentOrdersQ.in("event_id", eventIds);

    const [
      eventsRes, ticketsTodayRes, ticketsYesterdayRes, ticketsWeekRes,
      totalTicketsRes, totalRevenueRes, tierBreakdownRes, dailySalesRes,
      upcomingEventsRes, recentOrdersRes,
    ] = await Promise.all([
      eventsQ, ticketsTodayQ, ticketsYesterdayQ, ticketsWeekQ,
      totalTicketsQ, revenueQ, tierQ, dailyQ,
      upcomingEventsQ, recentOrdersQ,
    ]);

    // Calculate revenue totals
    let totalRevenue = 0;
    let revenueToday = 0;
    let revenueThisWeek = 0;
    const revenueByEventMap: Record<string, number> = {};

    if (totalRevenueRes.data) {
      for (const o of totalRevenueRes.data) {
        const amt = (o as { total_amount: number | null; created_at: string; event_id: string }).total_amount ?? 0;
        const createdAt = (o as { created_at: string }).created_at;
        const eid = (o as { event_id: string }).event_id;
        totalRevenue += amt;
        if (createdAt >= todayStart) revenueToday += amt;
        if (createdAt >= weekStart) revenueThisWeek += amt;
        revenueByEventMap[eid] = (revenueByEventMap[eid] || 0) + amt;
      }
    }

    // Build tier breakdown
    const tierCounts: Record<string, number> = {};
    if (tierBreakdownRes.data) {
      for (const t of tierBreakdownRes.data) {
        const tierInfo = t.ticket_tiers as unknown as { tier_name: string } | null;
        const name = tierInfo?.tier_name || "Unknown";
        tierCounts[name] = (tierCounts[name] || 0) + 1;
      }
    }
    const tierBreakdown = Object.entries(tierCounts).map(([name, count]) => ({
      tier_name: name,
      tickets_sold: count,
    }));

    // Build daily sales
    const dailyMap: Record<string, Record<string, number>> = {};
    if (dailySalesRes.data) {
      for (const t of dailySalesRes.data) {
        const date = new Date(t.created_at).toISOString().slice(0, 10);
        const eventInfo = t.events as unknown as { title: string } | null;
        const eventName = eventInfo?.title || "Unknown";
        if (!dailyMap[date]) dailyMap[date] = {};
        dailyMap[date][eventName] = (dailyMap[date][eventName] || 0) + 1;
      }
    }

    const eventNames = new Set<string>();
    for (const dateData of Object.values(dailyMap)) {
      for (const name of Object.keys(dateData)) eventNames.add(name);
    }

    const dailySales = Object.entries(dailyMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, events]) => ({ date, ...events }));

    // Upcoming events with ticket sold counts + total capacity (for sales-progress bars)
    const upcomingEvents = [];
    if (upcomingEventsRes.data) {
      for (const ev of upcomingEventsRes.data) {
        const [{ count: ticketCount }, { data: tiers }] = await Promise.all([
          admin.from("tickets").select("id", { count: "exact", head: true }).eq("event_id", ev.id),
          admin.from("ticket_tiers").select("capacity").eq("event_id", ev.id),
        ]);
        const totalCapacity = (tiers || []).reduce((sum, t) => sum + (t.capacity || 0), 0);

        upcomingEvents.push({
          id: ev.id,
          title: ev.title,
          date: ev.date,
          venue: ev.venue,
          image_url: ev.image_url,
          ticketsSold: ticketCount ?? 0,
          revenue: revenueByEventMap[ev.id] || 0,
          totalCapacity,
        });
      }
    }

    // Recent orders formatted
    const recentOrders = (recentOrdersRes.data || []).map((o: Record<string, unknown>) => ({
      id: o.id,
      customerName: o.customer_name || "Guest",
      email: o.customer_email,
      amount: o.total_amount ?? 0,
      quantity: o.quantity ?? 1,
      createdAt: o.created_at,
      eventTitle: ((o.events as { title: string }) || {}).title || "Unknown",
    }));

    // Revenue by event
    const revenueByEvent = upcomingEvents
      .filter((e) => e.revenue > 0)
      .sort((a, b) => b.revenue - a.revenue);

    return NextResponse.json({
      totalEvents: eventsRes.count ?? 0,
      ticketsSoldToday: ticketsTodayRes.count ?? 0,
      ticketsSoldYesterday: ticketsYesterdayRes.count ?? 0,
      ticketsSoldThisWeek: ticketsWeekRes.count ?? 0,
      totalTicketsSold: totalTicketsRes.count ?? 0,
      totalRevenue,
      revenueToday,
      revenueThisWeek,
      tierBreakdown,
      dailySales,
      eventNames: Array.from(eventNames),
      upcomingEvents,
      recentOrders,
      revenueByEvent,
    });
  } catch (err) {
    console.error("Dashboard query error:", err);
    return NextResponse.json({ error: "Failed to load dashboard data" }, { status: 500 });
  }
}

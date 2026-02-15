import { createAdminClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";

// GET /api/admin/dashboard?venue_id=... (optional venue filter)
export async function GET(request: Request) {
  const admin = createAdminClient();
  const { searchParams } = new URL(request.url);
  const venueId = searchParams.get("venue_id");
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();

  try {
    // If venue-scoped, get the event IDs for this venue first
    let eventIds: string[] | null = null;
    if (venueId) {
      const { data: venueEvents } = await admin
        .from("events")
        .select("id")
        .eq("venue_id", venueId);
      eventIds = venueEvents?.map((e) => e.id) || [];
      if (eventIds.length === 0) {
        // No events for this venue — return empty dashboard
        return NextResponse.json({
          totalEvents: 0,
          ticketsSoldToday: 0,
          totalTicketsSold: 0,
          totalRevenue: 0,
          tierBreakdown: [],
          dailySales: [],
          eventNames: [],
        });
      }
    }

    // Build queries with optional venue scoping
    let eventsQ = admin.from("events").select("id", { count: "exact", head: true });
    if (venueId) eventsQ = eventsQ.eq("venue_id", venueId);

    let ticketsTodayQ = admin.from("tickets").select("id", { count: "exact", head: true }).gte("created_at", todayStart);
    if (eventIds) ticketsTodayQ = ticketsTodayQ.in("event_id", eventIds);

    let totalTicketsQ = admin.from("tickets").select("id", { count: "exact", head: true });
    if (eventIds) totalTicketsQ = totalTicketsQ.in("event_id", eventIds);

    let revenueQ = admin.from("orders").select("total_amount");
    if (eventIds) revenueQ = revenueQ.in("event_id", eventIds);

    let tierQ = admin.from("tickets").select("ticket_type_id, ticket_tiers!inner(tier_name, event_id)").limit(10000);
    if (eventIds) tierQ = tierQ.in("event_id", eventIds);

    let dailyQ = admin.from("tickets")
      .select("created_at, event_id, events!inner(title)")
      .gte("created_at", new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString())
      .order("created_at", { ascending: true })
      .limit(10000);
    if (eventIds) dailyQ = dailyQ.in("event_id", eventIds);

    const [eventsRes, ticketsTodayRes, totalTicketsRes, totalRevenueRes, tierBreakdownRes, dailySalesRes] =
      await Promise.all([eventsQ, ticketsTodayQ, totalTicketsQ, revenueQ, tierQ, dailyQ]);

    // Calculate total revenue
    let totalRevenue = 0;
    if (totalRevenueRes.data) {
      totalRevenue = totalRevenueRes.data.reduce(
        (sum: number, o: { total_amount: number | null }) => sum + (o.total_amount ?? 0), 0
      );
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

    return NextResponse.json({
      totalEvents: eventsRes.count ?? 0,
      ticketsSoldToday: ticketsTodayRes.count ?? 0,
      totalTicketsSold: totalTicketsRes.count ?? 0,
      totalRevenue,
      tierBreakdown,
      dailySales,
      eventNames: Array.from(eventNames),
    });
  } catch (err) {
    console.error("Dashboard query error:", err);
    return NextResponse.json({ error: "Failed to load dashboard data" }, { status: 500 });
  }
}

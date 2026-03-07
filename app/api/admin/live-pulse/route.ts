import { createAdminClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";

/**
 * GET /api/admin/live-pulse?event_id=...
 *
 * Real-time event command center data:
 * - Ticket sales: total sold, capacity, revenue
 * - Scan stats: scanned in, scan velocity (per minute over last 30 min)
 * - Page views: total views, unique sessions
 * - Recent activity: last 20 ticket scans and purchases
 * - Tier breakdown: sold per tier with capacity
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const eventId = searchParams.get("event_id");

  if (!eventId) {
    return NextResponse.json({ error: "event_id required" }, { status: 400 });
  }

  const admin = createAdminClient();

  try {
    const now = new Date();
    const thirtyMinAgo = new Date(now.getTime() - 30 * 60 * 1000).toISOString();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();

    // Parallel queries for maximum speed
    const [
      eventRes,
      ticketsTotalRes,
      ticketsScannedRes,
      ticketsTodayRes,
      ordersRes,
      ordersTodayRes,
      tiersRes,
      viewsTotalRes,
      viewsUniqueRes,
      recentScansRes,
      recentOrdersRes,
      scanVelocityRes,
    ] = await Promise.all([
      // Event info
      admin.from("events").select("id, title, venue, date, image_url, venue_id").eq("id", eventId).single(),

      // Total tickets sold
      admin.from("tickets").select("id", { count: "exact", head: true }).eq("event_id", eventId),

      // Total tickets scanned
      admin.from("tickets").select("id", { count: "exact", head: true }).eq("event_id", eventId).eq("is_scanned", true),

      // Tickets sold today
      admin.from("tickets").select("id", { count: "exact", head: true }).eq("event_id", eventId).gte("created_at", todayStart),

      // All paid orders — for revenue
      admin.from("orders").select("total_amount, quantity, created_at").eq("event_id", eventId).eq("status", "paid"),

      // Orders today — for today's revenue
      admin.from("orders").select("total_amount, quantity").eq("event_id", eventId).eq("status", "paid").gte("created_at", todayStart),

      // Ticket tiers with capacity
      admin.from("ticket_tiers").select("id, tier_name, price, capacity").eq("event_id", eventId).order("sort_order", { ascending: true }),

      // Total page views
      admin.from("event_views").select("id", { count: "exact", head: true }).eq("event_id", eventId),

      // Unique sessions
      admin.from("event_views").select("session_id").eq("event_id", eventId).not("session_id", "is", null),

      // Recent scans (last 20) — tickets that were scanned
      admin.from("tickets")
        .select("id, customer_name, scanned_at, ticket_type_id")
        .eq("event_id", eventId)
        .eq("is_scanned", true)
        .not("scanned_at", "is", null)
        .order("scanned_at", { ascending: false })
        .limit(20),

      // Recent orders (last 20)
      admin.from("orders")
        .select("id, customer_name, customer_email, total_amount, quantity, created_at")
        .eq("event_id", eventId)
        .eq("status", "paid")
        .order("created_at", { ascending: false })
        .limit(20),

      // Scan velocity: scans in last 30 minutes
      admin.from("tickets")
        .select("scanned_at")
        .eq("event_id", eventId)
        .eq("is_scanned", true)
        .gte("scanned_at", thirtyMinAgo),
    ]);

    const event = eventRes.data;
    if (!event) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    // Calculate metrics
    const totalTicketsSold = ticketsTotalRes.count ?? 0;
    const totalScanned = ticketsScannedRes.count ?? 0;
    const ticketsSoldToday = ticketsTodayRes.count ?? 0;

    const orders = ordersRes.data || [];
    const totalRevenue = orders.reduce((sum: number, o: { total_amount: number }) => sum + (o.total_amount || 0), 0);

    const todayOrders = ordersTodayRes.data || [];
    const revenueToday = todayOrders.reduce((sum: number, o: { total_amount: number }) => sum + (o.total_amount || 0), 0);

    const tiers = tiersRes.data || [];
    const totalCapacity = tiers.reduce((sum: number, t: { capacity: number }) => sum + (t.capacity || 0), 0);

    // Tier breakdown with sold counts
    const tierTicketCounts = await Promise.all(
      tiers.map(async (tier: { id: string; tier_name: string; price: number; capacity: number }) => {
        const { count } = await admin
          .from("tickets")
          .select("id", { count: "exact", head: true })
          .eq("event_id", eventId)
          .eq("ticket_type_id", tier.id);
        return {
          id: tier.id,
          name: tier.tier_name,
          price: tier.price,
          capacity: tier.capacity,
          sold: count ?? 0,
          percentSold: tier.capacity > 0 ? Math.round(((count ?? 0) / tier.capacity) * 100) : 0,
        };
      })
    );

    // Page views
    const totalViews = viewsTotalRes.count ?? 0;
    const uniqueSessions = new Set((viewsUniqueRes.data || []).map((v: { session_id: string }) => v.session_id));
    const uniqueViews = uniqueSessions.size;

    // Conversion rate
    const conversionRate = uniqueViews > 0 ? Math.round((totalTicketsSold / uniqueViews) * 10000) / 100 : 0;

    // Scan velocity: scans per minute over last 30 min
    const recentScanCount = (scanVelocityRes.data || []).length;
    const scanVelocity = Math.round((recentScanCount / 30) * 100) / 100; // scans per minute

    // Scan velocity timeline: group scans by 5-minute buckets
    const scanTimeline: { time: string; scans: number }[] = [];
    if (scanVelocityRes.data && scanVelocityRes.data.length > 0) {
      for (let i = 6; i >= 0; i--) {
        const bucketStart = new Date(now.getTime() - (i + 1) * 5 * 60 * 1000);
        const bucketEnd = new Date(now.getTime() - i * 5 * 60 * 1000);
        const count = (scanVelocityRes.data as { scanned_at: string }[]).filter((s) => {
          const t = new Date(s.scanned_at).getTime();
          return t >= bucketStart.getTime() && t < bucketEnd.getTime();
        }).length;
        scanTimeline.push({
          time: bucketEnd.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true }),
          scans: count,
        });
      }
    }

    // Revenue timeline: orders in the last hour grouped by 10-minute buckets
    const revenueTimeline: { time: string; revenue: number; orders: number }[] = [];
    const lastHourOrders = orders.filter((o: { created_at: string }) => new Date(o.created_at).getTime() > new Date(oneHourAgo).getTime());
    for (let i = 6; i >= 0; i--) {
      const bucketStart = new Date(now.getTime() - (i + 1) * 10 * 60 * 1000);
      const bucketEnd = new Date(now.getTime() - i * 10 * 60 * 1000);
      const bucketOrders = lastHourOrders.filter((o: { created_at: string }) => {
        const t = new Date(o.created_at).getTime();
        return t >= bucketStart.getTime() && t < bucketEnd.getTime();
      });
      revenueTimeline.push({
        time: bucketEnd.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true }),
        revenue: bucketOrders.reduce((s: number, o: { total_amount: number }) => s + (o.total_amount || 0), 0),
        orders: bucketOrders.length,
      });
    }

    return NextResponse.json({
      event: {
        id: event.id,
        title: event.title,
        venue: event.venue,
        date: event.date,
        image_url: event.image_url,
      },
      capacity: {
        total: totalCapacity || 500,
        sold: totalTicketsSold,
        scanned: totalScanned,
        remaining: Math.max(0, (totalCapacity || 500) - totalTicketsSold),
        percentSold: totalCapacity > 0 ? Math.round((totalTicketsSold / totalCapacity) * 100) : 0,
        percentScanned: totalTicketsSold > 0 ? Math.round((totalScanned / totalTicketsSold) * 100) : 0,
      },
      revenue: {
        total: Math.round(totalRevenue * 100) / 100,
        today: Math.round(revenueToday * 100) / 100,
        timeline: revenueTimeline,
      },
      sales: {
        today: ticketsSoldToday,
        total: totalTicketsSold,
      },
      scanning: {
        total: totalScanned,
        velocity: scanVelocity,
        timeline: scanTimeline,
      },
      views: {
        total: totalViews,
        unique: uniqueViews,
        conversionRate,
      },
      tiers: tierTicketCounts,
      recentScans: (recentScansRes.data || []).map((s: { id: string; customer_name: string; scanned_at: string; ticket_type_id: string }) => ({
        id: s.id,
        customerName: s.customer_name,
        scannedAt: s.scanned_at,
        tierName: tiers.find((t: { id: string }) => t.id === s.ticket_type_id)?.tier_name || "GA",
      })),
      recentOrders: (recentOrdersRes.data || []).map((o: { id: string; customer_name: string; customer_email: string; total_amount: number; quantity: number; created_at: string }) => ({
        id: o.id,
        customerName: o.customer_name,
        email: o.customer_email,
        amount: o.total_amount,
        quantity: o.quantity,
        createdAt: o.created_at,
      })),
      lastUpdated: now.toISOString(),
    });
  } catch (err) {
    console.error("[live-pulse] Error:", err);
    return NextResponse.json({ error: "Failed to load live pulse data" }, { status: 500 });
  }
}

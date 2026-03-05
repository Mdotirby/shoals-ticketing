import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-server";

export async function GET() {
  const supabase = createAdminClient();

  // Get all events
  const { data: events, error } = await supabase
    .from("events")
    .select("id,title,venue,date,image_url,status,venue_id,event_type")
    .order("date", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // For each event, gather performance stats
  const eventPerformance = await Promise.all(
    (events || []).map(async (event: Record<string, unknown>) => {
      // Get ticket sales (paid orders)
      const { data: orders } = await supabase
        .from("orders")
        .select("quantity, total")
        .eq("event_id", event.id as string)
        .in("status", ["paid", "completed"]);

      const totalSold = (orders || []).reduce(
        (sum: number, o: Record<string, unknown>) => sum + ((o.quantity as number) || 1),
        0
      );
      const totalRevenue = (orders || []).reduce(
        (sum: number, o: Record<string, unknown>) => sum + ((o.total as number) || 0),
        0
      );

      // Get ticket types for capacity
      const { data: ticketTypes } = await supabase
        .from("ticket_types")
        .select("quantity")
        .eq("event_id", event.id as string);

      // Also try ticket_tiers if ticket_types returns nothing
      let totalCapacity = (ticketTypes || []).reduce(
        (sum: number, t: Record<string, unknown>) => sum + ((t.quantity as number) || 0),
        0
      );

      if (totalCapacity === 0) {
        const { data: ticketTiers } = await supabase
          .from("ticket_tiers")
          .select("capacity")
          .eq("event_id", event.id as string);

        totalCapacity = (ticketTiers || []).reduce(
          (sum: number, t: Record<string, unknown>) => sum + ((t.capacity as number) || 0),
          0
        );
      }

      // Get drop count (scanned tickets)
      let dropCount = 0;
      try {
        const { count } = await supabase
          .from("tickets")
          .select("id", { count: "exact", head: true })
          .eq("event_id", event.id as string)
          .eq("is_scanned", true);
        dropCount = count || 0;
      } catch {
        // tickets table may not exist — graceful fallback
      }

      // Get page views count
      let pageViews = 0;
      try {
        const { count } = await supabase
          .from("event_views")
          .select("id", { count: "exact", head: true })
          .eq("event_id", event.id as string);
        pageViews = count || 0;
      } catch {
        // event_views table may not exist — graceful fallback
      }

      const percentSold =
        totalCapacity > 0
          ? Math.round((totalSold / totalCapacity) * 100)
          : 0;

      const eventDate = event.date as string;
      const isPast = eventDate ? new Date(eventDate) < new Date() : false;

      return {
        id: event.id,
        title: event.title,
        date: eventDate,
        venue: event.venue,
        image_url: event.image_url,
        status: (event.status as string) || (isPast ? "past" : "upcoming"),
        event_type: event.event_type,
        total_sold: totalSold,
        total_capacity: totalCapacity,
        total_available: Math.max(0, totalCapacity - totalSold),
        percent_sold: percentSold,
        drop_count: dropCount,
        page_views: pageViews,
        total_revenue: totalRevenue,
        is_past: isPast,
      };
    })
  );

  // Sort: upcoming first (by date ASC), then past (by date DESC)
  const upcoming = eventPerformance
    .filter((e) => !e.is_past)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const past = eventPerformance
    .filter((e) => e.is_past)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return NextResponse.json({ events: [...upcoming, ...past] });
}

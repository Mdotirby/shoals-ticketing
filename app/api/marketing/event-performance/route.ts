import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-server";
import { getEventSeatInventory } from "@/lib/checkout-helpers";

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
        .select("quantity, total_amount")
        .eq("event_id", event.id as string)
        .in("status", ["paid", "completed"]);

      const totalSold = (orders || []).reduce(
        (sum: number, o: Record<string, unknown>) => sum + (Number(o.quantity) || 1),
        0
      );
      const totalRevenue = (orders || []).reduce(
        (sum: number, o: Record<string, unknown>) => sum + (Number(o.total_amount) || 0),
        0
      );

      // Get ticket types for capacity
      const { data: ticketTypes } = await supabase
        .from("ticket_types")
        .select("quantity")
        .eq("event_id", event.id as string);

      // Also try ticket_tiers if ticket_types returns nothing
      let totalCapacity = (ticketTypes || []).reduce(
        (sum: number, t: Record<string, unknown>) => sum + (Number(t.quantity) || 0),
        0
      );

      if (totalCapacity === 0) {
        const { data: ticketTiers } = await supabase
          .from("ticket_tiers")
          .select("capacity")
          .eq("event_id", event.id as string);

        totalCapacity = (ticketTiers || []).reduce(
          (sum: number, t: Record<string, unknown>) => sum + (Number(t.capacity) || 0),
          0
        );
      }

      // Reserved-seating events: trust the seats table over ticket_tiers.capacity
      // (a static number that drifts, e.g. "10 tables" instead of the 80 real
      // seats those tables hold) and over orders.quantity (which undercounts a
      // refunded-but-still-reserved order and drifts on mixed-section orders).
      let seatSold: number | null = null;
      const seatInventory = await getEventSeatInventory(supabase, event.id as string);
      if (seatInventory) {
        totalCapacity = seatInventory.capacity;
        seatSold = seatInventory.sold;
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

      const effectiveSold = seatSold ?? totalSold;
      const percentSold =
        totalCapacity > 0
          ? Math.round((effectiveSold / totalCapacity) * 100)
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
        total_sold: effectiveSold,
        total_capacity: totalCapacity,
        total_available: Math.max(0, totalCapacity - effectiveSold),
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

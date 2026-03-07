import { createAdminClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/market-radar/trends?capacity_min=350&capacity_max=800
 *
 * Returns market trend analytics:
 * - Day-of-week event distribution
 * - Announce lead time analysis
 * - Monthly event volume
 * - Pricing analysis by venue capacity tier
 * - Top artists by tracker count
 * - Venue activity rankings
 */
export async function GET(request: Request) {
  const admin = createAdminClient();
  const { searchParams } = new URL(request.url);
  const capacityMin = Number(searchParams.get("capacity_min") || "350");
  const capacityMax = Number(searchParams.get("capacity_max") || "800");

  try {
    // Fetch all market radar events
    let query = admin
      .from("market_radar_events")
      .select("*")
      .order("event_date", { ascending: true });

    if (capacityMin > 0) query = query.gte("venue_capacity", capacityMin);
    if (capacityMax > 0) query = query.lte("venue_capacity", capacityMax);

    const { data: events, error } = await query;

    if (error) {
      console.error("[trends] Query error:", error);
      return NextResponse.json({ error: "Failed to fetch events" }, { status: 500 });
    }

    if (!events || events.length === 0) {
      return NextResponse.json({
        total_events: 0,
        day_of_week: [],
        monthly_volume: [],
        lead_time: [],
        pricing: { average: 0, median: 0, by_capacity: [] },
        top_artists: [],
        top_venues: [],
        velocity_insights: [],
      });
    }

    // ── Day of Week Distribution ──
    const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const dayCounts = new Array(7).fill(0);
    const dayTrackers = new Array(7).fill(0);

    for (const evt of events) {
      if (evt.event_date) {
        const d = new Date(evt.event_date + "T12:00:00");
        const day = d.getDay();
        dayCounts[day]++;
        dayTrackers[day] += evt.tracker_count || 0;
      }
    }

    const dayOfWeek = dayNames.map((name, i) => ({
      day: name,
      shortDay: name.slice(0, 3),
      count: dayCounts[i],
      avgDemand: dayCounts[i] > 0 ? Math.round(dayTrackers[i] / dayCounts[i]) : 0,
    }));

    // ── Monthly Volume ──
    const monthMap = new Map<string, { count: number; trackers: number }>();
    for (const evt of events) {
      if (evt.event_date) {
        const month = evt.event_date.slice(0, 7); // YYYY-MM
        const existing = monthMap.get(month) || { count: 0, trackers: 0 };
        existing.count++;
        existing.trackers += evt.tracker_count || 0;
        monthMap.set(month, existing);
      }
    }

    const monthlyVolume = Array.from(monthMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, data]) => ({
        month,
        label: new Date(month + "-15").toLocaleDateString("en-US", { month: "short", year: "2-digit" }),
        count: data.count,
        avgDemand: data.count > 0 ? Math.round(data.trackers / data.count) : 0,
      }));

    // ── Announce Lead Time ──
    const leadTimeBuckets = [
      { label: "< 30 days", min: 0, max: 30, count: 0, avgTracker: 0, totalTracker: 0 },
      { label: "30–60 days", min: 30, max: 60, count: 0, avgTracker: 0, totalTracker: 0 },
      { label: "60–90 days", min: 60, max: 90, count: 0, avgTracker: 0, totalTracker: 0 },
      { label: "90–120 days", min: 90, max: 120, count: 0, avgTracker: 0, totalTracker: 0 },
      { label: "120+ days", min: 120, max: 9999, count: 0, avgTracker: 0, totalTracker: 0 },
    ];

    for (const evt of events) {
      if (evt.event_date && evt.created_at) {
        const eventDate = new Date(evt.event_date + "T12:00:00");
        const createdDate = new Date(evt.created_at);
        const leadDays = Math.round((eventDate.getTime() - createdDate.getTime()) / (1000 * 60 * 60 * 24));

        for (const bucket of leadTimeBuckets) {
          if (leadDays >= bucket.min && leadDays < bucket.max) {
            bucket.count++;
            bucket.totalTracker += evt.tracker_count || 0;
            break;
          }
        }
      }
    }

    for (const bucket of leadTimeBuckets) {
      bucket.avgTracker = bucket.count > 0 ? Math.round(bucket.totalTracker / bucket.count) : 0;
    }

    // ── Pricing Analysis ──
    const prices = events
      .filter((e) => e.ticket_price_low != null && e.ticket_price_low > 0)
      .map((e) => e.ticket_price_low as number)
      .sort((a, b) => a - b);

    const avgPrice = prices.length > 0 ? Math.round(prices.reduce((s, p) => s + p, 0) / prices.length) : 0;
    const medianPrice = prices.length > 0 ? prices[Math.floor(prices.length / 2)] : 0;

    // Price by capacity tiers
    const capTiers = [
      { label: "350-500 cap", min: 350, max: 500, prices: [] as number[] },
      { label: "500-650 cap", min: 500, max: 650, prices: [] as number[] },
      { label: "650-800 cap", min: 650, max: 800, prices: [] as number[] },
    ];

    for (const evt of events) {
      if (evt.ticket_price_low && evt.venue_capacity) {
        for (const tier of capTiers) {
          if (evt.venue_capacity >= tier.min && evt.venue_capacity < tier.max) {
            tier.prices.push(evt.ticket_price_low);
            break;
          }
        }
      }
    }

    const pricingByCapacity = capTiers.map((t) => ({
      label: t.label,
      avgPrice: t.prices.length > 0 ? Math.round(t.prices.reduce((s, p) => s + p, 0) / t.prices.length) : 0,
      count: t.prices.length,
    }));

    // ── Top Artists by Demand ──
    const artistMap = new Map<string, { count: number; totalTracker: number; avgPrice: number; priceCount: number }>();
    for (const evt of events) {
      const existing = artistMap.get(evt.artist_name) || { count: 0, totalTracker: 0, avgPrice: 0, priceCount: 0 };
      existing.count++;
      existing.totalTracker += evt.tracker_count || 0;
      if (evt.ticket_price_low) {
        existing.avgPrice += evt.ticket_price_low;
        existing.priceCount++;
      }
      artistMap.set(evt.artist_name, existing);
    }

    const topArtists = Array.from(artistMap.entries())
      .map(([name, data]) => ({
        name,
        eventCount: data.count,
        totalDemand: data.totalTracker,
        avgPrice: data.priceCount > 0 ? Math.round(data.avgPrice / data.priceCount) : 0,
      }))
      .sort((a, b) => b.totalDemand - a.totalDemand)
      .slice(0, 25);

    // ── Top Venues by Activity ──
    const venueMap = new Map<string, { city: string; state: string; capacity: number; count: number; avgTracker: number; totalTracker: number }>();
    for (const evt of events) {
      const key = evt.venue_name;
      const existing = venueMap.get(key) || {
        city: evt.venue_city,
        state: evt.venue_state,
        capacity: evt.venue_capacity || 0,
        count: 0,
        avgTracker: 0,
        totalTracker: 0,
      };
      existing.count++;
      existing.totalTracker += evt.tracker_count || 0;
      venueMap.set(key, existing);
    }

    const topVenues = Array.from(venueMap.entries())
      .map(([name, data]) => ({
        name,
        city: data.city,
        state: data.state,
        capacity: data.capacity,
        eventCount: data.count,
        avgDemand: data.count > 0 ? Math.round(data.totalTracker / data.count) : 0,
      }))
      .sort((a, b) => b.eventCount - a.eventCount)
      .slice(0, 20);

    // ── Velocity Insights (events with sale_velocity data) ──
    const velocityEvents = events
      .filter((e) => e.sale_velocity != null && e.sale_velocity > 0)
      .map((e) => ({
        artist: e.artist_name,
        venue: e.venue_name,
        date: e.event_date,
        velocity: e.sale_velocity,
        trackerCount: e.tracker_count,
        estimatedSold: e.estimated_tickets_sold,
        estimatedRemaining: e.estimated_tickets_remaining,
        capacity: e.venue_capacity,
      }))
      .sort((a, b) => (b.velocity || 0) - (a.velocity || 0))
      .slice(0, 20);

    return NextResponse.json({
      total_events: events.length,
      capacity_range: { min: capacityMin, max: capacityMax },
      day_of_week: dayOfWeek,
      monthly_volume: monthlyVolume,
      lead_time: leadTimeBuckets.map((b) => ({ label: b.label, count: b.count, avgDemand: b.avgTracker })),
      pricing: {
        average: avgPrice,
        median: medianPrice,
        by_capacity: pricingByCapacity,
      },
      top_artists: topArtists,
      top_venues: topVenues,
      velocity_insights: velocityEvents,
    });
  } catch (err) {
    console.error("[trends] Error:", err);
    return NextResponse.json({ error: "Failed to compute trends" }, { status: 500 });
  }
}

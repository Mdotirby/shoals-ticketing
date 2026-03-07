import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

/**
 * GET /api/market-radar/health
 *
 * Returns the health status of all Market Radar data sources:
 * - Ticketmaster API key presence + test query
 * - Bandsintown API connectivity
 * - Venue scraper readiness
 * - Database table status
 */
export async function GET() {
  const results: Record<string, { status: string; details: string; count?: number }> = {};

  // 1. Ticketmaster
  const tmKey = process.env.TICKETMASTER_API_KEY;
  if (!tmKey) {
    results.ticketmaster = { status: "not_configured", details: "TICKETMASTER_API_KEY env var is not set" };
  } else {
    try {
      const res = await fetch(
        `https://app.ticketmaster.com/discovery/v2/events.json?apikey=${tmKey}&classificationName=music&city=Birmingham&stateCode=AL&size=1`
      );
      if (res.ok) {
        const data = await res.json();
        const total = data?.page?.totalElements || 0;
        results.ticketmaster = { status: "ok", details: `API key valid. ${total} events in test query.`, count: total };
      } else {
        results.ticketmaster = { status: "error", details: `HTTP ${res.status}: ${res.statusText}` };
      }
    } catch (e) {
      results.ticketmaster = { status: "error", details: e instanceof Error ? e.message : "Network error" };
    }
  }

  // 2. Bandsintown
  const bitAppId = process.env.BANDSINTOWN_APP_ID || "VenueCoreRadar";
  try {
    const res = await fetch(
      `https://rest.bandsintown.com/artists/Jason%20Isbell/events?app_id=${bitAppId}&date=upcoming`,
      { headers: { "User-Agent": "VenueCore-MarketRadar/1.0", Accept: "application/json" } }
    );
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) {
        results.bandsintown = { status: "ok", details: `API responding. ${data.length} events for test artist.`, count: data.length };
      } else {
        results.bandsintown = { status: "blocked", details: `API returned non-array response (possibly rate-limited or captcha). Response type: ${typeof data}` };
      }
    } else {
      const body = await res.text().catch(() => "");
      results.bandsintown = { status: "error", details: `HTTP ${res.status}: ${body.slice(0, 200)}` };
    }
  } catch (e) {
    results.bandsintown = { status: "error", details: e instanceof Error ? e.message : "Network error" };
  }

  // 3. Database tables
  const admin = createAdminClient();
  try {
    const { count: eventCount } = await admin
      .from("market_radar_events")
      .select("id", { count: "exact", head: true });

    const { count: clusterCount } = await admin
      .from("market_radar_routing_clusters")
      .select("id", { count: "exact", head: true });

    const { count: compCount } = await admin
      .from("market_radar_competition")
      .select("id", { count: "exact", head: true });

    results.database = {
      status: "ok",
      details: `Events: ${eventCount || 0}, Clusters: ${clusterCount || 0}, Competition: ${compCount || 0}`,
      count: eventCount || 0,
    };
  } catch (e) {
    results.database = {
      status: "error",
      details: e instanceof Error ? e.message : "Database query failed. Tables may not exist.",
    };
  }

  // 4. Last scan timestamp
  try {
    const { data: latest } = await admin
      .from("market_radar_events")
      .select("created_at")
      .order("created_at", { ascending: false })
      .limit(1);

    if (latest && latest.length > 0) {
      const lastScan = new Date(latest[0].created_at);
      const hoursAgo = Math.round((Date.now() - lastScan.getTime()) / (1000 * 60 * 60));
      results.last_scan = {
        status: hoursAgo < 48 ? "ok" : "stale",
        details: `Last event added ${hoursAgo}h ago (${lastScan.toISOString()})`,
      };
    } else {
      results.last_scan = { status: "empty", details: "No events in database yet" };
    }
  } catch {
    results.last_scan = { status: "unknown", details: "Could not check last scan time" };
  }

  // 5. Venue scraper
  results.venue_scraper = {
    status: tmKey ? "ready" : "limited",
    details: tmKey
      ? "Using Ticketmaster venue queries + HTML fallback for 15 comp venues"
      : "No TICKETMASTER_API_KEY — HTML-only scraping (limited coverage)",
  };

  return NextResponse.json({
    healthy: Object.values(results).every((r) => r.status === "ok" || r.status === "ready"),
    sources: results,
    checked_at: new Date().toISOString(),
  });
}

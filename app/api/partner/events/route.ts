import { createAdminClient } from "@/lib/supabase-server";
import { NextRequest, NextResponse } from "next/server";

// GET /api/partner/events?partner_id=xxx — Partner-scoped events (quantities only, no financials)
export async function GET(req: NextRequest) {
  const partnerId = req.nextUrl.searchParams.get("partner_id");
  if (!partnerId) {
    return NextResponse.json({ error: "partner_id required" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Get partner's assigned events
  const { data: assignments, error: assignError } = await admin
    .from("partner_event_assignments")
    .select("event_id")
    .eq("partner_id", partnerId);

  if (assignError) {
    return NextResponse.json({ error: assignError.message }, { status: 500 });
  }

  const eventIds = (assignments ?? []).map((a: { event_id: string }) => a.event_id);

  if (eventIds.length === 0) {
    return NextResponse.json([]);
  }

  // Fetch events — NO financial data (no price, no total_amount)
  const { data: events, error: evError } = await admin
    .from("events")
    .select("id, title, venue, date, status, image_url")
    .in("id", eventIds)
    .order("date", { ascending: false });

  if (evError) {
    return NextResponse.json({ error: evError.message }, { status: 500 });
  }

  // For each event, get ticket sales count (quantity only)
  const enriched = await Promise.all(
    (events ?? []).map(async (ev: { id: string; title: string; venue: string; date: string; status: string; image_url: string | null }) => {
      // Count tickets sold
      const { count: ticketsSold } = await admin
        .from("tickets")
        .select("id", { count: "exact", head: true })
        .eq("event_id", ev.id);

      // Count tickets scanned (drop count)
      const { count: ticketsScanned } = await admin
        .from("tickets")
        .select("id", { count: "exact", head: true })
        .eq("event_id", ev.id)
        .eq("is_scanned", true);

      return {
        ...ev,
        tickets_sold: ticketsSold ?? 0,
        tickets_scanned: ticketsScanned ?? 0,
        // NO price, NO revenue, NO financial data
      };
    })
  );

  return NextResponse.json(enriched);
}

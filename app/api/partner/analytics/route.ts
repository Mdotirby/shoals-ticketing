import { createAdminClient } from "@/lib/supabase-server";
import { NextRequest, NextResponse } from "next/server";

// GET /api/partner/analytics?partner_id=xxx — Partner-scoped analytics (no financials)
export async function GET(req: NextRequest) {
  const partnerId = req.nextUrl.searchParams.get("partner_id");
  if (!partnerId) {
    return NextResponse.json({ error: "partner_id required" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Get partner's assigned event IDs
  const { data: assignments } = await admin
    .from("partner_event_assignments")
    .select("event_id")
    .eq("partner_id", partnerId);

  const eventIds = (assignments ?? []).map((a: { event_id: string }) => a.event_id);

  if (eventIds.length === 0) {
    return NextResponse.json({
      total_views: 0,
      unique_views: 0,
      total_tickets_sold: 0,
      total_checked_in: 0,
      conversion_rate: "0",
      email_stats: { sent: 0, opened: 0, clicked: 0, open_rate: "0", click_rate: "0" },
      top_zips: [],
    });
  }

  // Event views across all assigned events
  const { data: views } = await admin
    .from("event_views")
    .select("id, session_id, purchased")
    .in("event_id", eventIds);

  const totalViews = (views ?? []).length;
  const uniqueSessions = new Set((views ?? []).filter((v: { session_id: string | null }) => v.session_id).map((v: { session_id: string | null }) => v.session_id)).size;
  const purchaseViews = (views ?? []).filter((v: { purchased: boolean }) => v.purchased).length;
  const conversionRate = totalViews > 0 ? ((purchaseViews / totalViews) * 100).toFixed(1) : "0";

  // Ticket counts (quantity only, no revenue)
  const { count: totalTickets } = await admin
    .from("tickets")
    .select("id", { count: "exact", head: true })
    .in("event_id", eventIds);

  const { count: scannedTickets } = await admin
    .from("tickets")
    .select("id", { count: "exact", head: true })
    .in("event_id", eventIds)
    .eq("is_scanned", true);

  // Email performance for campaigns on these events
  const { data: campaigns } = await admin
    .from("email_campaigns")
    .select("id")
    .in("event_id", eventIds)
    .eq("status", "sent");

  const campIds = (campaigns ?? []).map((c: { id: string }) => c.id);
  let emailStats = { sent: 0, opened: 0, clicked: 0, open_rate: "0", click_rate: "0" };

  if (campIds.length > 0) {
    const { data: sends } = await admin
      .from("email_sends")
      .select("status")
      .in("campaign_id", campIds);

    const sent = (sends ?? []).length;
    const opened = (sends ?? []).filter((s: { status: string }) => ["opened", "clicked"].includes(s.status)).length;
    const clicked = (sends ?? []).filter((s: { status: string }) => s.status === "clicked").length;
    emailStats = {
      sent,
      opened,
      clicked,
      open_rate: sent > 0 ? ((opened / sent) * 100).toFixed(1) : "0",
      click_rate: sent > 0 ? ((clicked / sent) * 100).toFixed(1) : "0",
    };
  }

  // Top zip codes (from orders — zip only, no amounts)
  const { data: orders } = await admin
    .from("orders")
    .select("customer_zip")
    .in("event_id", eventIds)
    .eq("status", "paid");

  const zipCounts: Record<string, number> = {};
  (orders ?? []).forEach((o: { customer_zip: string | null }) => {
    const zip = o.customer_zip?.trim();
    if (zip) zipCounts[zip] = (zipCounts[zip] || 0) + 1;
  });
  const topZips = Object.entries(zipCounts)
    .map(([zip, count]) => ({ zip, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 15);

  return NextResponse.json({
    total_views: totalViews,
    unique_views: uniqueSessions,
    total_tickets_sold: totalTickets ?? 0,
    total_checked_in: scannedTickets ?? 0,
    conversion_rate: conversionRate,
    email_stats: emailStats,
    top_zips: topZips,
  });
}

import { createAdminClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";

// GET /api/admin/reports?type=tickets|tiers|checkins&event_id=&start=&end=
export async function GET(request: Request) {
  const admin = createAdminClient();
  const { searchParams } = new URL(request.url);

  const reportType = searchParams.get("type") || "tickets";
  const eventId = searchParams.get("event_id") || "";
  const startDate = searchParams.get("start") || "";
  const endDate = searchParams.get("end") || "";

  try {
    if (reportType === "tickets") {
      // Ticket audit: all tickets with event + customer info
      let query = admin
        .from("tickets")
        .select(
          "id, customer_name, customer_email, qr_code, is_scanned, scanned_at, created_at, event_id, events!inner(title, venue, date)"
        )
        .order("created_at", { ascending: false })
        .limit(5000);

      if (eventId) query = query.eq("event_id", eventId);
      if (startDate) query = query.gte("created_at", startDate);
      if (endDate) query = query.lte("created_at", endDate + "T23:59:59Z");

      const { data, error } = await query;
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });

      const rows = (data ?? []).map((t) => {
        const ev = t.events as unknown as { title: string; venue: string; date: string } | null;
        return {
          id: t.id,
          customer_name: t.customer_name,
          customer_email: t.customer_email,
          event_title: ev?.title || "—",
          venue: ev?.venue || "—",
          event_date: ev?.date || "—",
          qr_code: t.qr_code,
          is_scanned: t.is_scanned,
          scanned_at: t.scanned_at || null,
          purchased_at: t.created_at,
        };
      });

      return NextResponse.json({ type: "tickets", rows });
    }

    if (reportType === "tiers") {
      // Tier sales breakdown
      let query = admin
        .from("tickets")
        .select(
          "id, created_at, ticket_type_id, ticket_tiers!inner(tier_name, price, event_id), events!inner(title)"
        )
        .order("created_at", { ascending: false })
        .limit(10000);

      if (eventId) query = query.eq("event_id", eventId);
      if (startDate) query = query.gte("created_at", startDate);
      if (endDate) query = query.lte("created_at", endDate + "T23:59:59Z");

      const { data, error } = await query;
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });

      // Aggregate by tier
      const tierMap: Record<string, { tier_name: string; event_title: string; price: number; count: number; revenue: number }> = {};
      for (const t of data ?? []) {
        const tier = t.ticket_tiers as unknown as { tier_name: string; price: number; event_id: string } | null;
        const ev = t.events as unknown as { title: string } | null;
        const key = `${tier?.tier_name || "Unknown"}-${ev?.title || "Unknown"}`;
        if (!tierMap[key]) {
          tierMap[key] = {
            tier_name: tier?.tier_name || "Unknown",
            event_title: ev?.title || "Unknown",
            price: tier?.price || 0,
            count: 0,
            revenue: 0,
          };
        }
        tierMap[key].count++;
        tierMap[key].revenue += tier?.price || 0;
      }

      return NextResponse.json({
        type: "tiers",
        rows: Object.values(tierMap),
      });
    }

    if (reportType === "checkins") {
      // Check-in logs: scanned tickets only
      let query = admin
        .from("tickets")
        .select(
          "id, customer_name, customer_email, is_scanned, scanned_at, created_at, event_id, events!inner(title, venue)"
        )
        .eq("is_scanned", true)
        .order("scanned_at", { ascending: false })
        .limit(5000);

      if (eventId) query = query.eq("event_id", eventId);
      if (startDate) query = query.gte("scanned_at", startDate);
      if (endDate) query = query.lte("scanned_at", endDate + "T23:59:59Z");

      const { data, error } = await query;
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });

      const rows = (data ?? []).map((t) => {
        const ev = t.events as unknown as { title: string; venue: string } | null;
        return {
          id: t.id,
          customer_name: t.customer_name,
          customer_email: t.customer_email,
          event_title: ev?.title || "—",
          venue: ev?.venue || "—",
          scanned_at: t.scanned_at,
          purchased_at: t.created_at,
        };
      });

      return NextResponse.json({ type: "checkins", rows });
    }

    return NextResponse.json({ error: "Invalid report type" }, { status: 400 });
  } catch (err) {
    console.error("Report error:", err);
    return NextResponse.json({ error: "Failed to generate report" }, { status: 500 });
  }
}

import { createAdminClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";

// POST: track a page view for an event (public, anonymous)
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const admin = createAdminClient();
  const body = await request.json().catch(() => ({}));

  await admin.from("event_views").insert({
    event_id: id,
    session_id: body.session_id || null,
    purchased: false,
    referrer_url: body.referrer_url || null,
    utm_source: body.utm_source || null,
    utm_medium: body.utm_medium || null,
    utm_campaign: body.utm_campaign || null,
  });

  return NextResponse.json({ tracked: true });
}

// GET: get view stats for an event (admin)
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const admin = createAdminClient();

    const [totalViewsRes, uniqueViewsRes, ordersCountRes] = await Promise.all([
      admin
        .from("event_views")
        .select("id", { count: "exact", head: true })
        .eq("event_id", id),
      admin
        .from("event_views")
        .select("session_id")
        .eq("event_id", id)
        .not("session_id", "is", null),
      // Count actual orders as "purchase views" — more reliable than event_views.purchased flag
      admin
        .from("orders")
        .select("id", { count: "exact", head: true })
        .eq("event_id", id)
        .eq("status", "paid"),
    ]);

    // If any query errored (e.g. table doesn't exist), return zeros
    if (totalViewsRes.error || uniqueViewsRes.error) {
      return NextResponse.json({
        total_views: 0,
        unique_views: 0,
        purchase_views: 0,
        views_without_purchase: 0,
        conversion_rate: "0",
      });
    }

    const uniqueSessions = new Set(
      (uniqueViewsRes.data || []).map((r: { session_id: string }) => r.session_id)
    ).size;

    const totalViews = totalViewsRes.count ?? 0;
    const purchaseViews = ordersCountRes.count ?? 0;
    const uniqueViews = uniqueSessions || totalViews;
    const viewsWithoutPurchase = Math.max(0, uniqueViews - purchaseViews);
    const conversionRate = uniqueViews > 0 ? ((purchaseViews / uniqueViews) * 100).toFixed(1) : "0";

    return NextResponse.json({
      total_views: totalViews,
      unique_views: uniqueViews,
      purchase_views: purchaseViews,
      views_without_purchase: viewsWithoutPurchase,
      conversion_rate: conversionRate,
    });
  } catch {
    return NextResponse.json({
      total_views: 0,
      unique_views: 0,
      purchase_views: 0,
      views_without_purchase: 0,
      conversion_rate: "0",
    });
  }
}

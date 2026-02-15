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
  });

  return NextResponse.json({ tracked: true });
}

// GET: get view stats for an event (admin)
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const admin = createAdminClient();

  const [totalViewsRes, uniqueViewsRes, purchaseViewsRes] = await Promise.all([
    admin
      .from("event_views")
      .select("id", { count: "exact", head: true })
      .eq("event_id", id),
    admin
      .from("event_views")
      .select("session_id")
      .eq("event_id", id)
      .not("session_id", "is", null),
    admin
      .from("event_views")
      .select("id", { count: "exact", head: true })
      .eq("event_id", id)
      .eq("purchased", true),
  ]);

  const uniqueSessions = new Set(
    (uniqueViewsRes.data || []).map((r: { session_id: string }) => r.session_id)
  ).size;

  const totalViews = totalViewsRes.count ?? 0;
  const purchaseViews = purchaseViewsRes.count ?? 0;
  const viewsWithoutPurchase = totalViews - purchaseViews;
  const conversionRate = totalViews > 0 ? ((purchaseViews / totalViews) * 100).toFixed(1) : "0";

  return NextResponse.json({
    total_views: totalViews,
    unique_views: uniqueSessions,
    purchase_views: purchaseViews,
    views_without_purchase: viewsWithoutPurchase,
    conversion_rate: conversionRate,
  });
}

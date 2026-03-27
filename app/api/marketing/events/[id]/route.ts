import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = createAdminClient();

  /* ------------------------------------------------------------------ */
  /*  1. Get event                                                       */
  /* ------------------------------------------------------------------ */
  const { data: event, error: eventError } = await supabase
    .from("events")
    .select("*")
    .eq("id", id)
    .single();

  if (eventError) {
    return NextResponse.json(
      { error: eventError.message },
      { status: eventError.code === "PGRST116" ? 404 : 500 }
    );
  }

  /* ------------------------------------------------------------------ */
  /*  2. Get orders for this event                                       */
  /* ------------------------------------------------------------------ */
  const { data: orders } = await supabase
    .from("orders")
    .select("id,customer_email,created_at,quantity,total_amount,status,customer_name")
    .eq("event_id", id)
    .order("created_at", { ascending: false });

  const allOrders = orders || [];
  const paidOrders = allOrders.filter(
    (o: Record<string, unknown>) =>
      o.status === "paid" || o.status === "completed"
  );

  /* ------------------------------------------------------------------ */
  /*  3. Get ticket types / tiers for capacity                           */
  /* ------------------------------------------------------------------ */
  const { data: ticketTypes } = await supabase
    .from("ticket_types")
    .select("id,name,price,quantity")
    .eq("event_id", id);

  let tiers = (ticketTypes || []) as Array<{
    id: string;
    name: string;
    price: number;
    quantity: number;
  }>;

  // Fall back to ticket_tiers if ticket_types is empty
  if (tiers.length === 0) {
    const { data: ticketTiers } = await supabase
      .from("ticket_tiers")
      .select("id,name,price,capacity")
      .eq("event_id", id);

    tiers = ((ticketTiers || []) as Array<{
      id: string;
      name: string;
      price: number;
      capacity: number;
    }>).map((t) => ({
      id: t.id,
      name: t.name,
      price: t.price,
      quantity: t.capacity,
    }));
  }

  /* ------------------------------------------------------------------ */
  /*  4. Compute sales by ticket type (via tickets table)                */
  /* ------------------------------------------------------------------ */
  // Query tickets for this event grouped by ticket_type_id
  const { data: eventTickets } = await supabase
    .from("tickets")
    .select("ticket_type_id, order_id")
    .eq("event_id", id);

  // Build a set of paid order IDs for filtering
  const paidOrderIds = new Set(paidOrders.map((o: Record<string, unknown>) => o.id));

  // Count sold tickets per tier (only from paid orders)
  const soldByTier: Record<string, number> = {};
  for (const t of eventTickets ?? []) {
    if (paidOrderIds.has(t.order_id)) {
      const key = t.ticket_type_id ?? "__unassigned__";
      soldByTier[key] = (soldByTier[key] || 0) + 1;
    }
  }

  const salesByType = tiers.map((tier) => {
    const sold = soldByTier[tier.id] || 0;
    const revenue = Math.round(sold * tier.price * 100) / 100;
    return {
      type: tier.name,
      sold,
      capacity: tier.quantity,
      revenue,
    };
  });

  const totalSold = paidOrders.reduce(
    (s: number, o: Record<string, unknown>) =>
      s + ((o.quantity as number) || 1),
    0
  );
  const totalRevenue = paidOrders.reduce(
    (s: number, o: Record<string, unknown>) =>
      s + ((o.total_amount as number) || 0),
    0
  );
  const totalCapacity = tiers.reduce((s, t) => s + (t.quantity || 0), 0);
  const totalAvailable = Math.max(0, totalCapacity - totalSold);
  const percentSold =
    totalCapacity > 0 ? Math.round((totalSold / totalCapacity) * 100) : 0;
  const avgTicketPrice = totalSold > 0 ? Math.round((totalRevenue / totalSold) * 100) / 100 : 0;

  /* ------------------------------------------------------------------ */
  /*  5. Sales timeline (daily)                                          */
  /* ------------------------------------------------------------------ */
  const timelineMap: Record<string, { sold: number; cumulative: number }> = {};
  let cumulative = 0;

  // Sort paid orders by date ascending for timeline
  const sortedPaidOrders = [...paidOrders].sort(
    (a: Record<string, unknown>, b: Record<string, unknown>) =>
      new Date(a.created_at as string).getTime() -
      new Date(b.created_at as string).getTime()
  );

  for (const order of sortedPaidOrders) {
    const date = new Date(order.created_at as string)
      .toISOString()
      .split("T")[0];
    const qty = (order.quantity as number) || 1;
    cumulative += qty;

    if (!timelineMap[date]) {
      timelineMap[date] = { sold: 0, cumulative: 0 };
    }
    timelineMap[date].sold += qty;
    timelineMap[date].cumulative = cumulative;
  }

  const salesTimeline = Object.entries(timelineMap).map(([date, data]) => ({
    date,
    sold: data.sold,
    cumulative: data.cumulative,
  }));

  /* ------------------------------------------------------------------ */
  /*  6. Engagement: page views + drop count                             */
  /* ------------------------------------------------------------------ */
  let pageViews = 0;
  try {
    const { count } = await supabase
      .from("event_views")
      .select("id", { count: "exact", head: true })
      .eq("event_id", id);
    pageViews = count || 0;
  } catch {
    // event_views table may not exist
  }

  let dropCount = 0;
  try {
    const { count } = await supabase
      .from("tickets")
      .select("id", { count: "exact", head: true })
      .eq("event_id", id)
      .eq("is_scanned", true);
    dropCount = count || 0;
  } catch {
    // tickets table may not exist
  }

  const conversionRate =
    pageViews > 0
      ? Math.round((paidOrders.length / pageViews) * 1000) / 10
      : 0;

  /* ------------------------------------------------------------------ */
  /*  7. Recent orders (last 20)                                         */
  /* ------------------------------------------------------------------ */
  const recentOrders = allOrders.slice(0, 20).map((o: Record<string, unknown>) => ({
    email: o.customer_email || o.customer_name || "Unknown",
    date: o.created_at,
    quantity: (o.quantity as number) || 1,
    total: o.total_amount || 0,
    status: o.status || "unknown",
  }));

  /* ------------------------------------------------------------------ */
  /*  8. Return                                                          */
  /* ------------------------------------------------------------------ */
  return NextResponse.json({
    event,
    sales: {
      total_sold: totalSold,
      total_capacity: totalCapacity,
      total_available: totalAvailable,
      percent_sold: percentSold,
      total_revenue: Math.round(totalRevenue * 100) / 100,
      avg_ticket_price: avgTicketPrice,
      sales_by_type: salesByType,
      sales_timeline: salesTimeline,
    },
    engagement: {
      page_views: pageViews,
      drop_count: dropCount,
      conversion_rate: conversionRate,
    },
    orders: recentOrders,
  });
}

import { createAdminClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";

// GET /api/marketing/lfv — Lifetime Fan Value data from orders
export async function GET() {
  const admin = createAdminClient();

  // Get all completed orders grouped by customer email
  const { data: orders, error } = await admin
    .from("orders")
    .select("customer_email, customer_name, total_amount, created_at, event_id")
    .eq("status", "paid")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Aggregate by customer email
  const customerMap: Record<string, {
    email: string;
    name: string;
    total_spend: number;
    order_count: number;
    events: Set<string>;
    first_order: string;
    last_order: string;
  }> = {};

  (orders ?? []).forEach((o: { customer_email: string; customer_name: string; total_amount: number; created_at: string; event_id: string }) => {
    if (!o.customer_email) return;
    const key = o.customer_email.toLowerCase();
    if (!customerMap[key]) {
      customerMap[key] = {
        email: o.customer_email,
        name: o.customer_name || "",
        total_spend: 0,
        order_count: 0,
        events: new Set(),
        first_order: o.created_at,
        last_order: o.created_at,
      };
    }
    customerMap[key].total_spend += Number(o.total_amount) || 0;
    customerMap[key].order_count += 1;
    if (o.event_id) customerMap[key].events.add(o.event_id);
    if (o.created_at < customerMap[key].first_order) customerMap[key].first_order = o.created_at;
    if (o.created_at > customerMap[key].last_order) customerMap[key].last_order = o.created_at;
  });

  const customers = Object.values(customerMap).map((c) => {
    const events_attended = c.events.size;
    let segment: string;
    if (events_attended >= 4) segment = "whale";
    else if (events_attended >= 2) segment = "loyalist";
    else if (c.order_count >= 2) segment = "repeat";
    else segment = "one_timer";

    return {
      email: c.email,
      name: c.name,
      total_spend: Math.round(c.total_spend * 100) / 100,
      order_count: c.order_count,
      events_attended,
      first_order: c.first_order,
      last_order: c.last_order,
      segment,
    };
  });

  // Sort by total spend descending
  customers.sort((a, b) => b.total_spend - a.total_spend);

  // Summary stats
  const totalCustomers = customers.length;
  const avgLFV = totalCustomers > 0 ? Math.round((customers.reduce((sum, c) => sum + c.total_spend, 0) / totalCustomers) * 100) / 100 : 0;
  const segments = {
    one_timer: customers.filter((c) => c.segment === "one_timer").length,
    repeat: customers.filter((c) => c.segment === "repeat").length,
    loyalist: customers.filter((c) => c.segment === "loyalist").length,
    whale: customers.filter((c) => c.segment === "whale").length,
  };

  return NextResponse.json({ customers, totalCustomers, avgLFV, segments });
}

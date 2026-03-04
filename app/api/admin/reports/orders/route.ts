import { createAdminClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";

/**
 * Orders Report API
 * Per-event order detail WITH customer data.
 *
 * Query params:
 *   ?event_id=UUID
 *   ?venue_id=UUID
 *   ?from=YYYY-MM-DD&to=YYYY-MM-DD
 *   ?format=csv
 */
export async function GET(request: Request) {
  const supabase = createAdminClient();
  const { searchParams } = new URL(request.url);
  const eventId = searchParams.get("event_id");
  const venueId = searchParams.get("venue_id");
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const format = searchParams.get("format");

  try {
    let query = supabase
      .from("orders")
      .select("*, events!inner(title, date, venue, venue_id)")
      .order("created_at", { ascending: false })
      .limit(5000);

    if (eventId) query = query.eq("event_id", eventId);
    if (venueId) query = query.eq("events.venue_id", venueId);
    if (from) query = query.gte("created_at", from);
    if (to) query = query.lte("created_at", to);

    const { data: orders, error } = await query;
    if (error) throw error;

    const rows = (orders ?? []).map((o) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ev = (o as any).events;
      return {
        order_id: o.id,
        customer_name: o.customer_name ?? "",
        customer_email: o.customer_email ?? "",
        customer_phone: o.customer_phone ?? "",
        event_title: ev?.title ?? "",
        event_date: ev?.date ?? "",
        venue: ev?.venue ?? "",
        quantity: o.quantity ?? 1,
        total_amount: Number(o.total_amount) || 0,
        stripe_session_id: o.stripe_session_id ?? "",
        status: o.status ?? "completed",
        created_at: o.created_at,
      };
    });

    // Summary stats
    const totalOrders = rows.length;
    const totalRevenue = r2(rows.reduce((sum, r) => sum + r.total_amount, 0));
    const totalTickets = rows.reduce((sum, r) => sum + r.quantity, 0);

    const result = {
      rows,
      summary: {
        total_orders: totalOrders,
        total_revenue: totalRevenue,
        total_tickets: totalTickets,
      },
    };

    if (format === "csv") {
      return csvResponse(result);
    }

    return NextResponse.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function r2(n: number): number {
  return Math.round(n * 100) / 100;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function csvResponse(data: any) {
  const headers = [
    "Order ID",
    "Customer Name",
    "Customer Email",
    "Customer Phone",
    "Event",
    "Event Date",
    "Venue",
    "Quantity",
    "Total Amount",
    "Status",
    "Order Date",
  ];
  const lines = [headers.join(",")];

  for (const row of data.rows) {
    lines.push(
      [
        row.order_id,
        csvEsc(row.customer_name),
        csvEsc(row.customer_email),
        csvEsc(row.customer_phone),
        csvEsc(row.event_title),
        row.event_date,
        csvEsc(row.venue),
        row.quantity,
        `$${row.total_amount.toFixed(2)}`,
        row.status,
        row.created_at?.slice(0, 10) ?? "",
      ].join(",")
    );
  }

  lines.push("");
  lines.push(`Total Orders,${data.summary.total_orders}`);
  lines.push(`Total Revenue,$${data.summary.total_revenue.toFixed(2)}`);
  lines.push(`Total Tickets,${data.summary.total_tickets}`);

  const csv = lines.join("\n");
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="orders-report-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}

function csvEsc(s: string): string {
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

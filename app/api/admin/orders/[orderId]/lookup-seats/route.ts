import { createAdminClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";

/**
 * GET /api/admin/orders/[orderId]/lookup-seats?section=Section+1&from=7&to=14
 *
 * Returns the seat IDs and current status for seats in the given section
 * and seat-number range, scoped to the event attached to this order.
 * Used to preview seats before manually assigning them to the order.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ orderId: string }> }
) {
  const { orderId } = await params;
  const { searchParams } = new URL(req.url);
  const sectionName = searchParams.get("section")?.trim();
  const from = parseInt(searchParams.get("from") || "0", 10);
  const to = parseInt(searchParams.get("to") || "0", 10);

  if (!sectionName || !from || !to || from > to) {
    return NextResponse.json(
      { error: "section, from, and to are required (from ≤ to)" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  // Get event_id from the order
  const { data: order } = await admin
    .from("orders")
    .select("event_id")
    .eq("id", orderId)
    .single();

  if (!order?.event_id) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  // Resolve layout for this event
  const { data: mapRow } = await admin
    .from("event_layout_maps")
    .select("layout_id")
    .eq("event_id", order.event_id)
    .eq("enabled", true)
    .single();

  if (!mapRow?.layout_id) {
    return NextResponse.json({ error: "No seating layout for this event" }, { status: 404 });
  }

  // Find the section by name
  const { data: section } = await admin
    .from("sections")
    .select("id, name, price_cents")
    .eq("layout_id", mapRow.layout_id)
    .ilike("name", sectionName)
    .single();

  if (!section) {
    // Return all section names so the admin can see what's available
    const { data: allSections } = await admin
      .from("sections")
      .select("name")
      .eq("layout_id", mapRow.layout_id)
      .order("name");
    return NextResponse.json({
      error: `Section "${sectionName}" not found.`,
      availableSections: (allSections || []).map((s: { name: string }) => s.name),
    }, { status: 404 });
  }

  // Find seats in the number range
  const { data: seats } = await admin
    .from("seats")
    .select("id, seat_number, row_label, status, order_id")
    .eq("section_id", section.id)
    .gte("seat_number", from)
    .lte("seat_number", to)
    .order("seat_number");

  return NextResponse.json({
    section: { id: section.id, name: section.name, price_cents: section.price_cents },
    seats: seats || [],
  });
}

import { createAdminClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";

/**
 * GET /api/admin/orders/[orderId]/lookup-seats
 *   → returns all sections for the event's layout
 *
 * GET /api/admin/orders/[orderId]/lookup-seats?section_id=xxx
 *   → returns all seats in that section with their current status
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ orderId: string }> }
) {
  const { orderId } = await params;
  const { searchParams } = new URL(req.url);
  const sectionId = searchParams.get("section_id");

  const admin = createAdminClient();

  const { data: order } = await admin
    .from("orders")
    .select("event_id")
    .eq("id", orderId)
    .single();

  if (!order?.event_id) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  const { data: mapRow } = await admin
    .from("event_layout_maps")
    .select("layout_id")
    .eq("event_id", order.event_id)
    .eq("enabled", true)
    .single();

  if (!mapRow?.layout_id) {
    return NextResponse.json({ error: "No seating layout for this event" }, { status: 404 });
  }

  // ── Mode 1: no section_id → return all sections ───────────────────────────
  if (!sectionId) {
    const { data: sections } = await admin
      .from("sections")
      .select("id, name, price_cents, type, sells_as_table")
      .eq("layout_id", mapRow.layout_id)
      .neq("type", "stage")
      .order("name");

    return NextResponse.json({ sections: sections || [] });
  }

  // ── Mode 2: section_id → return all seats in that section ─────────────────
  const { data: section } = await admin
    .from("sections")
    .select("id, name, price_cents, sells_as_table, type")
    .eq("id", sectionId)
    .eq("layout_id", mapRow.layout_id)
    .single();

  if (!section) {
    return NextResponse.json({ error: "Section not found in this event's layout" }, { status: 404 });
  }

  const { data: seats } = await admin
    .from("seats")
    .select("id, seat_number, row_label, object_id, status, order_id")
    .eq("section_id", sectionId)
    .order("row_label")
    .order("seat_number");

  // Fetch real table numbers from object metadata so the UI shows the correct table label
  const objectIds = [...new Set((seats || []).map((s: { object_id: string | null }) => s.object_id).filter(Boolean))] as string[];
  const tableNumbers = new Map<string, number>();
  if (objectIds.length > 0) {
    const { data: objects } = await admin
      .from("objects")
      .select("id, metadata")
      .in("id", objectIds);
    for (const obj of objects || []) {
      const num = (obj.metadata as { table_number?: number })?.table_number;
      if (num != null) tableNumbers.set(obj.id, num);
    }
  }

  return NextResponse.json({
    section: { id: section.id, name: section.name, price_cents: section.price_cents, sells_as_table: section.sells_as_table, type: section.type },
    seats: seats || [],
    tableNumbers: Object.fromEntries(tableNumbers),
  });
}

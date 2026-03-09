import { createAdminClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";

/**
 * GET /api/test-seating?event_id=xxx
 * Test endpoint: returns all seats for an event and their status.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const eventId = searchParams.get("event_id");

  if (!eventId) {
    return NextResponse.json(
      { error: "event_id query param is required" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  // Look up the event seating map
  const { data: map } = await admin
    .from("event_seating_maps")
    .select("*")
    .eq("event_id", eventId)
    .single();

  if (!map) {
    return NextResponse.json({
      event_id: eventId,
      reserved_seating_enabled: false,
      seats: [],
    });
  }

  // Fetch full chart data
  const { data: sections } = await admin
    .from("seating_sections")
    .select("id, section_name, color, price_tier")
    .eq("chart_id", map.chart_id);

  const sectionIds = (sections || []).map((s: { id: string }) => s.id);
  const sectionMap = new Map(
    (sections || []).map((s: { id: string; section_name: string; color: string; price_tier: number }) => [s.id, s])
  );

  const { data: rows } = sectionIds.length
    ? await admin.from("seating_rows").select("id, section_id, row_label").in("section_id", sectionIds)
    : { data: [] };

  const rowIds = (rows || []).map((r: { id: string }) => r.id);
  const rowMap = new Map(
    (rows || []).map((r: { id: string; section_id: string; row_label: string }) => [r.id, r])
  );

  const { data: seats } = rowIds.length
    ? await admin.from("seating_seats").select("*").in("row_id", rowIds).order("seat_number")
    : { data: [] };

  // Enrich seats with section + row labels
  const enrichedSeats = (seats || []).map((seat: {
    id: string; row_id: string; seat_number: string;
    x_position: number; y_position: number; status: string;
  }) => {
    const row = rowMap.get(seat.row_id) as { section_id: string; row_label: string } | undefined;
    const section = row ? sectionMap.get(row.section_id) as { section_name: string; color: string; price_tier: number } | undefined : undefined;
    return {
      seat_id: seat.id,
      section_name: section?.section_name ?? "Unknown",
      section_color: section?.color ?? "#ccc",
      price_tier: section?.price_tier ?? 0,
      row_label: row?.row_label ?? "?",
      seat_number: seat.seat_number,
      x_position: seat.x_position,
      y_position: seat.y_position,
      status: seat.status,
    };
  });

  return NextResponse.json({
    event_id: eventId,
    reserved_seating_enabled: map.reserved_seating_enabled,
    chart_id: map.chart_id,
    total_seats: enrichedSeats.length,
    seats: enrichedSeats,
  });
}

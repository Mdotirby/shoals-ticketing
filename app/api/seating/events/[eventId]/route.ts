import { createAdminClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";

/**
 * GET /api/seating/events/[eventId]
 * Returns the seating map for an event.
 * Detects if chart was built from a layout and returns layout data for rendering.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const { eventId } = await params;
  const admin = createAdminClient();

  // Look up the event_seating_maps record
  const { data: map, error: mapError } = await admin
    .from("event_seating_maps")
    .select("*")
    .eq("event_id", eventId)
    .single();

  if (mapError || !map) {
    return NextResponse.json(
      { reserved_seating_enabled: false, chart: null },
      { status: 200 }
    );
  }

  if (!map.reserved_seating_enabled) {
    return NextResponse.json(
      { reserved_seating_enabled: false, chart: null },
      { status: 200 }
    );
  }

  // Fetch the chart
  const { data: chart } = await admin
    .from("seating_charts")
    .select("*")
    .eq("id", map.chart_id)
    .single();

  if (!chart) {
    return NextResponse.json(
      { reserved_seating_enabled: true, chart: null },
      { status: 200 }
    );
  }

  // Check if this chart was built from a layout
  const chartData = (chart.chart_data || {}) as Record<string, unknown>;
  const layoutId = chartData.layout_id as string | undefined;

  // Fetch sections
  const { data: sections } = await admin
    .from("seating_sections")
    .select("*")
    .eq("chart_id", chart.id)
    .order("section_name");

  const sectionIds = (sections || []).map((s: { id: string }) => s.id);

  // Fetch rows
  const { data: rows } = sectionIds.length
    ? await admin.from("seating_rows").select("*").in("section_id", sectionIds).order("row_label")
    : { data: [] };

  // Fetch seats
  const rowIds = (rows || []).map((r: { id: string }) => r.id);
  const { data: seats } = rowIds.length
    ? await admin.from("seating_seats").select("*").in("row_id", rowIds).order("seat_number")
    : { data: [] };

  // Nest data: rows with seats
  const rowMap = new Map<string, Record<string, unknown>>();
  for (const r of rows || []) {
    rowMap.set(r.id, { ...r, seats: [] });
  }
  for (const seat of seats || []) {
    const row = rowMap.get(seat.row_id) as { seats: unknown[] } | undefined;
    if (row) row.seats.push(seat);
  }
  for (const row of rowMap.values()) {
    (row as { seats: Array<{ seat_number: string }> }).seats.sort(
      (a, b) => parseInt(a.seat_number) - parseInt(b.seat_number)
    );
  }

  const enrichedSections = (sections || []).map((sec: { id: string }) => ({
    ...sec,
    rows: Array.from(rowMap.values()).filter(
      (r) => (r as { section_id: string }).section_id === sec.id
    ),
  }));

  // If layout-based chart, also return layout data
  if (layoutId) {
    const { data: layout } = await admin
      .from("venue_layouts")
      .select("*")
      .eq("id", layoutId)
      .single();

    const { data: layoutObjects } = await admin
      .from("layout_objects")
      .select("*")
      .eq("layout_id", layoutId)
      .order("created_at");

    return NextResponse.json({
      reserved_seating_enabled: true,
      event_seating_map: map,
      type: "layout",
      chart: { ...chart, sections: enrichedSections },
      layout: layout || null,
      layout_objects: layoutObjects || [],
    });
  }

  // Classic chart response
  return NextResponse.json({
    reserved_seating_enabled: true,
    event_seating_map: map,
    type: "classic",
    chart: { ...chart, sections: enrichedSections },
  });
}

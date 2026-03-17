import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * POST /api/layouts/[id]/assign-chart
 * Creates a seating_chart from a venue_layout so it can be assigned to events.
 * Converts layout_objects into seating_sections, seating_rows, and seating_seats.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: layoutId } = await params;

  // Get layout
  const { data: layout, error: layoutErr } = await admin
    .from("venue_layouts")
    .select("*")
    .eq("id", layoutId)
    .single();

  if (layoutErr || !layout) {
    return NextResponse.json({ error: "Layout not found" }, { status: 404 });
  }

  // Get objects
  const { data: objects } = await admin
    .from("layout_objects")
    .select("*")
    .eq("layout_id", layoutId)
    .order("created_at");

  if (!objects || objects.length === 0) {
    return NextResponse.json({ error: "Layout has no objects" }, { status: 400 });
  }

  // Create seating chart
  const sections = objects.filter((o: Record<string, unknown>) =>
    ["table", "row", "ga_section"].includes(o.type as string)
  );

  const { data: chart, error: chartErr } = await admin
    .from("seating_charts")
    .insert({
      name: layout.name,
      venue_name: null,
      venue_id: layout.venue_id,
      total_sections: sections.length,
      chart_data: {
        source: "layout-builder",
        layout_id: layoutId,
        room_width_ft: layout.room_width_ft,
        room_height_ft: layout.room_height_ft,
      },
    })
    .select()
    .single();

  if (chartErr || !chart) {
    return NextResponse.json({ error: "Failed to create chart: " + (chartErr?.message || "unknown") }, { status: 500 });
  }

  // Create sections and seats for each layout object
  const SECTION_COLORS = [
    "#6366f1", "#ec4899", "#f59e0b", "#10b981", "#3b82f6",
    "#ef4444", "#8b5cf6", "#14b8a6",
  ];

  for (let i = 0; i < sections.length; i++) {
    const obj = sections[i] as Record<string, unknown>;
    const layoutType = obj.type === "table" ? "tables" : "rows";

    const { data: section } = await admin
      .from("seating_sections")
      .insert({
        chart_id: chart.id,
        section_name: (obj.label as string) || `Section ${i + 1}`,
        color: (obj.color as string) || SECTION_COLORS[i % SECTION_COLORS.length],
        price_tier: 1,
        layout_type: layoutType,
        row_count: obj.type === "row" ? 1 : 0,
        seat_count: (obj.seat_count as number) || 0,
      })
      .select()
      .single();

    if (!section) continue;

    // Create a "row" (even for tables, a row holds the seats)
    const { data: row } = await admin
      .from("seating_rows")
      .insert({
        section_id: section.id,
        row_label: obj.type === "table" ? (obj.label as string) || `T${i + 1}` : "A",
        seat_count: (obj.seat_count as number) || 0,
      })
      .select()
      .single();

    if (!row) continue;

    // Generate seats
    const seatCount = (obj.seat_count as number) || 0;
    if (seatCount > 0) {
      const seats = [];
      for (let s = 0; s < seatCount; s++) {
        seats.push({
          row_id: row.id,
          seat_number: `${s + 1}`,
          x_position: s * 28,
          y_position: 0,
          status: "available",
        });
      }
      await admin.from("seating_seats").insert(seats);
    }
  }

  return NextResponse.json({
    success: true,
    chart_id: chart.id,
    chart_name: chart.name,
    sections_created: sections.length,
  });
}

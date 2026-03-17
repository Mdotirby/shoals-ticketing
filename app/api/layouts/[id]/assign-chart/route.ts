import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * POST /api/layouts/[id]/assign-chart
 * Creates a seating_chart from a venue_layout with real spatial seat positions.
 * Stores layout_id in chart_data so the customer-facing picker can render
 * the exact same diagram the venue designed.
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

  // Filter to seatable objects (tables, rows, ga_sections)
  const seatableObjects = objects.filter((o: Record<string, unknown>) =>
    ["table", "row", "ga_section"].includes(o.type as string)
  );

  if (seatableObjects.length === 0) {
    return NextResponse.json({ error: "Layout has no seatable objects (tables, rows, or GA sections)" }, { status: 400 });
  }

  // Create seating chart with layout reference
  const { data: chart, error: chartErr } = await admin
    .from("seating_charts")
    .insert({
      name: layout.name,
      venue_name: null,
      venue_id: layout.venue_id,
      total_sections: seatableObjects.length,
      chart_data: {
        source: "layout-builder",
        layout_id: layoutId,
        room_width_ft: layout.room_width_ft || 100,
        room_height_ft: layout.room_height_ft || 60,
        scale_pixels_per_foot: layout.scale_pixels_per_foot || 10,
        background_image_url: layout.background_image_url || null,
      },
    })
    .select()
    .single();

  if (chartErr || !chart) {
    return NextResponse.json({ error: "Failed to create chart: " + (chartErr?.message || "unknown") }, { status: 500 });
  }

  let totalSeatsCreated = 0;

  // Create sections and seats for each layout object
  for (let i = 0; i < seatableObjects.length; i++) {
    const obj = seatableObjects[i] as Record<string, unknown>;
    const objType = obj.type as string;
    const layoutType = objType === "table" ? "tables" : "rows";
    const seatCount = (obj.seat_count as number) || 0;
    const objX = (obj.x as number) || 0;
    const objY = (obj.y as number) || 0;
    const objW = (obj.width as number) || 5;
    const objH = (obj.height as number) || 5;
    const diameterInches = (obj.diameter_inches as number) || 0;

    const { data: section } = await admin
      .from("seating_sections")
      .insert({
        chart_id: chart.id,
        section_name: (obj.label as string) || `Section ${i + 1}`,
        color: (obj.color as string) || "#6366f1",
        price_tier: 1,
        layout_type: layoutType,
        row_count: objType === "row" ? 1 : (objType === "table" ? 1 : 0),
        seat_count: seatCount,
      })
      .select()
      .single();

    if (!section) continue;

    // For GA sections, no individual seats needed
    if (objType === "ga_section") continue;

    // Create a row record
    const rowLabel = objType === "table"
      ? ((obj.label as string) || `T${i + 1}`)
      : "A";

    const { data: row } = await admin
      .from("seating_rows")
      .insert({
        section_id: section.id,
        row_label: rowLabel,
        seat_count: seatCount,
      })
      .select()
      .single();

    if (!row || seatCount <= 0) continue;

    // Generate seats with REAL spatial positions (in feet)
    const seats = [];

    if (objType === "table") {
      // Seats orbit around the table center
      const centerX = objX + objW / 2;
      const centerY = objY + objH / 2;
      const tableDiameterFt = diameterInches > 0
        ? diameterInches / 12
        : Math.min(objW, objH);
      const orbitRadius = tableDiameterFt / 2 + 1.2; // 1.2ft gap

      for (let s = 0; s < seatCount; s++) {
        const angle = (2 * Math.PI * s) / seatCount - Math.PI / 2;
        seats.push({
          row_id: row.id,
          seat_number: `${s + 1}`,
          x_position: parseFloat((centerX + orbitRadius * Math.cos(angle)).toFixed(2)),
          y_position: parseFloat((centerY + orbitRadius * Math.sin(angle)).toFixed(2)),
          status: "available",
        });
      }
    } else if (objType === "row") {
      // Seats evenly spaced along the row width
      const spacing = seatCount > 1 ? objW / (seatCount - 1) : 0;
      const centerY = objY + objH / 2;

      for (let s = 0; s < seatCount; s++) {
        seats.push({
          row_id: row.id,
          seat_number: `${s + 1}`,
          x_position: parseFloat((objX + (seatCount > 1 ? s * spacing : objW / 2)).toFixed(2)),
          y_position: parseFloat(centerY.toFixed(2)),
          status: "available",
        });
      }
    }

    if (seats.length > 0) {
      await admin.from("seating_seats").insert(seats);
      totalSeatsCreated += seats.length;
    }
  }

  return NextResponse.json({
    success: true,
    chart_id: chart.id,
    chart_name: chart.name,
    sections_created: seatableObjects.length,
    seats_created: totalSeatsCreated,
  });
}

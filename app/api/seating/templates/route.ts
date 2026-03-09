import { createAdminClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";

/**
 * GET /api/seating/templates?venue_id=xxx
 * List saved seating templates for the template selector.
 */
export async function GET(request: Request) {
  const admin = createAdminClient();
  const { searchParams } = new URL(request.url);
  const venueId = searchParams.get("venue_id");

  let query = admin
    .from("seating_templates")
    .select("id, name, venue_id, created_at")
    .order("created_at", { ascending: false });

  if (venueId) {
    query = query.eq("venue_id", venueId);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data ?? []);
}

/**
 * POST /api/seating/templates
 * Save an AI-generated seating template.
 * Body: { name, venue_id?, svg_map, layout_json, source_image_url? }
 */
export async function POST(request: Request) {
  const admin = createAdminClient();
  const body = await request.json();

  const { name, venue_id, svg_map, layout_json, source_image_url } = body;

  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  // 1. Insert the template
  const { data: template, error: tplError } = await admin
    .from("seating_templates")
    .insert({
      name,
      venue_id: venue_id || null,
      svg_map: svg_map || null,
      layout_json: layout_json || null,
      source_image_url: source_image_url || null,
    })
    .select()
    .single();

  if (tplError || !template) {
    return NextResponse.json(
      { error: tplError?.message || "Failed to save template" },
      { status: 500 }
    );
  }

  // 2. Also create a seating_chart entry so this template appears in the existing
  //    chart selector (event creation form). This bridges AI templates → reserved seating engine.
  if (layout_json && layout_json.sections) {
    const sections = layout_json.sections as Array<{
      name: string;
      type: string;
      rows?: Array<{ row: string; seats: number }>;
      tables?: Array<{ table: string; seats: number }>;
    }>;

    // Calculate totals
    let totalSeats = 0;
    for (const sec of sections) {
      if (sec.rows) totalSeats += sec.rows.reduce((s, r) => s + r.seats, 0);
      if (sec.tables) totalSeats += sec.tables.reduce((s, t) => s + t.seats, 0);
    }

    const { data: chart, error: chartError } = await admin
      .from("seating_charts")
      .insert({
        name: `${name} (AI)`,
        venue_name: null,
        venue_id: venue_id || null,
        total_sections: sections.length,
        chart_data: { source: "ai-generator", template_id: template.id, layout: layout_json },
      })
      .select()
      .single();

    if (!chartError && chart) {
      // Create sections and auto-generate rows/seats
      for (const sec of sections) {
        const rowCount = sec.rows?.length || 0;
        const seatCount = sec.rows
          ? sec.rows.reduce((s, r) => s + r.seats, 0)
          : sec.tables
          ? sec.tables.reduce((s, t) => s + t.seats, 0)
          : 0;

        const { data: section } = await admin
          .from("seating_sections")
          .insert({
            chart_id: chart.id,
            section_name: sec.name,
            color: "#6366f1",
            price_tier: 0,
            row_count: rowCount,
            seat_count: seatCount,
          })
          .select()
          .single();

        if (section && sec.rows) {
          for (const row of sec.rows) {
            const { data: rowData } = await admin
              .from("seating_rows")
              .insert({
                section_id: section.id,
                row_label: row.row,
                seat_count: row.seats,
              })
              .select()
              .single();

            if (rowData) {
              const seats = [];
              for (let s = 1; s <= row.seats; s++) {
                seats.push({
                  row_id: rowData.id,
                  seat_number: String(s),
                  x_position: s * 32,
                  y_position: 0,
                  status: "available",
                });
              }
              if (seats.length > 0) {
                await admin.from("seating_seats").insert(seats);
              }
            }
          }
        }

        // For table sections, create rows named after tables
        if (section && sec.tables) {
          for (const table of sec.tables) {
            const { data: rowData } = await admin
              .from("seating_rows")
              .insert({
                section_id: section.id,
                row_label: table.table,
                seat_count: table.seats,
              })
              .select()
              .single();

            if (rowData) {
              const seats = [];
              for (let s = 1; s <= table.seats; s++) {
                seats.push({
                  row_id: rowData.id,
                  seat_number: String(s),
                  x_position: s * 32,
                  y_position: 0,
                  status: "available",
                });
              }
              if (seats.length > 0) {
                await admin.from("seating_seats").insert(seats);
              }
            }
          }
        }
      }
    }
  }

  return NextResponse.json(template, { status: 201 });
}

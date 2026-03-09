import { createAdminClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";

/** GET /api/seating/charts?venue_id=xxx — list charts for a venue */
export async function GET(request: Request) {
  const admin = createAdminClient();
  const { searchParams } = new URL(request.url);
  const venueId = searchParams.get("venue_id");

  let query = admin
    .from("seating_charts")
    .select("*")
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

/** POST /api/seating/charts — create a new seating chart with sections */
export async function POST(request: Request) {
  const admin = createAdminClient();
  const body = await request.json();

  const { name, venue_name, venue_id, chart_data, sections } = body;

  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  // Insert chart
  const { data: chart, error: chartError } = await admin
    .from("seating_charts")
    .insert({
      name,
      venue_name: venue_name || null,
      venue_id: venue_id || null,
      total_sections: Array.isArray(sections) ? sections.length : 0,
      chart_data: chart_data || null,
    })
    .select()
    .single();

  if (chartError || !chart) {
    return NextResponse.json(
      { error: chartError?.message || "Failed to create chart" },
      { status: 500 }
    );
  }

  // Insert sections if provided
  if (Array.isArray(sections) && sections.length > 0) {
    const sectionRows = sections.map(
      (s: {
        section_name: string;
        color?: string;
        price_tier: number;
        row_count: number;
        seats_per_row: number;
      }) => ({
        chart_id: chart.id,
        section_name: s.section_name,
        color: s.color || "#6366f1",
        price_tier: s.price_tier,
        row_count: s.row_count,
        seat_count: s.row_count * s.seats_per_row,
      })
    );

    const { error: secError } = await admin
      .from("seating_sections")
      .insert(sectionRows);

    if (secError) {
      return NextResponse.json(
        { error: secError.message },
        { status: 500 }
      );
    }
  }

  return NextResponse.json(chart, { status: 201 });
}

import { createAdminClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";

/** GET /api/seating/charts/[id] — full chart with sections, rows, seats */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const admin = createAdminClient();

  // Fetch chart
  const { data: chart, error: chartError } = await admin
    .from("seating_charts")
    .select("*")
    .eq("id", id)
    .single();

  if (chartError || !chart) {
    return NextResponse.json({ error: "Chart not found" }, { status: 404 });
  }

  // Fetch sections
  const { data: sections } = await admin
    .from("seating_sections")
    .select("*")
    .eq("chart_id", id)
    .order("section_name");

  // Fetch rows for all sections
  const sectionIds = (sections || []).map((s: { id: string }) => s.id);
  const { data: rows } = sectionIds.length
    ? await admin
        .from("seating_rows")
        .select("*")
        .in("section_id", sectionIds)
        .order("row_label")
    : { data: [] };

  // Fetch seats for all rows
  const rowIds = (rows || []).map((r: { id: string }) => r.id);
  const { data: seats } = rowIds.length
    ? await admin
        .from("seating_seats")
        .select("*")
        .in("row_id", rowIds)
        .order("seat_number")
    : { data: [] };

  // Nest the data
  const rowMap = new Map<string, { id: string; section_id: string; row_label: string; seat_count: number; seats: unknown[] }>();
  for (const r of rows || []) {
    rowMap.set(r.id, { ...r, seats: [] });
  }
  for (const seat of seats || []) {
    const row = rowMap.get(seat.row_id);
    if (row) row.seats.push(seat);
  }
  // Sort seats numerically within each row (seat_number is TEXT, so default order is alphabetical)
  for (const row of rowMap.values()) {
    (row.seats as Array<{ seat_number: string }>).sort(
      (a, b) => parseInt(a.seat_number) - parseInt(b.seat_number)
    );
  }

  const enrichedSections = (sections || []).map((sec: { id: string }) => ({
    ...sec,
    rows: Array.from(rowMap.values()).filter((r) => r.section_id === sec.id),
  }));

  return NextResponse.json({ ...chart, sections: enrichedSections });
}

/** PUT /api/seating/charts/[id] — update chart metadata + sections */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const admin = createAdminClient();
  const body = await request.json();

  const updates: Record<string, unknown> = {};
  if (body.name !== undefined) updates.name = body.name;
  if (body.venue_name !== undefined) updates.venue_name = body.venue_name;
  if (body.chart_data !== undefined) updates.chart_data = body.chart_data;
  if (body.sections !== undefined) updates.total_sections = body.sections.length;
  else if (body.total_sections !== undefined) updates.total_sections = body.total_sections;

  const { data, error } = await admin
    .from("seating_charts")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // If sections are provided, delete old ones (cascades to rows/seats) and re-insert
  if (Array.isArray(body.sections) && body.sections.length > 0) {
    // Delete existing sections (cascade deletes rows and seats)
    const { error: delError } = await admin
      .from("seating_sections")
      .delete()
      .eq("chart_id", id);

    if (delError) {
      return NextResponse.json({ error: delError.message }, { status: 500 });
    }

    // Re-insert updated sections
    const sectionRows = body.sections.map(
      (s: {
        section_name: string;
        color?: string;
        price_tier: number;
        layout_type?: string;
        row_count: number;
        seats_per_row: number;
      }) => ({
        chart_id: id,
        section_name: s.section_name,
        color: s.color || "#6366f1",
        price_tier: s.price_tier,
        layout_type: s.layout_type || "rows",
        row_count: s.row_count,
        seat_count: s.row_count * s.seats_per_row,
      })
    );

    const { error: secError } = await admin
      .from("seating_sections")
      .insert(sectionRows);

    if (secError) {
      return NextResponse.json({ error: secError.message }, { status: 500 });
    }
  }

  return NextResponse.json(data);
}

/** DELETE /api/seating/charts/[id] — delete chart (cascades to sections/rows/seats) */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const admin = createAdminClient();

  const { error } = await admin
    .from("seating_charts")
    .delete()
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}

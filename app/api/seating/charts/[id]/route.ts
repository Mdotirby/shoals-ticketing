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

/** PUT /api/seating/charts/[id] — update chart metadata */
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
  if (body.total_sections !== undefined) updates.total_sections = body.total_sections;

  const { data, error } = await admin
    .from("seating_charts")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
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

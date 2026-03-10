import { createAdminClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";

/**
 * POST /api/seating/charts/[id]/generate-seats
 * Auto-generates rows and seats for all sections in a chart.
 * Clears existing rows/seats first, then regenerates.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const admin = createAdminClient();

  // Fetch sections
  const { data: sections, error: secError } = await admin
    .from("seating_sections")
    .select("*")
    .eq("chart_id", id)
    .order("section_name");

  if (secError || !sections || sections.length === 0) {
    return NextResponse.json(
      { error: "No sections found for this chart" },
      { status: 404 }
    );
  }

  // Delete existing rows (cascades to seats)
  const sectionIds = sections.map((s: { id: string }) => s.id);
  await admin.from("seating_rows").delete().in("section_id", sectionIds);

  let totalSeatsGenerated = 0;
  const SEAT_SPACING_X = 32;
  const ROW_SPACING_Y = 36;

  for (let sIdx = 0; sIdx < sections.length; sIdx++) {
    const section = sections[sIdx];
    const rowCount = section.row_count || 0;
    const seatsPerRow = rowCount > 0 ? Math.floor(section.seat_count / rowCount) : 0;
    const isTable = section.layout_type === "tables";

    if (rowCount === 0 || seatsPerRow === 0) continue;

    // Y offset per section so they stack vertically
    const sectionYOffset = sIdx * (rowCount * ROW_SPACING_Y + 60);

    for (let r = 0; r < rowCount; r++) {
      // Tables use T1, T2, T3... labels; rows use A, B, C...
      const rowLabel = isTable ? `T${r + 1}` : String.fromCharCode(65 + r);

      // Insert the row
      const { data: row, error: rowError } = await admin
        .from("seating_rows")
        .insert({
          section_id: section.id,
          row_label: rowLabel,
          seat_count: seatsPerRow,
        })
        .select()
        .single();

      if (rowError || !row) continue;

      // Generate seats for this row
      const seatRows = [];
      for (let s = 1; s <= seatsPerRow; s++) {
        seatRows.push({
          row_id: row.id,
          seat_number: String(s),
          x_position: s * SEAT_SPACING_X,
          y_position: sectionYOffset + r * ROW_SPACING_Y,
          status: "available",
        });
      }

      const { error: seatError } = await admin
        .from("seating_seats")
        .insert(seatRows);

      if (!seatError) {
        totalSeatsGenerated += seatRows.length;
      }
    }
  }

  return NextResponse.json({
    success: true,
    total_seats_generated: totalSeatsGenerated,
  });
}

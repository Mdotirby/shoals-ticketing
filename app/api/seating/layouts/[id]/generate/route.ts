import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { generateTables, generateRows, generateGA } from "@/lib/seating/generators";

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

/**
 * POST /api/seating/layouts/[id]/generate
 * Generate a section with objects and seats using generator tools.
 *
 * Body: {
 *   section: { name, type, price_cents, color },
 *   generator: "tables" | "rows" | "ga",
 *   params: { ... generator-specific params }
 * }
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: layoutId } = await params;
  const body = await req.json();
  const { section: sectionInput, generator, params: genParams } = body;

  // Verify layout exists
  const { data: layout } = await admin.from("venue_layouts").select("id").eq("id", layoutId).single();
  if (!layout) return NextResponse.json({ error: "Layout not found" }, { status: 404 });

  // 1. Create section
  const { data: section, error: secErr } = await admin.from("sections").insert({
    layout_id: layoutId,
    name: sectionInput.name || "Section",
    type: sectionInput.type || "table",
    price_cents: sectionInput.price_cents || 0,
    color: sectionInput.color || "#6366f1",
  }).select().single();

  if (secErr || !section) {
    return NextResponse.json({ error: "Failed to create section: " + (secErr?.message || "") }, { status: 500 });
  }

  // 2. Generate objects + seats using the selected tool
  let result;
  try {
    switch (generator) {
      case "tables":
        result = generateTables({
          numberOfTables: genParams.number_of_tables || 10,
          seatsPerTable: genParams.seats_per_table || 8,
          tableDiameterInches: genParams.table_diameter_inches || 60,
          spacingFt: genParams.spacing_ft || 3,
          startX: genParams.start_x || 5,
          startY: genParams.start_y || 5,
        });
        break;
      case "rows":
        result = generateRows({
          numberOfRows: genParams.number_of_rows || 10,
          seatsPerRow: genParams.seats_per_row || 20,
          rowSpacingFt: genParams.row_spacing_ft || 3,
          seatSpacingFt: genParams.seat_spacing_ft || 1.8,
          aislePositions: genParams.aisle_positions || [],
          startX: genParams.start_x || 5,
          startY: genParams.start_y || 5,
        });
        break;
      case "ga":
        result = generateGA({
          capacity: genParams.capacity || 100,
          x: genParams.start_x || 5,
          y: genParams.start_y || 5,
          widthFt: genParams.width_ft || 30,
          heightFt: genParams.height_ft || 20,
        });
        break;
      default:
        return NextResponse.json({ error: "Unknown generator: " + generator }, { status: 400 });
    }
  } catch (err) {
    return NextResponse.json({ error: "Generator failed: " + (err instanceof Error ? err.message : "") }, { status: 500 });
  }

  // 3. Insert objects
  const objectIds: string[] = [];
  for (const obj of result.objects) {
    const { data: inserted, error: objErr } = await admin.from("objects").insert({
      section_id: section.id,
      type: obj.type,
      x_ft: obj.x_ft,
      y_ft: obj.y_ft,
      width_ft: obj.width_ft,
      height_ft: obj.height_ft,
      rotation: obj.rotation,
      metadata: obj.metadata,
    }).select("id").single();

    if (objErr || !inserted) {
      console.error("Failed to insert object:", objErr);
      objectIds.push("");
      continue;
    }
    objectIds.push(inserted.id);
  }

  // 4. Insert seats (batch)
  if (result.seats.length > 0) {
    const seatRows = result.seats.map((s) => ({
      section_id: section.id,
      object_id: objectIds[s._objectIndex] || objectIds[0],
      row_label: s.row_label,
      seat_number: s.seat_number,
      x_ft: s.x_ft,
      y_ft: s.y_ft,
      status: "available",
    }));

    const { error: seatErr } = await admin.from("seats").insert(seatRows);
    if (seatErr) {
      console.error("Failed to insert seats:", seatErr);
      return NextResponse.json({
        error: "Section created but seats failed: " + seatErr.message,
        section_id: section.id,
      }, { status: 500 });
    }
  }

  return NextResponse.json({
    success: true,
    section_id: section.id,
    objects_created: result.objects.length,
    seats_created: result.seats.length,
  });
}

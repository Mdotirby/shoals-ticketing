import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

/**
 * POST /api/seating/layouts/quick-save
 * Bulk save a complete Quick Build layout in one request.
 * Accepts: { layout, sections, objects, seats }
 */
export async function POST(req: Request) {
  const body = await req.json();
  const { layout, sections, objects, seats } = body;

  // 1. Create layout
  const { data: layoutRow, error: layoutErr } = await admin.from("venue_layouts").insert({
    name: layout.name || "Quick Build Layout",
    venue_id: layout.venue_id || null,
    room_width_ft: layout.room_width_ft || 100,
    room_height_ft: layout.room_height_ft || 60,
  }).select().single();

  if (layoutErr || !layoutRow) {
    return NextResponse.json({ error: "Failed to create layout: " + (layoutErr?.message || "") }, { status: 500 });
  }

  // 2. Create sections and build ID mapping (_id → real UUID)
  const sectionIdMap = new Map<string, string>();
  for (const sec of sections) {
    const { data: secRow, error: secErr } = await admin.from("sections").insert({
      layout_id: layoutRow.id,
      name: sec.name,
      type: sec.type,
      price_cents: sec.price_cents || 0,
      color: sec.color || "#6366f1",
    }).select().single();

    if (secErr || !secRow) {
      console.error("Section insert failed:", secErr);
      continue;
    }
    sectionIdMap.set(sec._id, secRow.id);
  }

  // 3. Create objects and build ID mapping
  const objectIdMap = new Map<string, string>();
  for (const obj of objects) {
    const realSectionId = sectionIdMap.get(obj._sectionId);
    if (!realSectionId) continue;

    const { data: objRow, error: objErr } = await admin.from("objects").insert({
      section_id: realSectionId,
      type: obj.type,
      x_ft: obj.x_ft,
      y_ft: obj.y_ft,
      width_ft: obj.width_ft,
      height_ft: obj.height_ft,
      rotation: obj.rotation || 0,
      metadata: obj.metadata || {},
    }).select().single();

    if (objErr || !objRow) {
      console.error("Object insert failed:", objErr);
      continue;
    }
    objectIdMap.set(obj._id, objRow.id);
  }

  // 4. Batch insert seats
  if (seats.length > 0) {
    const seatRows = seats
      .map((s: { _sectionId: string; _objectId: string; row_label: string; seat_number: number; x_ft: number; y_ft: number }) => {
        const realSectionId = sectionIdMap.get(s._sectionId);
        const realObjectId = objectIdMap.get(s._objectId);
        if (!realSectionId || !realObjectId) return null;
        return {
          section_id: realSectionId,
          object_id: realObjectId,
          row_label: s.row_label,
          seat_number: s.seat_number,
          x_ft: s.x_ft,
          y_ft: s.y_ft,
          status: "available",
        };
      })
      .filter(Boolean);

    // Insert in batches of 200 to avoid payload limits
    for (let i = 0; i < seatRows.length; i += 200) {
      const batch = seatRows.slice(i, i + 200);
      const { error: seatErr } = await admin.from("seats").insert(batch);
      if (seatErr) {
        console.error("Seat batch insert failed:", seatErr);
        return NextResponse.json({
          error: "Layout created but some seats failed: " + seatErr.message,
          layout_id: layoutRow.id,
        }, { status: 500 });
      }
    }
  }

  return NextResponse.json({
    success: true,
    layout_id: layoutRow.id,
    sections_created: sectionIdMap.size,
    objects_created: objectIdMap.size,
    seats_created: seats.length,
  });
}

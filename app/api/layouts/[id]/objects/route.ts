import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/** POST /api/layouts/[id]/objects — bulk upsert layout objects (save all) */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: layoutId } = await params;
  const body = await req.json();
  const { objects } = body;

  if (!Array.isArray(objects)) {
    return NextResponse.json({ error: "objects array required" }, { status: 400 });
  }

  // Delete all existing objects for this layout
  await admin.from("layout_objects").delete().eq("layout_id", layoutId);

  if (objects.length === 0) {
    return NextResponse.json({ success: true, count: 0 });
  }

  // Insert all objects — positions/dimensions in feet
  const rows = objects.map((obj: Record<string, unknown>) => ({
    id: obj.id,
    layout_id: layoutId,
    type: obj.type,
    x: obj.x,
    y: obj.y,
    width: obj.width,
    height: obj.height,
    diameter_inches: obj.diameter_inches || 0,
    width_ft: obj.width || 0,
    height_ft: obj.height || 0,
    rotation: obj.rotation || 0,
    label: obj.label || "",
    capacity: obj.capacity || 0,
    seat_count: obj.seat_count || 0,
    price_tier: obj.price_tier || "standard",
    color: obj.color || "#6366f1",
    metadata: obj.metadata || {},
  }));

  const { error } = await admin.from("layout_objects").insert(rows);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, count: rows.length });
}

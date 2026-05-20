import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

/**
 * POST /api/seating/layouts/[id]/stage
 * Add a stage object to a layout. Creates a dedicated "stage" section
 * (type = "stage", price = 0) then inserts the stage object into it.
 *
 * Body: { label?, width_ft?, height_ft?, x_ft?, y_ft? }
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: layoutId } = await params;
  const body = await req.json();

  const label = body.label || "STAGE";
  const width_ft = body.width_ft || 30;
  const height_ft = body.height_ft || 10;
  const x_ft = body.x_ft ?? 10;
  const y_ft = body.y_ft ?? 2;

  const { data: layout } = await admin.from("venue_layouts").select("id").eq("id", layoutId).single();
  if (!layout) return NextResponse.json({ error: "Layout not found" }, { status: 404 });

  // Create a stage section (type "stage", no price, gray color)
  const { data: section, error: secErr } = await admin.from("sections").insert({
    layout_id: layoutId,
    name: label,
    type: "stage",
    price_cents: 0,
    color: "#71717a",
  }).select().single();

  if (secErr || !section) {
    return NextResponse.json({ error: "Failed to create stage section: " + (secErr?.message || "") }, { status: 500 });
  }

  // Insert the stage object
  const { data: object, error: objErr } = await admin.from("objects").insert({
    section_id: section.id,
    type: "stage",
    x_ft,
    y_ft,
    width_ft,
    height_ft,
    rotation: 0,
    metadata: { label },
  }).select().single();

  if (objErr || !object) {
    await admin.from("sections").delete().eq("id", section.id);
    return NextResponse.json({ error: "Failed to create stage object: " + (objErr?.message || "") }, { status: 500 });
  }

  return NextResponse.json({ success: true, section_id: section.id, object_id: object.id });
}

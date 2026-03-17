import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/** GET /api/layouts/[id] — get layout with all objects */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const { data: layout, error: layoutError } = await admin
    .from("venue_layouts")
    .select("*")
    .eq("id", id)
    .single();

  if (layoutError || !layout) {
    return NextResponse.json({ error: "Layout not found" }, { status: 404 });
  }

  const { data: objects } = await admin
    .from("layout_objects")
    .select("*")
    .eq("layout_id", id)
    .order("created_at");

  return NextResponse.json({ ...layout, objects: objects || [] });
}

/** PUT /api/layouts/[id] — update layout metadata */
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.name !== undefined) updates.name = body.name;
  if (body.background_image_url !== undefined) updates.background_image_url = body.background_image_url;
  if (body.canvas_width !== undefined) updates.canvas_width = body.canvas_width;
  if (body.canvas_height !== undefined) updates.canvas_height = body.canvas_height;
  if (body.room_width_ft !== undefined) updates.room_width_ft = body.room_width_ft;
  if (body.room_height_ft !== undefined) updates.room_height_ft = body.room_height_ft;
  if (body.scale_pixels_per_foot !== undefined) updates.scale_pixels_per_foot = body.scale_pixels_per_foot;

  const { data, error } = await admin
    .from("venue_layouts")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

/** DELETE /api/layouts/[id] — delete layout and all objects */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const { error } = await admin
    .from("venue_layouts")
    .delete()
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

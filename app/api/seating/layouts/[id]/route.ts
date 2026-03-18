import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

/** GET /api/seating/layouts/[id] — full layout with sections, objects, seats */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const { data: layout, error } = await admin.from("venue_layouts").select("*").eq("id", id).single();
  if (error || !layout) return NextResponse.json({ error: "Layout not found" }, { status: 404 });

  const { data: sections } = await admin.from("sections").select("*").eq("layout_id", id).order("created_at");
  const sectionIds = (sections || []).map((s: { id: string }) => s.id);

  const { data: objects } = sectionIds.length
    ? await admin.from("objects").select("*").in("section_id", sectionIds).order("created_at")
    : { data: [] };

  const { data: seats } = sectionIds.length
    ? await admin.from("seats").select("*").in("section_id", sectionIds).order("seat_number")
    : { data: [] };

  // Nest objects and seats under sections
  const enriched = (sections || []).map((sec: { id: string }) => ({
    ...sec,
    objects: (objects || []).filter((o: { section_id: string }) => o.section_id === sec.id),
    seats: (seats || []).filter((s: { section_id: string }) => s.section_id === sec.id),
  }));

  return NextResponse.json({ ...layout, sections: enriched });
}

/** PUT /api/seating/layouts/[id] */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const updates: Record<string, unknown> = {};
  if (body.name !== undefined) updates.name = body.name;
  if (body.room_width_ft !== undefined) updates.room_width_ft = body.room_width_ft;
  if (body.room_height_ft !== undefined) updates.room_height_ft = body.room_height_ft;

  const { data, error } = await admin.from("venue_layouts").update(updates).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

/** DELETE /api/seating/layouts/[id] — cascades */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await admin.from("venue_layouts").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

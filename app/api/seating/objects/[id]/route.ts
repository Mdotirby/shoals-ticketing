import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

/**
 * PUT /api/seating/objects/[id]
 * Move an object and cascade-shift all its seats by the same delta.
 * Also accepts width_ft, height_ft, metadata updates (for stage resize/relabel).
 */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();

  // Fetch current object to compute delta
  const { data: current, error: fetchErr } = await admin
    .from("objects")
    .select("x_ft, y_ft, width_ft, height_ft")
    .eq("id", id)
    .single();

  if (fetchErr || !current) {
    return NextResponse.json({ error: "Object not found" }, { status: 404 });
  }

  const updates: Record<string, unknown> = {};
  if (body.x_ft !== undefined) updates.x_ft = body.x_ft;
  if (body.y_ft !== undefined) updates.y_ft = body.y_ft;
  if (body.width_ft !== undefined) updates.width_ft = body.width_ft;
  if (body.height_ft !== undefined) updates.height_ft = body.height_ft;
  if (body.metadata !== undefined) updates.metadata = body.metadata;

  const { data: updated, error: objErr } = await admin
    .from("objects")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (objErr) return NextResponse.json({ error: objErr.message }, { status: 500 });

  // Cascade seat positions if x or y changed
  const dx = (body.x_ft ?? current.x_ft) - current.x_ft;
  const dy = (body.y_ft ?? current.y_ft) - current.y_ft;

  if (dx !== 0 || dy !== 0) {
    // Fetch seats for this object, shift each one
    const { data: seats } = await admin.from("seats").select("id, x_ft, y_ft").eq("object_id", id);
    if (seats && seats.length > 0) {
      const shifted = seats.map((s: { id: string; x_ft: number; y_ft: number }) => ({
        id: s.id,
        x_ft: parseFloat((s.x_ft + dx).toFixed(4)),
        y_ft: parseFloat((s.y_ft + dy).toFixed(4)),
      }));
      // Upsert shifted positions
      const { error: seatErr } = await admin.from("seats").upsert(shifted);
      if (seatErr) {
        console.error("Failed to shift seats:", seatErr);
        return NextResponse.json({ error: "Object moved but seats failed to shift: " + seatErr.message }, { status: 500 });
      }
    }
  }

  return NextResponse.json({ success: true, object: updated });
}

/** DELETE /api/seating/objects/[id] — delete object and its seats */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // Seats cascade via FK, so just delete the object
  const { error } = await admin.from("objects").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

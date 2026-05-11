import { createAdminClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";

type Params = { params: Promise<{ id: string; packageId: string }> };

const ALLOWED = new Set([
  "name", "description", "deliverables", "price", "term",
  "start_date", "end_date", "status", "notes", "venue_id",
]);

// PUT: update a package
export async function PUT(req: Request, { params }: Params) {
  const { id: sponsorId, packageId } = await params;
  const admin = createAdminClient();
  const body = await req.json();

  const updates: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    if (ALLOWED.has(k)) updates[k] = v;
  }

  const { data, error } = await admin
    .from("sponsor_packages")
    .update(updates)
    .eq("id", packageId)
    .eq("sponsor_id", sponsorId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// DELETE: remove a package
export async function DELETE(_req: Request, { params }: Params) {
  const { id: sponsorId, packageId } = await params;
  const admin = createAdminClient();

  const { error } = await admin
    .from("sponsor_packages")
    .delete()
    .eq("id", packageId)
    .eq("sponsor_id", sponsorId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ deleted: true });
}

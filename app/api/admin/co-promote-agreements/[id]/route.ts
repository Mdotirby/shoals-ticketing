import { createAdminClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";

/**
 * GET    /api/admin/co-promote-agreements/[id] — fetch single agreement
 * PATCH  /api/admin/co-promote-agreements/[id] — update fields
 * DELETE /api/admin/co-promote-agreements/[id] — delete agreement
 */

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("co_promote_agreements")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Agreement not found" }, { status: 404 });
  }

  return NextResponse.json(data);
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Strip immutable fields
  delete body.id;
  delete body.created_at;
  delete body.updated_at;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("co_promote_agreements")
    .update(body)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const admin = createAdminClient();

  const { error } = await admin
    .from("co_promote_agreements")
    .delete()
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

import { createAdminClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// GET: List attachments for event
export async function GET(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const { eventId } = await params;
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("private_event_attachments")
    .select("*")
    .eq("event_id", eventId)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}

// POST: Create attachment record
export async function POST(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const { eventId } = await params;
  const admin = createAdminClient();
  const body = await request.json();

  const { data, error } = await admin
    .from("private_event_attachments")
    .insert({
      event_id: eventId,
      file_url: body.file_url,
      file_name: body.file_name,
      file_type: body.file_type || "application/pdf",
      uploaded_by: body.uploaded_by || null,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}

// DELETE: Delete attachment by id (passed as query param)
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> }
) {
  await params; // consume params
  const { searchParams } = new URL(request.url);
  const attachmentId = searchParams.get("id");

  if (!attachmentId) {
    return NextResponse.json({ error: "Missing attachment id" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { error } = await admin
    .from("private_event_attachments")
    .delete()
    .eq("id", attachmentId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ deleted: true });
}

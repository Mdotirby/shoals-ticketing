import { createAdminClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";

// PUT /api/faqs/[id] — update question, answer, or sort_order
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const admin = createAdminClient();
  const body = await request.json();

  const { data, error } = await admin
    .from("venue_faqs")
    .update({
      question:   body.question,
      answer:     body.answer,
      sort_order: body.sort_order ?? 0,
    })
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data, { status: 200 });
}

// DELETE /api/faqs/[id]
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const admin = createAdminClient();

  const { error } = await admin.from("venue_faqs").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ deleted: true }, { status: 200 });
}

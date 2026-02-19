import { createAdminClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";

// GET /api/settlements/:id/deposits — list deposits for settlement
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("settlement_deposits")
    .select("*")
    .eq("settlement_id", id)
    .order("date", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}

// POST /api/settlements/:id/deposits — add deposit
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const admin = createAdminClient();
  const body = await request.json();

  const { data, error } = await admin
    .from("settlement_deposits")
    .insert({
      settlement_id: id,
      type: body.type || "deposit",
      amount: body.amount ?? 0,
      date: body.date || null,
      notes: body.notes || null,
      receipt_url: body.receipt_url || null,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}

// DELETE /api/settlements/:id/deposits — remove deposit (requires ?deposit_id=)
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const admin = createAdminClient();
  const { searchParams } = new URL(request.url);
  const depositId = searchParams.get("deposit_id");

  if (!depositId) {
    return NextResponse.json(
      { error: "deposit_id query param is required" },
      { status: 400 }
    );
  }

  const { error } = await admin
    .from("settlement_deposits")
    .delete()
    .eq("id", depositId)
    .eq("settlement_id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ deleted: true });
}

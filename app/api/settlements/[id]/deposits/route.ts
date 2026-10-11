import { createAdminClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth/can";

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

// PUT /api/settlements/:id/deposits — update a deposit (requires deposit_id in
// body). Without this, edits to a row lived only in the page: the settlement's
// deposit_paid total saved, but the row kept the offer's pre-filled amount and
// won again on the next load.
const DEPOSIT_FIELDS = ["type", "amount", "date", "notes", "receipt_url"] as const;

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireCapability("view_settlement", { write: true });
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const admin = createAdminClient();
  const body = await request.json();

  if (!body.deposit_id) {
    return NextResponse.json(
      { error: "deposit_id is required" },
      { status: 400 }
    );
  }

  const updates: Record<string, unknown> = {};
  for (const k of DEPOSIT_FIELDS) if (k in body) updates[k] = body[k];
  if ("amount" in updates) updates.amount = Number(updates.amount) || 0;
  if (updates.date === "") updates.date = null;

  const { data, error } = await admin
    .from("settlement_deposits")
    .update(updates)
    .eq("id", body.deposit_id)
    .eq("settlement_id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
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

import { createAdminClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";

// GET /api/settlements/:id/expenses — list expenses for settlement
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("settlement_expenses")
    .select("*")
    .eq("settlement_id", id)
    .order("sort_order", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}

// POST /api/settlements/:id/expenses — add expense
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const admin = createAdminClient();
  const body = await request.json();

  const { data, error } = await admin
    .from("settlement_expenses")
    .insert({
      settlement_id: id,
      name: body.name,
      category: body.category || "fixed",
      estimated_amount: body.estimated_amount ?? 0,
      actual_amount: body.actual_amount ?? 0,
      rate: body.rate ?? 0,
      receipt_url: body.receipt_url || null,
      notes: body.notes || null,
      sort_order: body.sort_order ?? 0,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}

// PUT /api/settlements/:id/expenses — update expense (requires expense_id in body)
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const admin = createAdminClient();
  const body = await request.json();

  if (!body.expense_id) {
    return NextResponse.json(
      { error: "expense_id is required" },
      { status: 400 }
    );
  }

  const {
    expense_id,
    settlement_id: _sid,
    id: _id,
    ...updates
  } = body;

  const { data, error } = await admin
    .from("settlement_expenses")
    .update(updates)
    .eq("id", expense_id)
    .eq("settlement_id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

// DELETE /api/settlements/:id/expenses — remove expense (requires ?expense_id=)
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const admin = createAdminClient();
  const { searchParams } = new URL(request.url);
  const expenseId = searchParams.get("expense_id");

  if (!expenseId) {
    return NextResponse.json(
      { error: "expense_id query param is required" },
      { status: 400 }
    );
  }

  const { error } = await admin
    .from("settlement_expenses")
    .delete()
    .eq("id", expenseId)
    .eq("settlement_id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ deleted: true });
}

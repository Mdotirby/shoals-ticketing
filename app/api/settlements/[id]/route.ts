import { createAdminClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";

// GET /api/settlements/:id — single settlement with expenses and deposits
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const admin = createAdminClient();

  const [settlementRes, expensesRes, depositsRes] = await Promise.all([
    admin.from("settlements").select("*").eq("id", id).single(),
    admin
      .from("settlement_expenses")
      .select("*")
      .eq("settlement_id", id)
      .order("sort_order", { ascending: true }),
    admin
      .from("settlement_deposits")
      .select("*")
      .eq("settlement_id", id)
      .order("date", { ascending: true }),
  ]);

  if (settlementRes.error) {
    return NextResponse.json(
      { error: settlementRes.error.message },
      { status: settlementRes.error.code === "PGRST116" ? 404 : 500 }
    );
  }

  return NextResponse.json({
    ...settlementRes.data,
    expenses: expensesRes.data ?? [],
    deposits: depositsRes.data ?? [],
  });
}

// PUT /api/settlements/:id — update settlement fields
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const admin = createAdminClient();
  const body = await request.json();

  // Strip immutable fields
  const {
    id: _id,
    created_at: _ca,
    event_id: _eid,
    venue_id: _vid,
    ...updates
  } = body;

  // If finalizing, set finalized_at
  if (updates.status === "finalized" && !updates.finalized_at) {
    updates.finalized_at = new Date().toISOString();
  }

  const { data, error } = await admin
    .from("settlements")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

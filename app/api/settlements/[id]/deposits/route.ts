import { createAdminClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth/can";

/**
 * Deposits and cash advances against one settlement — money paid to the artist
 * before the night, which the settlement then deducts from the walkout.
 *
 * AUTH: every handler checks view_settlement. GET, POST and DELETE used to
 * check nothing at all, while using the service-role client that bypasses RLS
 * — middleware.ts skips everything under /api/, so nothing else was guarding
 * them either. Anyone who knew a settlement id could read the deposits on it,
 * add a row, or delete one, and a deposit is a deduction from what the artist
 * is owed. Only PUT had a guard. See lib/auth/can.ts for the wider fix this
 * belongs to.
 *
 * method/reference/paid_by come from plans/settlement-payments-migration.sql.
 * Writes peel them off and retry if that has not been run, so saves keep
 * working either way — PostgREST fails the WHOLE statement on one unknown
 * column, so an un-migrated database would otherwise reject every edit,
 * including the ones to columns that do exist.
 */

const BASE_FIELDS = ["type", "amount", "date", "notes", "receipt_url"] as const;
/** Added by plans/settlement-payments-migration.sql. */
const NEW_FIELDS = ["method", "reference", "paid_by"] as const;
const DEPOSIT_FIELDS = [...BASE_FIELDS, ...NEW_FIELDS] as const;

function isUnknownColumn(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  // 42703 = undefined_column; PostgREST also reports it in prose.
  return err.code === "42703" || /column .* does not exist|Could not find the '.*' column/i.test(err.message || "");
}

// GET /api/settlements/:id/deposits — list deposits for settlement
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireCapability("view_settlement");
  if (!guard.ok) return guard.response;

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
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireCapability("view_settlement", { write: true });
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const admin = createAdminClient();
  const body = await request.json().catch(() => ({}));

  const row: Record<string, unknown> = {
    settlement_id: id,
    type: body.type || "deposit",
    amount: Math.round((Number(body.amount) || 0) * 100) / 100,
    date: body.date || null,
    notes: body.notes || null,
    receipt_url: body.receipt_url || null,
    method: body.method || null,
    reference: body.reference?.trim() || null,
    paid_by: body.paid_by || null,
  };

  let { data, error } = await admin.from("settlement_deposits").insert(row).select().single();

  if (isUnknownColumn(error)) {
    for (const k of NEW_FIELDS) delete row[k];
    ({ data, error } = await admin.from("settlement_deposits").insert(row).select().single());
  }

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}

// PUT /api/settlements/:id/deposits — update a deposit (requires deposit_id in
// body). Without this, edits to a row lived only in the page: the settlement's
// deposit_paid total saved, but the row kept the offer's pre-filled amount and
// won again on the next load.
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireCapability("view_settlement", { write: true });
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const admin = createAdminClient();
  const body = await request.json().catch(() => ({}));

  if (!body.deposit_id) {
    return NextResponse.json(
      { error: "deposit_id is required" },
      { status: 400 }
    );
  }

  const updates: Record<string, unknown> = {};
  for (const k of DEPOSIT_FIELDS) if (k in body) updates[k] = body[k];
  if ("amount" in updates) updates.amount = Math.round((Number(updates.amount) || 0) * 100) / 100;
  if (updates.date === "") updates.date = null;

  const run = () =>
    admin
      .from("settlement_deposits")
      .update(updates)
      .eq("id", body.deposit_id)
      .eq("settlement_id", id)
      .select()
      .single();

  let { data, error } = await run();

  if (isUnknownColumn(error)) {
    let peeled = false;
    for (const k of NEW_FIELDS) if (k in updates) { delete updates[k]; peeled = true; }
    // Nothing left to write once the new fields are gone: report it rather
    // than firing an empty update that would look like a success.
    if (!peeled || Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: "Run plans/settlement-payments-migration.sql to record a payment method." },
        { status: 409 },
      );
    }
    ({ data, error } = await run());
  }

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

// DELETE /api/settlements/:id/deposits — remove deposit (requires ?deposit_id=)
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireCapability("view_settlement", { write: true });
  if (!guard.ok) return guard.response;

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

import { createAdminClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth/can";

/**
 * Payments made to the artist against one settlement — a list, not a column.
 *
 * settlements.payout_* held exactly one, and the screen hard-wired its amount
 * to the whole balance due, so a show paid in two instalments had nowhere to
 * say so and correcting a payout meant clearing it. See
 * plans/settlement-payments-migration.sql.
 *
 * Nothing here moves money. Each row records a payment made elsewhere, by ACH,
 * cheque or cash.
 *
 * Before that migration is run the table does not exist. Rather than 500, GET
 * answers `{ migrated: false, payouts: [] }` and the screen falls back to the
 * old single-payout card, so this ships without waiting on the SQL.
 */

/** PostgREST's code for "no such table", and its message, which varies. */
function isMissingTable(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  return err.code === "42P01" || /Could not find the table/i.test(err.message || "");
}

const CENTS = (v: unknown) => Math.round((Number(v) || 0) * 100) / 100;

type Payout = {
  id: string;
  amount: number;
  method: string | null;
  reference: string | null;
  paid_at: string;
  paid_by: string | null;
  notes: string | null;
};

// GET /api/settlements/:id/payouts
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireCapability("view_settlement");
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("settlement_payouts")
    .select("id, amount, method, reference, paid_at, paid_by, notes")
    .eq("settlement_id", id)
    .order("paid_at", { ascending: true });

  if (isMissingTable(error)) return NextResponse.json({ migrated: false, payouts: [] });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const payouts = (data ?? []) as Payout[];
  const total = payouts.reduce((s, p) => s + (Number(p.amount) || 0), 0);
  return NextResponse.json({ migrated: true, payouts, total: CENTS(total) });
}

// POST /api/settlements/:id/payouts — record one payment
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireCapability("view_settlement", { write: true });
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const admin = createAdminClient();
  const body = await request.json().catch(() => ({}));

  const amount = CENTS(body.amount);
  if (!(amount > 0)) {
    return NextResponse.json({ error: "A payout needs an amount above zero." }, { status: 400 });
  }

  const { data, error } = await admin
    .from("settlement_payouts")
    .insert({
      settlement_id: id,
      amount,
      method: body.method || null,
      reference: body.reference?.trim() || null,
      // Lets a payment be dated when it actually left, not when it was typed in.
      paid_at: body.paid_at || new Date().toISOString(),
      paid_by: body.paid_by || null,
      notes: body.notes?.trim() || null,
    })
    .select("id, amount, method, reference, paid_at, paid_by, notes")
    .single();

  if (isMissingTable(error)) {
    return NextResponse.json(
      { error: "Run plans/settlement-payments-migration.sql before recording more than one payout." },
      { status: 409 },
    );
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data, { status: 201 });
}

const PAYOUT_FIELDS = ["amount", "method", "reference", "paid_at", "paid_by", "notes"] as const;

// PUT /api/settlements/:id/payouts — correct one (payout_id in the body)
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireCapability("view_settlement", { write: true });
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const admin = createAdminClient();
  const body = await request.json().catch(() => ({}));

  if (!body.payout_id) {
    return NextResponse.json({ error: "payout_id is required" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  for (const k of PAYOUT_FIELDS) if (k in body) updates[k] = body[k];
  if ("amount" in updates) updates.amount = CENTS(updates.amount);
  if (updates.paid_at === "") delete updates.paid_at; // NOT NULL — leave it alone

  const { data, error } = await admin
    .from("settlement_payouts")
    .update(updates)
    .eq("id", body.payout_id)
    // Scoped to the settlement in the path, so an id from another show cannot
    // be edited through this one.
    .eq("settlement_id", id)
    .select("id, amount, method, reference, paid_at, paid_by, notes")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// DELETE /api/settlements/:id/payouts?payout_id=…
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireCapability("view_settlement", { write: true });
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const admin = createAdminClient();
  const payoutId = new URL(request.url).searchParams.get("payout_id");

  if (!payoutId) {
    return NextResponse.json({ error: "payout_id query param is required" }, { status: 400 });
  }

  const { error } = await admin
    .from("settlement_payouts")
    .delete()
    .eq("id", payoutId)
    .eq("settlement_id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ deleted: true });
}

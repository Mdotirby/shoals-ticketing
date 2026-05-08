import { createAdminClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";

type Params = { params: Promise<{ eventId: string; proposalId: string }> };

// GET: single quote
export async function GET(_req: Request, { params }: Params) {
  const { eventId, proposalId } = await params;
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("private_event_proposals")
    .select("*")
    .eq("id", proposalId)
    .eq("event_id", eventId)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 404 });
  return NextResponse.json(data);
}

// PUT: update quote (line items, terms, status)
export async function PUT(req: Request, { params }: Params) {
  const { eventId, proposalId } = await params;
  const admin = createAdminClient();
  const body = await req.json();

  const ALLOWED = new Set([
    "line_items", "subtotal", "tax_rate", "tax_amount", "total",
    "notes", "terms", "valid_until", "status",
    "deposit_pct", "deposit_amount", "deposit_due",
    "balance_due_date", "cancellation_policy", "event_type_label",
    "client_name", "client_email", "client_phone", "client_company",
    "version",
  ]);

  const updates: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    if (ALLOWED.has(k)) updates[k] = v;
  }

  const { data, error } = await admin
    .from("private_event_proposals")
    .update(updates)
    .eq("id", proposalId)
    .eq("event_id", eventId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// DELETE: remove quote
export async function DELETE(_req: Request, { params }: Params) {
  const { eventId, proposalId } = await params;
  const admin = createAdminClient();

  const { error } = await admin
    .from("private_event_proposals")
    .delete()
    .eq("id", proposalId)
    .eq("event_id", eventId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ deleted: true });
}

import { createAdminClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// GET: Get invoice detail with payments
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const admin = createAdminClient();

  const { data: invoice, error } = await admin
    .from("invoices")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: error.code === "PGRST116" ? 404 : 500 }
    );
  }

  // Fetch payments for this invoice
  const { data: payments } = await admin
    .from("invoice_payments")
    .select("*")
    .eq("invoice_id", id)
    .order("received_at", { ascending: false });

  return NextResponse.json({ ...invoice, payments: payments ?? [] });
}

// PUT: Update invoice
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const admin = createAdminClient();
  const body = await request.json();

  const updates: Record<string, unknown> = {};

  if (body.client_name !== undefined) updates.client_name = body.client_name;
  if (body.client_email !== undefined) updates.client_email = body.client_email;
  if (body.client_phone !== undefined) updates.client_phone = body.client_phone;
  if (body.client_company !== undefined) updates.client_company = body.client_company;
  if (body.client_address !== undefined) updates.client_address = body.client_address;
  if (body.line_items !== undefined) updates.line_items = body.line_items;
  if (body.subtotal !== undefined) updates.subtotal = body.subtotal;
  if (body.tax_rate !== undefined) updates.tax_rate = body.tax_rate;
  if (body.tax_amount !== undefined) updates.tax_amount = body.tax_amount;
  if (body.total !== undefined) updates.total = body.total;
  if (body.amount_paid !== undefined) updates.amount_paid = body.amount_paid;
  if (body.balance_due !== undefined) updates.balance_due = body.balance_due;
  if (body.due_date !== undefined) updates.due_date = body.due_date;
  if (body.status !== undefined) updates.status = body.status;
  if (body.stripe_payment_link !== undefined) updates.stripe_payment_link = body.stripe_payment_link;
  if (body.sent_at !== undefined) updates.sent_at = body.sent_at;
  if (body.paid_at !== undefined) updates.paid_at = body.paid_at;

  updates.updated_at = new Date().toISOString();

  const { data, error } = await admin
    .from("invoices")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

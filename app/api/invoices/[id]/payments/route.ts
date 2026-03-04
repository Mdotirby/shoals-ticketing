import { createAdminClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// GET: List payments for an invoice
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("invoice_payments")
    .select("*")
    .eq("invoice_id", id)
    .order("received_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}

// POST: Record a manual payment
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const admin = createAdminClient();
  const body = await request.json();

  // Fetch invoice to get venue_id and current amounts
  const { data: invoice, error: invoiceError } = await admin
    .from("invoices")
    .select("*")
    .eq("id", id)
    .single();

  if (invoiceError || !invoice) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  }

  const amount = Number(body.amount);
  if (!amount || amount <= 0) {
    return NextResponse.json({ error: "Invalid payment amount" }, { status: 400 });
  }

  // Create payment record
  const payment = {
    invoice_id: id,
    venue_id: invoice.venue_id,
    amount,
    payment_method: body.payment_method ?? "other",
    type: body.type ?? "payment",
    notes: body.notes ?? "",
    received_at: body.received_at ?? new Date().toISOString(),
  };

  const { data: paymentData, error: paymentError } = await admin
    .from("invoice_payments")
    .insert(payment)
    .select()
    .single();

  if (paymentError) {
    return NextResponse.json({ error: paymentError.message }, { status: 500 });
  }

  // Update invoice totals
  const newAmountPaid = Number(invoice.amount_paid || 0) + amount;
  const newBalanceDue = Number(invoice.total) - newAmountPaid;
  const newStatus = newBalanceDue <= 0 ? "paid" : newAmountPaid > 0 ? "partial" : invoice.status;

  await admin
    .from("invoices")
    .update({
      amount_paid: newAmountPaid,
      balance_due: Math.max(0, newBalanceDue),
      status: newStatus,
      ...(newStatus === "paid" ? { paid_at: new Date().toISOString() } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  return NextResponse.json(paymentData, { status: 201 });
}

import { createAdminClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth/can";

export const dynamic = "force-dynamic";

/**
 * AUTH ON /api/invoices — the split matters.
 *
 * This whole namespace was unauthenticated on the service-role client. The
 * LIST returns every client's name, email, phone, billing address and balance
 * for the venue; that is staff-only and now says so.
 *
 * GET /api/invoices/[id] stays PUBLIC by design: /pay/[invoiceId] is the page
 * a client opens from an emailed link to pay, and it has no session. The id is
 * a UUID and functions as the bearer token for that one invoice — the same
 * shape as a ticket QR. Guarding it would break every outstanding payment
 * link.
 */
// GET: List invoices, filterable by event_id, status, venue_id
export async function GET(request: Request) {
  const guard = await requireStaff();
  if (!guard.ok) return guard.response;

  const { searchParams } = new URL(request.url);
  const eventId = searchParams.get("event_id");
  const status = searchParams.get("status");
  const venueId = searchParams.get("venue_id");

  const admin = createAdminClient();

  let query = admin
    .from("invoices")
    .select("*")
    .order("created_at", { ascending: false });

  if (eventId) query = query.eq("event_id", eventId);
  if (status) query = query.eq("status", status);
  if (venueId) query = query.eq("venue_id", venueId);

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}

// POST: Create a new invoice
export async function POST(request: Request) {
  const guard = await requireStaff();
  if (!guard.ok) return guard.response;

  const admin = createAdminClient();
  const body = await request.json();

  if (!body.event_id || !body.venue_id) {
    return NextResponse.json({ error: "event_id and venue_id are required" }, { status: 400 });
  }

  // Generate invoice number: INV-YYYY-XXXX
  const year = new Date().getFullYear();
  const { count } = await admin
    .from("invoices")
    .select("id", { count: "exact", head: true })
    .eq("venue_id", body.venue_id);

  const seq = String((count ?? 0) + 1).padStart(4, "0");
  const invoice_number = `INV-${year}-${seq}`;

  // Calculate totals
  const lineItems = body.line_items ?? [];
  const subtotal = lineItems.reduce((sum: number, item: { amount: number }) => sum + (item.amount || 0), 0);
  const taxRate = body.tax_rate ?? 0;
  const taxAmount = subtotal * taxRate;
  const total = subtotal + taxAmount;

  // Due date default: 30 days from now
  const dueDate = body.due_date ?? (() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d.toISOString().split("T")[0];
  })();

  const invoice = {
    invoice_number,
    event_id: body.event_id,
    venue_id: body.venue_id,
    client_name: body.client_name ?? "",
    client_email: body.client_email ?? "",
    client_phone: body.client_phone ?? "",
    client_company: body.client_company ?? "",
    client_address: body.client_address ?? "",
    line_items: lineItems,
    subtotal,
    tax_rate: taxRate,
    tax_amount: taxAmount,
    total,
    amount_paid: body.amount_paid ?? 0,
    balance_due: total - (body.amount_paid ?? 0),
    due_date: dueDate,
    status: body.status ?? "draft",
  };

  const { data, error } = await admin
    .from("invoices")
    .insert(invoice)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}

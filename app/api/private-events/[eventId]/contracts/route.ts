import { createAdminClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// GET: List rental contracts for a private event
export async function GET(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const { eventId } = await params;
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("rental_contracts")
    .select("*")
    .eq("event_id", eventId)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}

// POST: Create a new rental contract for a private event
export async function POST(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const { eventId } = await params;
  const admin = createAdminClient();
  const body = await request.json();

  // Fetch the event
  const { data: event, error: eventError } = await admin
    .from("events")
    .select("id, venue_id, title, date, venue, contact_name, contact_email, contact_phone, event_type")
    .eq("id", eventId)
    .single();

  if (eventError || !event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  if (event.event_type !== "private") {
    return NextResponse.json({ error: "Event is not a private event" }, { status: 400 });
  }

  // Generate contract number: RC-YYYY-XXXX
  const year = new Date().getFullYear();
  const { count } = await admin
    .from("rental_contracts")
    .select("id", { count: "exact", head: true })
    .eq("venue_id", event.venue_id);

  const seq = String((count ?? 0) + 1).padStart(4, "0");
  const contract_number = `RC-${year}-${seq}`;

  // Calculate totals
  const lineItems = body.line_items ?? [];
  const subtotal = lineItems.reduce((sum: number, item: { amount: number }) => sum + (item.amount || 0), 0);
  const taxRate = body.tax_rate ?? 0;
  const taxAmount = subtotal * taxRate;
  const total = subtotal + taxAmount;

  // Deposit
  const depositPercent = body.deposit_percent ?? 25;
  const depositAmount = total * (depositPercent / 100);

  // Default cancellation policy
  const defaultCancellation =
    "More than 60 days before event: Full refund minus deposit. " +
    "30-60 days before event: 50% refund of amounts paid (excluding deposit). " +
    "Less than 30 days before event: No refund.";

  const contract = {
    contract_number,
    event_id: eventId,
    venue_id: event.venue_id,
    client_name: body.client_name ?? event.contact_name ?? "",
    client_email: body.client_email ?? event.contact_email ?? "",
    client_phone: body.client_phone ?? event.contact_phone ?? "",
    client_company: body.client_company ?? "",
    client_address: body.client_address ?? "",
    event_name: body.event_name ?? event.title ?? "",
    event_date: body.event_date ?? event.date ?? "",
    event_time_start: body.event_time_start ?? "",
    event_time_end: body.event_time_end ?? "",
    event_space: body.event_space ?? "Main Venue",
    expected_guests: body.expected_guests ?? null,
    line_items: lineItems,
    subtotal,
    tax_rate: taxRate,
    tax_amount: taxAmount,
    total,
    deposit_percent: depositPercent,
    deposit_amount: depositAmount,
    deposit_due_date: body.deposit_due_date ?? null,
    payment_schedule: body.payment_schedule ?? "",
    cancellation_policy: body.cancellation_policy ?? defaultCancellation,
    insurance_required: body.insurance_required ?? false,
    insurance_details: body.insurance_details ?? "",
    additional_terms: body.additional_terms ?? "",
    status: "draft",
  };

  const { data, error } = await admin
    .from("rental_contracts")
    .insert(contract)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}

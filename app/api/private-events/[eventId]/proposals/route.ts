import { createAdminClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// GET: List proposals for a private event
export async function GET(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const { eventId } = await params;
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("private_event_proposals")
    .select("*")
    .eq("event_id", eventId)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}

// POST: Create a new proposal for a private event
export async function POST(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const { eventId } = await params;
  const admin = createAdminClient();
  const body = await request.json();

  // Fetch the event to get venue_id
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

  // Generate proposal number: PROP-YYYY-XXXX
  const year = new Date().getFullYear();
  const { count } = await admin
    .from("private_event_proposals")
    .select("id", { count: "exact", head: true })
    .eq("venue_id", event.venue_id);

  const seq = String((count ?? 0) + 1).padStart(4, "0");
  const proposal_number = `PROP-${year}-${seq}`;

  // Calculate validity (default 30 days)
  const validDays = body.validity_days ?? 30;
  const validUntil = new Date();
  validUntil.setDate(validUntil.getDate() + validDays);

  // Build line items from revenue + custom items
  const lineItems = body.line_items ?? [];
  const subtotal = lineItems.reduce((sum: number, item: { amount: number }) => sum + (item.amount || 0), 0);
  const taxRate = body.tax_rate ?? 0;
  const taxAmount = subtotal * taxRate;
  const total = subtotal + taxAmount;

  const proposal = {
    proposal_number,
    event_id: eventId,
    venue_id: event.venue_id,
    client_name: body.client_name ?? event.contact_name ?? "",
    client_email: body.client_email ?? event.contact_email ?? "",
    client_phone: body.client_phone ?? event.contact_phone ?? "",
    client_company: body.client_company ?? "",
    line_items: lineItems,
    subtotal,
    tax_rate: taxRate,
    tax_amount: taxAmount,
    total,
    valid_until: validUntil.toISOString().split("T")[0],
    notes: body.notes ?? "",
    terms: body.terms ?? "",
    status: "draft",
  };

  const { data, error } = await admin
    .from("private_event_proposals")
    .insert(proposal)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}

import { createAdminClient } from "@/lib/supabase-server";
import { buildSeatAssignments } from "@/lib/seating/buildAssignments";
import { NextResponse } from "next/server";
import { refusalReason } from "@/lib/tickets/void";
import { POSTPONED_SCAN_REASON, wrongShowReason } from "@/lib/tickets/scanShow";
import { requireCapability } from "@/lib/auth/can";
import { tenantScope, DENY } from "@/lib/auth/tenant";

// POST: validate and scan a ticket by QR code. Body: { event_id }, the show the
// scanner is set to. Staff only: this marks a ticket used, which turns its owner
// away at the door, and the code is printed on the ticket.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireCapability("scan_checkin", { write: true });
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const admin = createAdminClient();

  // Look up ticket by qr_code
  let { data: ticket, error: findError } = await admin
    .from("tickets")
    .select("id, qr_code, customer_name, customer_email, is_scanned, scanned_at, voided_at, void_reason, event_id, order_id, events!inner(title, venue, venue_id, date, status), orders(status)")
    .eq("qr_code", id)
    .single();

  // Without this fallback, a database that has not run
  // plans/ticket-void-migration.sql fails this select and EVERY scan at the
  // door reads "Ticket not found". A missing column must never close the gate
  // on a paying customer.
  if (findError && /voided_at|void_reason|column .* does not exist/i.test(findError.message)) {
    const retry = await admin
      .from("tickets")
      .select("id, qr_code, customer_name, customer_email, is_scanned, scanned_at, event_id, order_id, events!inner(title, venue, venue_id, date, status), orders(status)")
      .eq("qr_code", id)
      .single();
    ticket = retry.data ? { ...retry.data, voided_at: null, void_reason: null } : null;
    findError = retry.error;
  }

  if (findError || !ticket) {
    return NextResponse.json(
      { valid: false, reason: "Ticket not found" },
      { status: 200 }
    );
  }

  const ev = ticket.events as unknown as { title: string; venue: string; venue_id: string | null; date: string | null; status: string | null } | null;

  // The code alone is not a boundary (lib/auth/tenant.ts).
  const venueId = ev?.venue_id ?? null;
  const scope = tenantScope(guard.actor, venueId);
  if (scope === DENY || (scope !== null && scope !== venueId)) {
    return NextResponse.json({ valid: false, reason: "Ticket not found" }, { status: 200 });
  }

  // The show moved: the ticket is good for the new date, so don't use it up.
  if (ev?.status === "postponed") {
    return NextResponse.json({ valid: false, reason: POSTPONED_SCAN_REASON, customer_name: ticket.customer_name });
  }

  // Before anything marks it used: at the wrong door it must stay good for its own.
  const wrongShow = wrongShowReason(
    { event_id: ticket.event_id, event_title: ev?.title, event_date: ev?.date },
    typeof body?.event_id === "string" ? body.event_id : null,
  );
  if (wrongShow) {
    return NextResponse.json({ valid: false, reason: wrongShow, customer_name: ticket.customer_name });
  }

  // One place decides what a valid ticket is, shared with the bulk check-in
  // list — they disagreed, and a refunded order walked in through the list
  // while this route would have refused it.
  const orderStatus = (ticket.orders as unknown as { status: string } | null)?.status;
  const refusal = refusalReason({
    voided_at: ticket.voided_at,
    void_reason: ticket.void_reason,
    is_scanned: ticket.is_scanned,
    scanned_at: ticket.scanned_at,
    orderStatus,
  });
  if (refusal) {
    return NextResponse.json({
      valid: false,
      reason: refusal,
      customer_name: ticket.customer_name,
    });
  }

  // Mark as scanned
  const { error: updateError } = await admin
    .from("tickets")
    .update({ is_scanned: true, scanned_at: new Date().toISOString() })
    .eq("id", ticket.id);

  if (updateError) {
    return NextResponse.json(
      { valid: false, reason: "Failed to update ticket" },
      { status: 500 }
    );
  }

  // Look up seat assignments — tables show as "Table X", individual seats show row+number
  let seatAssignments: { section: string; row: string; seat: string }[] = [];
  try {
    if (!ticket.order_id) throw new Error("no order_id");
    seatAssignments = await buildSeatAssignments(admin, ticket.order_id);
  } catch {
    // Non-critical — don't fail validation if seat lookup fails
  }

  return NextResponse.json({
    valid: true,
    customer_name: ticket.customer_name,
    customer_email: ticket.customer_email,
    event_title: ev?.title || "",
    venue: ev?.venue || "",
    seat_assignments: seatAssignments.length > 0 ? seatAssignments : undefined,
  });
}

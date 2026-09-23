import { createAdminClient } from "@/lib/supabase-server";
import { buildSeatAssignments } from "@/lib/seating/buildAssignments";
import { NextResponse } from "next/server";
import { refusalReason } from "@/lib/tickets/void";

// POST: validate and scan a ticket by QR code
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const admin = createAdminClient();

  // Look up ticket by qr_code
  let { data: ticket, error: findError } = await admin
    .from("tickets")
    .select("id, qr_code, customer_name, customer_email, is_scanned, scanned_at, voided_at, void_reason, event_id, order_id, events!inner(title, venue), orders(status)")
    .eq("qr_code", id)
    .single();

  // Without this fallback, a database that has not run
  // plans/ticket-void-migration.sql fails this select and EVERY scan at the
  // door reads "Ticket not found". A missing column must never close the gate
  // on a paying customer.
  if (findError && /voided_at|void_reason|column .* does not exist/i.test(findError.message)) {
    const retry = await admin
      .from("tickets")
      .select("id, qr_code, customer_name, customer_email, is_scanned, scanned_at, event_id, order_id, events!inner(title, venue), orders(status)")
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

  const ev = ticket.events as unknown as { title: string; venue: string } | null;

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

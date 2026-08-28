import { createAdminClient } from "@/lib/supabase-server";
import { buildSeatAssignments } from "@/lib/seating/buildAssignments";
import { NextResponse } from "next/server";

// POST: validate and scan a ticket by QR code
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const admin = createAdminClient();

  // Look up ticket by qr_code
  const { data: ticket, error: findError } = await admin
    .from("tickets")
    .select("id, qr_code, customer_name, customer_email, is_scanned, scanned_at, event_id, order_id, events!inner(title, venue), orders(status)")
    .eq("qr_code", id)
    .single();

  if (findError || !ticket) {
    return NextResponse.json(
      { valid: false, reason: "Ticket not found" },
      { status: 200 }
    );
  }

  const orderStatus = (ticket.orders as unknown as { status: string } | null)?.status;
  if (orderStatus === "refunded") {
    return NextResponse.json({
      valid: false,
      reason: "This order was refunded — ticket is no longer valid.",
      customer_name: ticket.customer_name,
    });
  }

  if (ticket.is_scanned) {
    return NextResponse.json({
      valid: false,
      reason: `Already scanned at ${new Date(ticket.scanned_at).toLocaleString()}`,
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

import { createAdminClient } from "@/lib/supabase-server";
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
    .select("id, qr_code, customer_name, customer_email, is_scanned, scanned_at, event_id, order_id, events!inner(title, venue)")
    .eq("qr_code", id)
    .single();

  if (findError || !ticket) {
    return NextResponse.json(
      { valid: false, reason: "Ticket not found" },
      { status: 200 }
    );
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

  // Look up seat assignments for this order
  // V3 seat lookup: seats.order_id + seats.status
  let seatAssignments: { section: string; row: string; seat: string }[] = [];
  try {
    if (!ticket.order_id) throw new Error("no order_id");
    const { data: orderSeats } = await admin
      .from("seats")
      .select("id, seat_number, row_label, section_id")
      .eq("order_id", ticket.order_id)
      .eq("status", "sold");

    if (orderSeats && orderSeats.length > 0) {
      const sectionIds = [...new Set(orderSeats.map((s: { section_id: string }) => s.section_id))];
      const { data: sectionData } = await admin
        .from("sections")
        .select("id, name")
        .in("id", sectionIds);

      const sectionMap = new Map((sectionData || []).map((s: { id: string; name: string }) => [s.id, s.name]));

      seatAssignments = orderSeats.map((seat: { section_id: string; row_label: string; seat_number: number }) => ({
        section: sectionMap.get(seat.section_id) || "Section",
        row: seat.row_label,
        seat: String(seat.seat_number),
      }));
    }
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

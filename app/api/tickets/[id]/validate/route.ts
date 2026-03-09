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
  let seatAssignments: { section: string; row: string; seat: string }[] = [];
  try {
    if (!ticket.order_id) throw new Error("no order_id");
    const { data: reservations } = await admin
      .from("seat_reservations")
      .select("seat_id")
      .eq("order_id", ticket.order_id)
      .eq("status", "purchased");

    if (reservations && reservations.length > 0) {
      const seatIds = reservations.map((r) => r.seat_id);
      const { data: seats } = await admin
        .from("seating_seats")
        .select("id, seat_number, row_id")
        .in("id", seatIds);

      if (seats && seats.length > 0) {
        const rowIds = [...new Set(seats.map((s) => s.row_id))];
        const { data: rows } = await admin
          .from("seating_rows")
          .select("id, row_label, section_id")
          .in("id", rowIds);

        const sectionIds = [...new Set((rows || []).map((r) => r.section_id))];
        const { data: sections } = await admin
          .from("seating_sections")
          .select("id, section_name")
          .in("id", sectionIds);

        const rowMap = new Map((rows || []).map((r) => [r.id, r]));
        const sectionMap = new Map((sections || []).map((s) => [s.id, s]));

        seatAssignments = seats.map((seat) => {
          const row = rowMap.get(seat.row_id);
          const section = row ? sectionMap.get(row.section_id) : undefined;
          return {
            section: section?.section_name || "General",
            row: row?.row_label || "?",
            seat: seat.seat_number,
          };
        });
      }
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

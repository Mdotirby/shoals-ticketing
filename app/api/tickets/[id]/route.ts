import { createAdminClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";

// GET: fetch ticket by QR code (the [id] param IS the qr_code)
// Also returns sibling tickets from the same order for carousel view
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("tickets")
    .select("*, events!inner(title, venue, date)")
    .eq("qr_code", id)
    .single();

  if (error) {
    return NextResponse.json(
      { error: "Ticket not found" },
      { status: 404 }
    );
  }

  // Fetch sibling tickets from the same order
  let siblings: typeof data[] = [];
  if (data.order_id) {
    const { data: allTickets } = await admin
      .from("tickets")
      .select("id, qr_code, qr_data_url, customer_name, customer_email, is_scanned")
      .eq("order_id", data.order_id)
      .order("created_at", { ascending: true });
    siblings = allTickets || [];
  }

  // Look up reserved seat assignments for this order (V3 schema: seats.order_id)
  let seatAssignments: { section: string; row: string; seat: string }[] = [];
  if (data.order_id) {
    try {
      const { data: orderSeats } = await admin
        .from("seats")
        .select("id, seat_number, row_label, section_id")
        .eq("order_id", data.order_id)
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

        seatAssignments.sort((a, b) =>
          a.section.localeCompare(b.section) ||
          a.row.localeCompare(b.row) ||
          a.seat.localeCompare(b.seat, undefined, { numeric: true })
        );
      }
    } catch {
      // Seat lookup is non-critical — don't fail the ticket view
    }
  }

  return NextResponse.json({ ...data, siblings, seatAssignments });
}

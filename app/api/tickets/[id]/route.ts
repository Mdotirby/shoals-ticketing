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

  // Look up reserved seat assignments for this order
  let seatAssignments: { section: string; row: string; seat: string }[] = [];
  if (data.order_id) {
    const { data: reservations } = await admin
      .from("seat_reservations")
      .select("seat_id")
      .eq("order_id", data.order_id)
      .eq("status", "purchased");

    if (reservations && reservations.length > 0) {
      // Check if any of these reservations belong to this customer's order
      // by matching the order creation time window (within 1 minute)
      const seatIds = reservations.map((r) => r.seat_id);
      const { data: seats } = await admin
        .from("seats")
        .select("id, seat_number, row_id")
        .in("id", seatIds);

      if (seats && seats.length > 0) {
        const rowIds = [...new Set(seats.map((s) => s.row_id))];
        const { data: rows } = await admin
          .from("seats")
          .select("id, row_label, section_id")
          .in("id", rowIds);

        const sectionIds = [...new Set((rows || []).map((r) => r.section_id))];
        const { data: sections } = await admin
          .from("sections")
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

        seatAssignments.sort((a, b) =>
          a.section.localeCompare(b.section) ||
          a.row.localeCompare(b.row) ||
          a.seat.localeCompare(b.seat, undefined, { numeric: true })
        );
      }
    }
  }

  return NextResponse.json({ ...data, siblings, seatAssignments });
}

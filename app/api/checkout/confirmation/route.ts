import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-server";

// GET /api/checkout/confirmation?session_id=...
// Returns order + first ticket QR for the success page
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get("session_id");

  if (!sessionId) {
    return NextResponse.json({ error: "session_id required" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: order, error } = await admin
    .from("orders")
    .select("id, customer_name, customer_email, quantity, total_amount, event_id, status")
    .eq("stripe_checkout_session_id", sessionId)
    .single();

  if (error || !order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  // Fetch event details
  const { data: event } = await admin
    .from("events")
    .select("title, date, venue")
    .eq("id", order.event_id)
    .single();

  // Fetch first ticket's QR code (for display)
  const { data: tickets } = await admin
    .from("tickets")
    .select("id, qr_code, qr_data_url")
    .eq("order_id", order.id)
    .limit(1);

  // Look up reserved seat assignments for this order
  let seatAssignments: { section: string; row: string; seat: string }[] = [];
  if (order.id) {
    const { data: reservations } = await admin
      .from("seat_reservations")
      .select("seat_id")
      .eq("order_id", order.id)
      .eq("status", "purchased");

    if (reservations && reservations.length > 0) {
      const seatIds = reservations.map((r: { seat_id: string }) => r.seat_id);
      const { data: seats } = await admin
        .from("seats")
        .select("id, seat_number, row_id")
        .in("id", seatIds);

      if (seats && seats.length > 0) {
        const rowIds = [...new Set(seats.map((s: { row_id: string }) => s.row_id))];
        const { data: rows } = await admin
          .from("seats")
          .select("id, row_label, section_id")
          .in("id", rowIds);

        const sectionIds = [...new Set((rows || []).map((r: { section_id: string }) => r.section_id))];
        const { data: sections } = await admin
          .from("sections")
          .select("id, section_name")
          .in("id", sectionIds);

        const rowMap = new Map((rows || []).map((r: { id: string; row_label: string; section_id: string }) => [r.id, r]));
        const sectionMap = new Map((sections || []).map((s: { id: string; section_name: string }) => [s.id, s]));

        seatAssignments = seats.map((seat: { id: string; seat_number: string; row_id: string }) => {
          const row = rowMap.get(seat.row_id) as { section_id: string; row_label: string } | undefined;
          const section = row ? sectionMap.get(row.section_id) as { section_name: string } | undefined : undefined;
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

  return NextResponse.json({
    order,
    event: event || null,
    ticket: tickets?.[0] || null,
    seatAssignments: seatAssignments.length > 0 ? seatAssignments : undefined,
  });
}

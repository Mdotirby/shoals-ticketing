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

  // V3: Look up seat assignments via seats.order_id
  let seatAssignments: { section: string; row: string; seat: string }[] = [];
  if (order.id) {
    try {
      const { data: orderSeats } = await admin
        .from("seats")
        .select("id, seat_number, row_label, section_id")
        .eq("order_id", order.id)
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
      // Non-critical
    }
  }

  return NextResponse.json({
    order,
    event: event || null,
    ticket: tickets?.[0] || null,
    seatAssignments: seatAssignments.length > 0 ? seatAssignments : undefined,
  });
}

import { createAdminClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";
import { sendTicketEmail } from "@/lib/email/ticket-email";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const QRCode = require("qrcode");

// POST /api/admin/orders/[orderId]/resend-email
// Sends one email per ticket, each with its own QR code and matched seat assignment.
// Seat-to-ticket matching: if seat count === ticket count, pairs by sorted index.
// If counts differ (e.g. 1 ticket for a full table), all seats go on every email.
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ orderId: string }> }
) {
  const { orderId } = await params;
  const admin = createAdminClient();

  // Fetch order + event
  const { data: order, error: orderError } = await admin
    .from("orders")
    .select(`*, events!inner(id, title, date, venue, venue_id)`)
    .eq("id", orderId)
    .single();

  if (orderError || !order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  // Venue slug for from-address
  let venueSlug = "tickets";
  if (order.events?.venue_id) {
    const { data: venueData } = await admin
      .from("venues").select("slug").eq("id", order.events.venue_id).single();
    if (venueData?.slug) venueSlug = venueData.slug;
  }

  // Fetch all tickets for this order
  const { data: tickets, error: ticketsError } = await admin
    .from("tickets")
    .select("id, qr_code, qr_data_url")
    .eq("order_id", orderId)
    .order("created_at", { ascending: true });

  if (ticketsError) {
    return NextResponse.json({ error: ticketsError.message }, { status: 500 });
  }
  if (!tickets || tickets.length === 0) {
    return NextResponse.json(
      { error: "No tickets found for this order." },
      { status: 404 }
    );
  }

  // Backfill any missing QR data URLs
  for (const ticket of tickets) {
    if (!ticket.qr_data_url) {
      try {
        ticket.qr_data_url = await QRCode.toDataURL(
          `https://venuecore.live/tickets/${ticket.qr_code}`,
          { width: 300, margin: 2 }
        );
        await admin
          .from("tickets")
          .update({ qr_data_url: ticket.qr_data_url })
          .eq("id", ticket.id);
      } catch {
        return NextResponse.json({ error: "Failed to generate QR code" }, { status: 500 });
      }
    }
  }

  // Fetch seat assignments for this order (sorted so index-matching is stable)
  type SeatAssignment = { section: string; row: string; seat: string };
  let allSeatAssignments: SeatAssignment[] = [];
  const { data: orderSeats } = await admin
    .from("seats")
    .select("id, seat_number, row_label, section_id")
    .eq("order_id", orderId)
    .eq("status", "sold");

  if (orderSeats && orderSeats.length > 0) {
    const sectionIds = [...new Set(orderSeats.map((s: { section_id: string }) => s.section_id))];
    const { data: sectionData } = await admin
      .from("sections").select("id, name").in("id", sectionIds);
    const sectionMap = new Map(
      (sectionData || []).map((s: { id: string; name: string }) => [s.id, s.name])
    );

    allSeatAssignments = (orderSeats as { section_id: string; row_label: string; seat_number: number }[])
      .map((seat) => ({
        section: sectionMap.get(seat.section_id) || "Section",
        row: seat.row_label,
        seat: String(seat.seat_number),
      }))
      .sort((a, b) =>
        a.section.localeCompare(b.section) ||
        a.row.localeCompare(b.row) ||
        a.seat.localeCompare(b.seat, undefined, { numeric: true })
      );
  }

  // Send one email with the first ticket's QR code, all seat assignments listed,
  // and a link to the ticket page carousel where customers can swipe all QR codes.
  const firstTicket = tickets[0];
  const result = await sendTicketEmail({
    to: order.customer_email,
    customerName: order.customer_name,
    eventTitle: order.events.title,
    eventDate: order.events.date,
    eventVenue: order.events.venue,
    ticketCount: tickets.length,
    totalAmount: order.total_amount,
    qrDataUrl: firstTicket.qr_data_url,
    ticketId: firstTicket.qr_code,
    venueSlug,
    seatAssignments: allSeatAssignments.length > 0 ? allSeatAssignments : undefined,
  });

  if (!result.success) {
    return NextResponse.json(
      { error: result.error ?? "Failed to send email" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    sentTo: order.customer_email,
    ticketCount: tickets.length,
    emailsSent: 1,
  });
}

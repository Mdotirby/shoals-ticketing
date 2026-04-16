import { createAdminClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";
import { sendTicketEmail } from "@/lib/email/ticket-email";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const QRCode = require("qrcode");

// POST /api/admin/orders/[orderId]/resend-email
// Re-sends the ticket confirmation email for any existing order.
// If qr_data_url is NULL (e.g. manually inserted tickets), regenerates it on the fly.
export async function POST(
  _req: Request,
  { params }: { params: { orderId: string } }
) {
  const { orderId } = params;
  const admin = createAdminClient();

  // Fetch order + event + venue slug
  const { data: order, error: orderError } = await admin
    .from("orders")
    .select(`
      *,
      events!inner(
        id,
        title,
        date,
        venue,
        venue_id
      )
    `)
    .eq("id", orderId)
    .single();

  if (orderError || !order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  // Fetch venue slug for the from-address
  let venueSlug = "tickets";
  if (order.events?.venue_id) {
    const { data: venueData } = await admin
      .from("venues")
      .select("slug")
      .eq("id", order.events.venue_id)
      .single();
    if (venueData?.slug) venueSlug = venueData.slug;
  }

  // Fetch the first ticket for QR code data
  const { data: tickets, error: ticketsError } = await admin
    .from("tickets")
    .select("id, qr_code, qr_data_url")
    .eq("order_id", orderId)
    .order("created_at", { ascending: true })
    .limit(1);

  if (ticketsError) {
    return NextResponse.json({ error: ticketsError.message }, { status: 500 });
  }

  if (!tickets || tickets.length === 0) {
    return NextResponse.json(
      { error: "No tickets found for this order. Please re-create the tickets first." },
      { status: 404 }
    );
  }

  const firstTicket = tickets[0];

  // If qr_data_url is missing (e.g. manually inserted tickets), regenerate it on the fly
  let qrDataUrl = firstTicket.qr_data_url;
  if (!qrDataUrl) {
    try {
      qrDataUrl = await QRCode.toDataURL(
        `https://venuecore.live/tickets/${firstTicket.qr_code}`,
        { width: 300, margin: 2 }
      );
      // Backfill qr_data_url on all tickets so future resends don't need to regenerate
      await admin
        .from("tickets")
        .update({ qr_data_url: qrDataUrl })
        .eq("order_id", orderId);
    } catch (err) {
      console.error("QR generation failed:", err);
      return NextResponse.json({ error: "Failed to generate QR code" }, { status: 500 });
    }
  }

  // Count all tickets for this order (for the email subject/body)
  const { count: ticketCount } = await admin
    .from("tickets")
    .select("id", { count: "exact", head: true })
    .eq("order_id", orderId);

  const result = await sendTicketEmail({
    to: order.customer_email,
    customerName: order.customer_name,
    eventTitle: order.events.title,
    eventDate: order.events.date,
    eventVenue: order.events.venue,
    ticketCount: ticketCount ?? 1,
    totalAmount: order.total_amount,
    qrDataUrl,
    ticketId: firstTicket.qr_code,
    venueSlug,
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
    ticketCount: ticketCount ?? 1,
  });
}

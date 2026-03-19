import { createAdminClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
const QRCode = require("qrcode");

export async function POST(request: Request) {
  const body = await request.json();
  const { event_id, buyer_name, buyer_email, quantity = 1, promo_code, seat_ids } = body;

  if (!event_id || !buyer_name || !buyer_email) {
    return NextResponse.json({ error: "event_id, buyer_name, and buyer_email are required" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Fetch event
  const { data: event } = await admin.from("events").select("id, title, venue, date, venue_id").eq("id", event_id).single();
  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  // Validate promo code is 100% discount
  let promoCodeId: string | null = null;
  if (promo_code) {
    const { data: promo } = await admin
      .from("promo_codes")
      .select("*")
      .eq("event_id", event_id)
      .eq("code", promo_code.toUpperCase().trim())
      .eq("active", true)
      .single();

    if (!promo || promo.discount_type !== "percentage" || parseFloat(promo.discount_value) < 100) {
      return NextResponse.json({ error: "Invalid promo code for free checkout" }, { status: 400 });
    }

    promoCodeId = promo.id;

    // Increment usage
    await admin.from("promo_codes").update({ current_uses: (promo.current_uses || 0) + 1 }).eq("id", promo.id);
  }

  // Create order with $0 total
  const { data: order, error: orderError } = await admin
    .from("orders")
    .insert({
      event_id,
      customer_name: buyer_name,
      customer_email: buyer_email,
      quantity,
      total_amount: 0,
      status: "paid",
      source: "online",
      promo_code_id: promoCodeId || null,
    })
    .select()
    .single();

  if (orderError || !order) {
    return NextResponse.json({ error: "Failed to create order" }, { status: 500 });
  }

  // Finalize reserved seats if applicable (V3: seats.order_id directly)
  if (Array.isArray(seat_ids) && seat_ids.length > 0) {
    await admin.from("seats").update({ status: "sold", order_id: order.id }).in("id", seat_ids);
  }

  // Get default tier
  const { data: defaultTier } = await admin
    .from("ticket_tiers")
    .select("id")
    .eq("event_id", event_id)
    .order("sort_order", { ascending: true })
    .limit(1)
    .maybeSingle();

  // Create tickets with QR codes
  const tickets = [];
  for (let i = 0; i < quantity; i++) {
    const qrCode = uuidv4();
    const qrDataUrl = await QRCode.toDataURL(`https://venuecore.live/tickets/${qrCode}`, { width: 300, margin: 2 });
    tickets.push({
      order_id: order.id,
      event_id,
      ticket_type_id: defaultTier?.id || null,
      customer_name: buyer_name,
      customer_email: buyer_email,
      qr_code: qrCode,
      qr_data_url: qrDataUrl,
      is_scanned: false,
    });
  }

  const { data: createdTickets } = await admin.from("tickets").insert(tickets).select();

  return NextResponse.json({
    success: true,
    order_id: order.id,
    ticket_url: createdTickets?.[0] ? `/tickets/${createdTickets[0].qr_code}` : null,
    tickets: createdTickets?.map((t: { qr_code: string; qr_data_url: string }) => ({ qr_code: t.qr_code, qr_data_url: t.qr_data_url })) || [],
  });
}

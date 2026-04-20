import { createAdminClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const QRCode = require("qrcode");

/**
 * POST /api/admin/comps
 *
 * Admin-only. Issues complimentary (free) tickets for a giveaway winner or VIP
 * without requiring a 100% promo code on the event. Mirrors the bookkeeping
 * done by the paid webhook and the public `/api/checkout/free` route so comps
 * flow through reports, settlement, and customer profiles the same way.
 *
 * Body:
 *   {
 *     event_id: string,
 *     buyer_name: string,
 *     buyer_email: string,
 *     buyer_phone?: string,
 *     quantity?: number,       // default 1
 *     note?: string,           // optional internal memo
 *   }
 */
export async function POST(request: Request) {
  const body = await request.json();
  const {
    event_id,
    buyer_name,
    buyer_email,
    buyer_phone,
    quantity = 1,
    note,
  } = body;

  if (!event_id || !buyer_name || !buyer_email) {
    return NextResponse.json(
      { error: "event_id, buyer_name, and buyer_email are required" },
      { status: 400 }
    );
  }

  const qty = Math.max(1, Math.min(50, parseInt(String(quantity), 10) || 1));

  const admin = createAdminClient();

  // Fetch event (for email + settlement ledger)
  const { data: event } = await admin
    .from("events")
    .select("id, title, venue, date, venue_id")
    .eq("id", event_id)
    .single();
  if (!event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  // Resolve venue slug for the From email
  let venueSlug = "tickets";
  if (event.venue_id) {
    const { data: venueData } = await admin
      .from("venues")
      .select("slug")
      .eq("id", event.venue_id)
      .single();
    if (venueData?.slug) venueSlug = venueData.slug;
  }

  // Create the order (source = "comp")
  const { data: order, error: orderError } = await admin
    .from("orders")
    .insert({
      event_id,
      customer_name: buyer_name,
      customer_email: buyer_email,
      customer_phone: buyer_phone || null,
      quantity: qty,
      total_amount: 0,
      status: "paid",
      source: "comp",
      notes: note || null,
    })
    .select()
    .single();

  if (orderError || !order) {
    console.error("Failed to create comp order:", orderError?.message);
    return NextResponse.json(
      { error: "Failed to create comp order" },
      { status: 500 }
    );
  }

  // Default ticket tier (so the ticket is linked to something reportable)
  const { data: defaultTier } = await admin
    .from("ticket_tiers")
    .select("id")
    .eq("event_id", event_id)
    .order("sort_order", { ascending: true })
    .limit(1)
    .maybeSingle();

  // Build tickets + QR codes
  const tickets = [];
  for (let i = 0; i < qty; i++) {
    const qrCode = uuidv4();
    const qrDataUrl = await QRCode.toDataURL(
      `https://venuecore.live/tickets/${qrCode}`,
      { width: 300, margin: 2 }
    );
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

  const { data: createdTickets, error: ticketError } = await admin
    .from("tickets")
    .insert(tickets)
    .select();

  if (ticketError) {
    console.error("Failed to create comp tickets:", ticketError.message);
    return NextResponse.json(
      { error: "Order created but ticket issuance failed" },
      { status: 500 }
    );
  }

  // Settlement ledger entry ($0, type = comp)
  try {
    await admin.from("settlement_ledger").insert({
      order_id: order.id,
      event_id,
      venue_id: event.venue_id || null,
      gross_amount: 0,
      ticket_revenue: 0,
      ticketing_fee: 0,
      venue_rebate: 0,
      tax_collected: 0,
      stripe_fee: 0,
      net_to_venue: 0,
      net_to_platform: 0,
      type: "comp",
    });
  } catch (e) {
    console.error("Failed to create settlement ledger for comp:", e);
  }

  // Upsert customer profile (same rollups as paid/free orders)
  try {
    const email = String(buyer_email).toLowerCase();
    const nameParts = String(buyer_name).split(" ");
    const { data: existingProfile } = await admin
      .from("customer_profiles")
      .select("id, total_orders, first_order_at, events_attended")
      .eq("email", email)
      .maybeSingle();

    if (existingProfile) {
      const newOrderCount = (existingProfile.total_orders || 0) + 1;
      const newEventsAttended = (existingProfile.events_attended || 0) + 1;
      let segment = "one_timer";
      if (newEventsAttended >= 4) segment = "whale";
      else if (newEventsAttended >= 2) segment = "loyalist";
      else if (newOrderCount >= 2) segment = "repeat";

      await admin
        .from("customer_profiles")
        .update({
          total_orders: newOrderCount,
          last_order_at: new Date().toISOString(),
          events_attended: newEventsAttended,
          lfv_segment: segment,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingProfile.id);
    } else {
      await admin.from("customer_profiles").upsert(
        {
          email,
          first_name: nameParts[0] || null,
          last_name: nameParts.slice(1).join(" ") || null,
          total_orders: 1,
          total_spend: 0,
          first_order_at: new Date().toISOString(),
          last_order_at: new Date().toISOString(),
          events_attended: 1,
          lfv_segment: "one_timer",
        },
        { onConflict: "email" }
      );
    }
  } catch (e) {
    console.error("Failed to upsert customer profile (comp):", e);
  }

  // Send confirmation email with QR — same template as /api/checkout/free
  if (createdTickets && createdTickets.length > 0) {
    try {
      const resendKey = process.env.RESEND_API_KEY;
      if (resendKey) {
        const fromEmail = venueSlug
          ? `${venueSlug}@venuecore.live`
          : "tickets@venuecore.live";
        const ticketUrl = `https://venuecore.live/tickets/${createdTickets[0].qr_code}`;
        const formattedDate = new Date(event.date).toLocaleDateString("en-US", {
          weekday: "long",
          month: "long",
          day: "numeric",
          year: "numeric",
        });

        const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>Your ${qty > 1 ? "Tickets" : "Ticket"} — ${event.title}</title></head>
<body style="margin:0;padding:0;background:#0b0d1d;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0b0d1d;padding:32px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="width:100%;max-width:560px;background:#131629;border-radius:12px;overflow:hidden;border:1px solid rgba(208,194,144,0.15);">
        <tr><td style="background:#d0c290;padding:20px 28px;">
          <p style="margin:0;font-size:11px;font-weight:700;letter-spacing:2px;color:#0b0d1d;text-transform:uppercase;">VenueCore</p>
          <h1 style="margin:6px 0 0;font-size:22px;font-weight:800;color:#0b0d1d;">You&rsquo;re on the List</h1>
        </td></tr>
        <tr><td style="padding:28px 28px 20px;">
          <p style="margin:0 0 20px;color:rgba(255,255,255,0.7);font-size:15px;line-height:1.6;">
            Hey ${buyer_name ? String(buyer_name).split(" ")[0] : "there"},<br/>
            Your complimentary ${qty > 1 ? "tickets are" : "ticket is"} confirmed! Here's everything you need for the show.
          </p>
          <table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(208,194,144,0.08);border:1px solid rgba(208,194,144,0.2);border-radius:10px;margin-bottom:24px;">
            <tr><td style="padding:18px 20px;">
              <p style="margin:0;font-size:18px;font-weight:700;color:#d0c290;">${event.title}</p>
              <p style="margin:6px 0 0;font-size:14px;color:rgba(255,255,255,0.6);">${formattedDate}</p>
              <p style="margin:4px 0 0;font-size:14px;color:rgba(255,255,255,0.6);">${event.venue}</p>
              <p style="margin:10px 0 0;font-size:13px;color:rgba(255,255,255,0.4);">${qty} ticket${qty !== 1 ? "s" : ""} &middot; Comp</p>
            </td></tr>
          </table>
          <table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(208,194,144,0.06);border:1px solid rgba(208,194,144,0.15);border-radius:10px;margin-bottom:20px;">
            <tr><td style="padding:16px 20px;text-align:center;">
              <p style="margin:0 0 4px;font-size:14px;font-weight:700;color:#d0c290;">Your QR Code Is Your Ticket</p>
              <p style="margin:0;font-size:13px;color:rgba(255,255,255,0.5);line-height:1.5;">Present your QR code at the door for entry. Screenshot it, save it, or print &mdash; just have it ready when you arrive.</p>
            </td></tr>
          </table>
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
            <tr><td align="center">
              <a href="${ticketUrl}" style="display:inline-block;background:#d0c290;color:#0b0d1d;font-weight:700;font-size:14px;padding:12px 32px;border-radius:8px;text-decoration:none;">
                View My ${qty > 1 ? "Tickets" : "Ticket"} &amp; QR Code
              </a>
            </td></tr>
          </table>
          <p style="margin:0;font-size:12px;color:rgba(255,255,255,0.3);line-height:1.6;border-top:1px solid rgba(255,255,255,0.06);padding-top:20px;">
            Questions? Reply to this email or contact <a href="mailto:support@venuecore.live" style="color:rgba(208,194,144,0.6);">support@venuecore.live</a>.
          </p>
        </td></tr>
        <tr><td style="padding:14px 28px;background:rgba(0,0,0,0.2);text-align:center;">
          <p style="margin:0;font-size:11px;color:rgba(255,255,255,0.2);">Powered by VenueCore &middot; <a href="https://venuecore.live" style="color:rgba(208,194,144,0.4);text-decoration:none;">venuecore.live</a></p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${resendKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: `VenueCore Tickets <${fromEmail}>`,
            to: [buyer_email],
            subject: `Your comp ${qty > 1 ? "tickets" : "ticket"} for ${event.title}`,
            html,
          }),
        });

        if (!res.ok) {
          const err = await res.text();
          console.error("Resend email failed (comp):", err);
        } else {
          console.log(`Comp ticket email sent to ${buyer_email}`);
        }
      }
    } catch (e) {
      console.error("Failed to send comp ticket email:", e);
    }
  }

  return NextResponse.json({
    success: true,
    order_id: order.id,
    ticket_count: createdTickets?.length ?? 0,
    tickets:
      createdTickets?.map(
        (t: { qr_code: string; qr_data_url: string }) => ({
          qr_code: t.qr_code,
          qr_data_url: t.qr_data_url,
        })
      ) || [],
  });
}

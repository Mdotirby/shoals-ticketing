import { createAdminClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { pastEventReason } from "@/lib/events/closeout";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const QRCode = require("qrcode");

/**
 * POST /api/checkout/free
 *
 * Handles free ticket claims (free events or 100% promo code).
 * Creates order + tickets and runs ALL the same KPI tracking that
 * the paid webhook does: email, customer profile, trackable link
 * conversion, cart abandonment recovery, settlement ledger.
 */
export async function POST(request: Request) {
  const body = await request.json();
  const {
    event_id,
    buyer_name,
    buyer_email,
    buyer_phone,
    quantity = 1,
    promo_code,
    seat_ids,
    tracking_ref,
  } = body;

  if (!event_id || !buyer_name || !buyer_email) {
    return NextResponse.json(
      { error: "event_id, buyer_name, and buyer_email are required" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  // Fetch event (with closeout column when available)
  let { data: event, error: eventError } = await admin
    .from("events")
    .select("id, title, venue, date, venue_id, on_sale_at, closed_out_at, start_time")
    .eq("id", event_id)
    .single();
  if (eventError && /closed_out_at|column .* does not exist/i.test(eventError.message)) {
    const retry = await admin
      .from("events")
      .select("id, title, venue, date, venue_id, on_sale_at")
      .eq("id", event_id)
      .single();
    event = retry.data ? { ...retry.data, closed_out_at: null, start_time: null } : null;
  }
  if (!event)
    return NextResponse.json({ error: "Event not found" }, { status: 404 });

  // Guard: reject if tickets are not yet on sale
  if (event.on_sale_at && new Date(event.on_sale_at) > new Date()) {
    return NextResponse.json(
      { error: "Tickets are not yet on sale" },
      { status: 403 }
    );
  }

  // Guard: reject if the show has already happened or has been closed out.
  const closeoutReason = pastEventReason({
    date: event.date,
    closed_out_at: (event as { closed_out_at?: string | null }).closed_out_at ?? null,
    start_time: (event as { start_time?: string | null }).start_time ?? null,
  });
  if (closeoutReason) {
    return NextResponse.json({ error: closeoutReason }, { status: 410 });
  }

  // Resolve venue slug for email sender
  let venueSlug = "tickets";
  if (event.venue_id) {
    const { data: venueData } = await admin
      .from("venues")
      .select("slug")
      .eq("id", event.venue_id)
      .single();
    if (venueData?.slug) venueSlug = venueData.slug;
  }

  // Validate promo code is 100% discount (if provided)
  let promoCodeId: string | null = null;
  if (promo_code) {
    const { data: promo } = await admin
      .from("promo_codes")
      .select("*")
      .eq("event_id", event_id)
      .eq("code", promo_code.toUpperCase().trim())
      .eq("active", true)
      .single();

    if (
      !promo ||
      promo.discount_type !== "percentage" ||
      parseFloat(promo.discount_value) < 100
    ) {
      return NextResponse.json(
        { error: "Invalid promo code for free checkout" },
        { status: 400 }
      );
    }

    promoCodeId = promo.id;

    // Increment usage
    await admin
      .from("promo_codes")
      .update({ current_uses: (promo.current_uses || 0) + 1 })
      .eq("id", promo.id);
  }

  // ── Create order with $0 total ────────────────────────────────────────────
  const { data: order, error: orderError } = await admin
    .from("orders")
    .insert({
      event_id,
      customer_name: buyer_name,
      customer_email: buyer_email,
      customer_phone: buyer_phone || null,
      quantity,
      total_amount: 0,
      status: "paid",
      source: "online",
      promo_code_id: promoCodeId || null,
      tracking_link_slug: tracking_ref || null,
    })
    .select()
    .single();

  if (orderError || !order) {
    return NextResponse.json(
      { error: "Failed to create order" },
      { status: 500 }
    );
  }

  // ── Finalize reserved seats ───────────────────────────────────────────────
  if (Array.isArray(seat_ids) && seat_ids.length > 0) {
    await admin
      .from("seats")
      .update({ status: "sold", order_id: order.id })
      .in("id", seat_ids);
  }

  // ── Get default tier ──────────────────────────────────────────────────────
  const { data: defaultTier } = await admin
    .from("ticket_tiers")
    .select("id")
    .eq("event_id", event_id)
    .order("sort_order", { ascending: true })
    .limit(1)
    .maybeSingle();

  // ── Create tickets with QR codes ──────────────────────────────────────────
  const tickets = [];
  for (let i = 0; i < quantity; i++) {
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

  const { data: createdTickets } = await admin
    .from("tickets")
    .insert(tickets)
    .select();

  // ── Pair each seat to its specific ticket ─────────────────────────────────
  if (Array.isArray(seat_ids) && seat_ids.length > 0 && createdTickets && createdTickets.length > 0) {
    try {
      const sortedTickets = [...createdTickets].sort((a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id));
      const sortedSeatIds = [...seat_ids].sort();
      await Promise.all(
        sortedSeatIds.map((seatId: string, i: number) => {
          if (i >= sortedTickets.length) return Promise.resolve();
          return admin.from("seats")
            .update({ ticket_id: sortedTickets[i].id })
            .eq("id", seatId);
        })
      );
    } catch (e) {
      console.error("Failed to pair seats to tickets (free checkout):", e);
    }
  }

  // ── Settlement ledger entry ($0) ──────────────────────────────────────────
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
      type: "sale",
    });
  } catch (e) {
    console.error("Failed to create settlement ledger for free order:", e);
  }

  // ── Trackable link conversion ─────────────────────────────────────────────
  if (tracking_ref) {
    try {
      const { data: tLink } = await admin
        .from("trackable_links")
        .select("id, conversions, revenue")
        .eq("slug", tracking_ref)
        .eq("event_id", event_id)
        .maybeSingle();

      if (tLink) {
        await admin.from("trackable_link_events").insert({
          link_id: tLink.id,
          event_type: "conversion",
          order_id: order.id,
          revenue_amount: 0,
        });

        const { error: rpcErr } = await admin.rpc(
          "increment_trackable_link_conversion",
          {
            link_row_id: tLink.id,
            revenue_amt: 0,
          }
        );

        if (rpcErr) {
          await admin
            .from("trackable_links")
            .update({
              conversions: (tLink.conversions || 0) + 1,
            })
            .eq("id", tLink.id);
        }
      }
    } catch (e) {
      console.error("Failed to record trackable link conversion:", e);
    }
  }

  // ── Customer profile upsert (LFV tracking) ───────────────────────────────
  if (buyer_email) {
    try {
      const email = buyer_email.toLowerCase();
      const nameParts = buyer_name.split(" ");
      const { data: existingProfile } = await admin
        .from("customer_profiles")
        .select(
          "id, total_orders, total_spend, first_order_at, events_attended"
        )
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
      console.error("Failed to upsert customer profile:", e);
    }
  }

  // ── Cart abandonment recovery ─────────────────────────────────────────────
  if (buyer_email) {
    try {
      await admin
        .from("cart_abandonment")
        .update({ recovered: true })
        .eq("customer_email", buyer_email.toLowerCase())
        .eq("event_id", event_id)
        .eq("recovered", false);
    } catch (e) {
      console.error("Failed to mark cart abandonment as recovered:", e);
    }
  }

  // ── Send confirmation email via Resend ────────────────────────────────────
  if (buyer_email && createdTickets && createdTickets.length > 0) {
    try {
      const resendKey = process.env.RESEND_API_KEY;
      if (resendKey) {
        const ticketUrl = `https://venuecore.live/tickets/${createdTickets[0].qr_code}`;
        const formattedDate = new Date(event.date).toLocaleDateString("en-US", {
          weekday: "long",
          month: "long",
          day: "numeric",
          year: "numeric",
        });

        const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>Your ${quantity > 1 ? "Tickets" : "Ticket"} — ${event.title}</title></head>
<body style="margin:0;padding:0;background:#0b0d1d;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0b0d1d;padding:32px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="width:100%;max-width:560px;background:#131629;border-radius:12px;overflow:hidden;border:1px solid rgba(208,194,144,0.15);">
        <tr><td style="background:#d0c290;padding:20px 28px;">
          <p style="margin:0;font-size:11px;font-weight:700;letter-spacing:2px;color:#0b0d1d;text-transform:uppercase;">VenueCore</p>
          <h1 style="margin:6px 0 0;font-size:22px;font-weight:800;color:#0b0d1d;">Your ${quantity > 1 ? "Tickets are" : "Ticket is"} Ready</h1>
        </td></tr>
        <tr><td style="padding:28px 28px 20px;">
          <p style="margin:0 0 20px;color:rgba(255,255,255,0.7);font-size:15px;line-height:1.6;">
            Hey ${buyer_name ? buyer_name.split(" ")[0] : "there"},<br/>You're all set! Here's everything you need for the show.
          </p>
          <table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(208,194,144,0.08);border:1px solid rgba(208,194,144,0.2);border-radius:10px;margin-bottom:24px;">
            <tr><td style="padding:18px 20px;">
              <p style="margin:0;font-size:18px;font-weight:700;color:#d0c290;">${event.title}</p>
              <p style="margin:6px 0 0;font-size:14px;color:rgba(255,255,255,0.6);">${formattedDate}</p>
              <p style="margin:4px 0 0;font-size:14px;color:rgba(255,255,255,0.6);">${event.venue}</p>
              <p style="margin:10px 0 0;font-size:13px;color:rgba(255,255,255,0.4);">${quantity} ticket${quantity !== 1 ? "s" : ""} · Free</p>
            </td></tr>
          </table>
          <table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(208,194,144,0.06);border:1px solid rgba(208,194,144,0.15);border-radius:10px;margin-bottom:20px;">
            <tr><td style="padding:16px 20px;text-align:center;">
              <p style="margin:0 0 4px;font-size:14px;font-weight:700;color:#d0c290;">Your QR Code Is Your Ticket</p>
              <p style="margin:0;font-size:13px;color:rgba(255,255,255,0.5);line-height:1.5;">Present your QR code at the door for entry. Screenshot it, save it to your photos, or print a copy &mdash; just have it ready when you arrive.</p>
            </td></tr>
          </table>
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
            <tr><td align="center">
              <a href="${ticketUrl}" style="display:inline-block;background:#d0c290;color:#0b0d1d;font-weight:700;font-size:14px;padding:12px 32px;border-radius:8px;text-decoration:none;">
                View My ${quantity > 1 ? "Tickets" : "Ticket"} &amp; QR Code
              </a>
            </td></tr>
          </table>
          <p style="margin:0;font-size:12px;color:rgba(255,255,255,0.3);line-height:1.6;border-top:1px solid rgba(255,255,255,0.06);padding-top:20px;">
            All sales are final. Questions? Reply to this email or contact <a href="mailto:support@west72ent.com" style="color:rgba(208,194,144,0.6);">support@west72ent.com</a>.
          </p>
        </td></tr>
        <tr><td style="padding:14px 28px;background:rgba(0,0,0,0.2);text-align:center;">
          <p style="margin:0;font-size:11px;color:rgba(255,255,255,0.2);">Powered by VenueCore · <a href="https://venuecore.live" style="color:rgba(208,194,144,0.4);text-decoration:none;">venuecore.live</a></p>
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
            from: "West 72 Entertainment <ticketing@west72ent.com>",
            to: [buyer_email],
            subject: `Your ${quantity > 1 ? "tickets" : "ticket"} for ${event.title}`,
            html,
          }),
        });

        if (!res.ok) {
          const err = await res.text();
          console.error("Resend email failed (free checkout):", err);
        } else {
          console.log(`Free ticket email sent to ${buyer_email}`);
        }
      }
    } catch (e) {
      console.error("Failed to send free ticket email:", e);
    }
  }

  return NextResponse.json({
    success: true,
    order_id: order.id,
    ticket_url: createdTickets?.[0]
      ? `/tickets/${createdTickets[0].qr_code}`
      : null,
    tickets:
      createdTickets?.map(
        (t: { qr_code: string; qr_data_url: string }) => ({
          qr_code: t.qr_code,
          qr_data_url: t.qr_data_url,
        })
      ) || [],
  });
}

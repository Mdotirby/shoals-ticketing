import { createAdminClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { pastEventReason } from "@/lib/events/closeout";
import { validatePresaleCode, eventRequiresSeating } from "@/lib/checkout-helpers";
import { unlocksTier } from "@/lib/fees/tierFees";
import { sendTicketEmail } from "@/lib/email/ticket-email";
import { salesWindowFor, canSell } from "@/lib/salesWindow";
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
    tier_id,
    unlock_code,
    buyer_name,
    buyer_first_name,
    buyer_last_name,
    buyer_email,
    buyer_phone,
    buyer_zip,
    quantity = 1,
    promo_code,
    presale_code,
    seat_ids,
    tracking_ref,
    utm_source,
    utm_medium,
    utm_campaign,
  } = body;

  /**
   * A free claim asks for first and last name separately, plus an optional zip
   * for demographics. `buyer_name` stays supported because the paid flow and
   * the older free form both send a single field.
   */
  const fullName =
    [buyer_first_name, buyer_last_name].filter((n) => String(n ?? "").trim()).join(" ").trim() ||
    String(buyer_name ?? "").trim();

  if (!event_id || !fullName || !buyer_email) {
    return NextResponse.json(
      { error: "event_id, a first and last name, and an email are required" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  // Fetch event (with closeout column when available)
  let { data: event, error: eventError } = await admin
    .from("events")
    .select("id, title, venue, date, venue_id, image_url, on_sale_at, closed_out_at, start_time")
    .eq("id", event_id)
    .single();
  if (eventError && /closed_out_at|column .* does not exist/i.test(eventError.message)) {
    const retry = await admin
      .from("events")
      .select("id, title, venue, date, venue_id, image_url, on_sale_at")
      .eq("id", event_id)
      .single();
    event = retry.data ? { ...retry.data, closed_out_at: null, start_time: null } : null;
  }
  if (!event)
    return NextResponse.json({ error: "Event not found" }, { status: 404 });

  // ── Has this show already happened? ────────────────────────────────
  // A past event is still reachable and its tiers still exist, so every
  // path here would happily charge for a show that was over. A free RSVP is not
  // a charge, but it still issues a ticket for a night that has passed.
  // See lib/salesWindow.ts — the storefront closes at noon Central on show
  // day, the box office runs to midnight, then nobody sells.
  const salesWindow = salesWindowFor(event.date);
  if (!canSell(event.date, "storefront")) {
    return NextResponse.json(
      { error: salesWindow.reason ?? "Tickets are no longer on sale for this event." },
      { status: 403 }
    );
  }

  // Guard: reject if tickets are not yet on sale, unless a valid presale code was supplied
  if (event.on_sale_at && new Date(event.on_sale_at) > new Date()) {
    const presaleOk = presale_code ? await validatePresaleCode(admin, event_id, presale_code) : false;
    if (!presaleOk) {
      return NextResponse.json(
        { error: "Tickets are not yet on sale" },
        { status: 403 }
      );
    }
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

  // Guard: reserved-seating events require a seat selection (authoritative backstop).
  if (!(Array.isArray(seat_ids) && seat_ids.length > 0)) {
    if (await eventRequiresSeating(admin, event_id)) {
      return NextResponse.json(
        { error: "Please select your seat(s) from the map before checking out." },
        { status: 400 }
      );
    }
  }

  /**
   * Which tier is being claimed.
   *
   * This used to ignore tier_id entirely and stamp every free ticket with the
   * event's FIRST tier by sort_order. That was harmless while a free show had
   * one tier, and wrong the moment a show mixes a $0 GA with a paid tier: the
   * claim would be attributed to whichever tier happened to sort first, and
   * the paid tier's inventory could be consumed for nothing.
   *
   * So the tier is resolved properly and must actually be free. A paid tier is
   * refused here rather than quietly issued at no charge — that route is
   * create-intent, which takes money.
   */
  let claimedTier: { id: string; tier_name: string; price: number; capacity: number } | null = null;
  {
    const wanted = admin.from("ticket_tiers").select("id, tier_name, price, capacity, unlock_code").eq("event_id", event_id);
    const { data: tierRows } = tier_id ? await wanted.eq("id", tier_id) : await wanted.order("sort_order", { ascending: true }).limit(1);
    const tier = (tierRows ?? [])[0] as
      | { id: string; tier_name: string; price: number; capacity: number; unlock_code: string | null }
      | undefined;

    if (tier_id && !tier) {
      return NextResponse.json({ error: "Ticket tier not found" }, { status: 404 });
    }

    if (tier) {
      if (Number(tier.price) > 0) {
        return NextResponse.json(
          { error: "That tier is not free. Please check out normally." },
          { status: 400 }
        );
      }

      // A locked tier needs its code here too — the free path must not be a
      // way around the lock.
      if (!unlocksTier(tier.unlock_code, unlock_code)) {
        return NextResponse.json({ error: "That tier needs an unlock code." }, { status: 403 });
      }

      // Free does not mean unlimited. Seated events are governed by the seats
      // table instead, which validateAndHoldSeats already enforces.
      if (!(Array.isArray(seat_ids) && seat_ids.length > 0) && Number(tier.capacity) > 0) {
        const { count: claimed } = await admin
          .from("tickets")
          .select("id", { count: "exact", head: true })
          .eq("event_id", event_id)
          .eq("ticket_type_id", tier.id);
        if ((claimed ?? 0) + quantity > Number(tier.capacity)) {
          return NextResponse.json(
            { error: "There are not that many left for this tier." },
            { status: 409 }
          );
        }
      }

      claimedTier = { id: tier.id, tier_name: tier.tier_name, price: Number(tier.price), capacity: Number(tier.capacity) };
    }
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
      customer_name: fullName,
      customer_email: buyer_email,
      customer_phone: buyer_phone || null,
      customer_zip: String(buyer_zip ?? "").trim() || null,
      quantity,
      total_amount: 0,
      status: "paid",
      // A free claim is its OWN thing. It is not a comp — nobody gave it away,
      // the holder claimed it — and it is not a sale, because no money moved.
      // Recording it as "online" made a $0 RSVP indistinguishable from a real
      // sale except by its total.
      source: "free",
      promo_code_id: promoCodeId || null,
      tracking_link_slug: tracking_ref || null,
      utm_source: utm_source || null,
      utm_medium: utm_medium || null,
      utm_campaign: utm_campaign || null,
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
      ticket_type_id: claimedTier?.id || null,
      customer_name: fullName,
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
      // A free ticket has no money in it at all: no face value, no service or
      // facility fee, and no processing fee, because there was no charge.
      // Every column is a real, written zero rather than a gap — 152 rows
      // predating this recorded a NEGATIVE face value (-$978.10 in total) and
      // $1,002 of platform fee revenue nobody ever paid, because the fee was
      // subtracted from a gross of zero. See lib/settlement/ledger.ts.
      gross_amount: 0,
      ticket_revenue: 0,
      ticketing_fee: 0,
      facility_fee: 0,
      venue_rebate: 0,
      tax_collected: 0,
      stripe_fee: 0,
      stripe_fee_actual: 0,
      stripe_net: 0,
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
      // Prefer the two fields the free form actually collects; fall back to
      // splitting a single name for callers that still send one.
      const nameParts = [
        String(buyer_first_name ?? "").trim() || fullName.split(" ")[0] || "",
        String(buyer_last_name ?? "").trim() || fullName.split(" ").slice(1).join(" "),
      ];
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

  // ── Send confirmation email — same bespoke design as a paid GA purchase ──
  // (sendTicketEmail renders lib/email/TicketDeliveryEmail.tsx; totalAmount 0
  // renders "$0.00 / Free"). Guards on RESEND_API_KEY internally.
  if (buyer_email && createdTickets && createdTickets.length > 0) {
    try {
      await sendTicketEmail({
        to: buyer_email,
        customerName: fullName,
        eventTitle: event.title,
        eventDate: event.date,
        eventVenue: event.venue,
        eventImage: event.image_url,
        ticketCount: quantity,
        totalAmount: 0,
        ticketId: createdTickets[0].qr_code,
        venueSlug,
      });
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

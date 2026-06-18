import { createAdminClient } from "@/lib/supabase-server";
import { getStripe } from "@/lib/stripe";
import { resolveVenueFees, calculateFees } from "@/lib/checkout-helpers";
import { NextResponse } from "next/server";

/**
 * POST /api/admin/orders/[orderId]/payment-request
 *
 * Creates a Stripe Checkout Session for the CORRECT amount and emails the
 * customer a payment link. The amount is calculated server-side from
 * tier_id + quantity using the same fee logic as the customer checkout —
 * no client-submitted dollar amounts are trusted.
 *
 * Body: { tier_id: string, quantity: number, note?: string }
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ orderId: string }> }
) {
  const { orderId } = await params;
  const body = await req.json().catch(() => ({}));
  const { tier_id, quantity: rawQty, note } = body;
  const quantity = Math.max(1, parseInt(String(rawQty ?? 1), 10));

  if (!tier_id) {
    return NextResponse.json({ error: "tier_id is required" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Load order + event
  const { data: order, error: orderError } = await admin
    .from("orders")
    .select(`*, events!inner(id, title, date, venue, venue_id, price, event_venue_id, facility_fee_enabled)`)
    .eq("id", orderId)
    .single();

  if (orderError || !order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  // Verify the tier belongs to this event
  const { data: tier, error: tierError } = await admin
    .from("ticket_tiers")
    .select("id, tier_name, price")
    .eq("id", tier_id)
    .eq("event_id", order.events.id)
    .single();

  if (tierError || !tier) {
    return NextResponse.json({ error: "Ticket tier not found for this event" }, { status: 404 });
  }

  // Calculate fees server-side — identical logic to the customer checkout
  const fees = await resolveVenueFees(admin, order.events);
  const effectiveTaxRate = fees.taxMethod === "divisor" ? 0 : fees.taxRate;
  const ticketPriceCents = Math.round(tier.price * 100);

  const breakdown = calculateFees({
    ticketPriceCents,
    discountCentsPerTicket: 0,
    ticketingFee: fees.ticketingFee,
    facilityFee: fees.facilityFee,
    taxRate: effectiveTaxRate,
    quantity,
  });

  const totalCents = breakdown.totalCents;

  // Sanity check: total must be positive and reasonable
  // Max = ticket price × quantity × 10 (covers all fees with huge margin)
  const maxReasonableCents = ticketPriceCents * quantity * 10;
  if (totalCents <= 0 || totalCents > maxReasonableCents) {
    console.error(`PAYMENT REQUEST GUARD: totalCents ${totalCents} out of range for tier ${tier_id} qty ${quantity}`);
    return NextResponse.json({ error: "Calculated amount is out of expected range. Check tier pricing." }, { status: 400 });
  }

  const origin = req.headers.get("origin") || "https://shoals-ticketing.vercel.app";
  const stripe = getStripe();

  // Build a clear Stripe line item breakdown so the customer sees what they're paying for
  const lineItems = [];

  // Ticket price
  lineItems.push({
    price_data: {
      currency: "usd",
      product_data: {
        name: `${order.events.title} — ${tier.tier_name}`,
        description: `Corrected payment for Order #${orderId.slice(0, 8).toUpperCase()}`,
      },
      unit_amount: breakdown.discountedTicketPriceCents,
    },
    quantity,
  });

  // Ticketing fee
  if (breakdown.ticketingFeeCents > 0) {
    lineItems.push({
      price_data: {
        currency: "usd",
        product_data: { name: "Ticketing Fee" },
        unit_amount: breakdown.ticketingFeeCents,
      },
      quantity,
    });
  }

  // Facility fee
  if (breakdown.facilityFeeCents > 0) {
    lineItems.push({
      price_data: {
        currency: "usd",
        product_data: { name: "Facility Fee" },
        unit_amount: breakdown.facilityFeeCents,
      },
      quantity,
    });
  }

  // Tax
  if (breakdown.taxCents > 0) {
    lineItems.push({
      price_data: {
        currency: "usd",
        product_data: { name: `Sales Tax (${(fees.taxRate * 100).toFixed(1)}%)` },
        unit_amount: breakdown.taxCents,
      },
      quantity,
    });
  }

  // Processing fee (flat per transaction)
  if (breakdown.stripeFeeCents > 0) {
    lineItems.push({
      price_data: {
        currency: "usd",
        product_data: { name: "Processing Fee" },
        unit_amount: breakdown.stripeFeeCents,
      },
      quantity: 1,
    });
  }

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: order.customer_email,
    line_items: lineItems,
    metadata: {
      type: "billing_correction",
      order_id: orderId,
      event_id: order.events.id,
    },
    success_url: `${origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/events/${order.events.id}`,
  });

  // Send email via Resend
  const resendKey = process.env.RESEND_API_KEY;
  if (resendKey && session.url) {
    const eventDate = new Date(order.events.date).toLocaleDateString("en-US", {
      weekday: "long", month: "long", day: "numeric", year: "numeric",
    });
    const displayTotal = (totalCents / 100).toFixed(2);
    const customerNote = note?.trim() || "We had a billing issue with your recent order and issued a full refund. Your table is still reserved for you. Please use the link below to complete your purchase at the correct price.";

    const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /></head>
<body style="margin:0;padding:0;background:#0b0d1d;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0b0d1d;padding:32px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="width:100%;max-width:560px;background:#131629;border-radius:12px;overflow:hidden;border:1px solid rgba(208,194,144,0.15);">
        <tr><td style="background:#d0c290;padding:20px 28px;">
          <p style="margin:0;font-size:11px;font-weight:700;letter-spacing:2px;color:#0b0d1d;text-transform:uppercase;">West72 Entertainment</p>
          <h1 style="margin:6px 0 0;font-size:22px;font-weight:800;color:#0b0d1d;">Complete Your Payment</h1>
        </td></tr>
        <tr><td style="padding:28px 28px 20px;">
          <p style="margin:0 0 16px;color:rgba(255,255,255,0.7);font-size:15px;line-height:1.6;">
            Hey ${order.customer_name ? order.customer_name.split(" ")[0] : "there"},
          </p>
          <p style="margin:0 0 20px;color:rgba(255,255,255,0.7);font-size:15px;line-height:1.6;">${customerNote}</p>

          <table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(208,194,144,0.08);border:1px solid rgba(208,194,144,0.2);border-radius:10px;margin-bottom:20px;">
            <tr><td style="padding:18px 20px;">
              <p style="margin:0;font-size:18px;font-weight:700;color:#d0c290;">${order.events.title}</p>
              <p style="margin:6px 0 0;font-size:14px;color:rgba(255,255,255,0.6);">${eventDate}</p>
              <p style="margin:4px 0 0;font-size:14px;color:rgba(255,255,255,0.6);">${order.events.venue}</p>
              <p style="margin:10px 0 0;font-size:13px;color:rgba(255,255,255,0.45);">
                ${tier.tier_name}${quantity > 1 ? ` × ${quantity}` : ""} &nbsp;·&nbsp; $${(tier.price * quantity).toFixed(2)} + fees
              </p>
            </td></tr>
          </table>

          <!-- Fee breakdown -->
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
            <tr><td style="padding:0 4px;">
              ${[
                [`${tier.tier_name}${quantity > 1 ? ` × ${quantity}` : ""}`, breakdown.discountedTicketPriceCents * quantity],
                ...(breakdown.ticketingFeeCents > 0 ? [[`Ticketing fee${quantity > 1 ? ` × ${quantity}` : ""}`, breakdown.ticketingFeeCents * quantity]] : []),
                ...(breakdown.facilityFeeCents > 0 ? [[`Facility fee${quantity > 1 ? ` × ${quantity}` : ""}`, breakdown.facilityFeeCents * quantity]] : []),
                ...(breakdown.taxCents > 0 ? [[`Sales tax (${(fees.taxRate * 100).toFixed(1)}%)${quantity > 1 ? ` × ${quantity}` : ""}`, breakdown.taxCents * quantity]] : []),
                ...(breakdown.stripeFeeCents > 0 ? [["Processing fee", breakdown.stripeFeeCents]] : []),
              ].map(([label, cents]) => `
                <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:4px;">
                  <tr>
                    <td style="font-size:13px;color:rgba(255,255,255,0.5);">${label}</td>
                    <td align="right" style="font-size:13px;color:rgba(255,255,255,0.5);">$${((cents as number) / 100).toFixed(2)}</td>
                  </tr>
                </table>`).join("")}
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:8px;border-top:1px solid rgba(255,255,255,0.1);padding-top:8px;">
                <tr>
                  <td style="font-size:16px;font-weight:700;color:#d0c290;">Total Due</td>
                  <td align="right" style="font-size:16px;font-weight:700;color:#d0c290;">$${displayTotal}</td>
                </tr>
              </table>
            </td></tr>
          </table>

          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
            <tr><td align="center">
              <a href="${session.url}" style="display:inline-block;background:#d0c290;color:#0b0d1d;font-weight:700;font-size:15px;padding:14px 40px;border-radius:8px;text-decoration:none;">
                Pay $${displayTotal} Now →
              </a>
            </td></tr>
          </table>

          <p style="margin:0;font-size:13px;color:rgba(255,255,255,0.4);line-height:1.6;text-align:center;">
            Your seats are still reserved. If you have questions reply to this email.
          </p>
        </td></tr>
        <tr><td style="padding:14px 28px;background:rgba(0,0,0,0.2);text-align:center;">
          <p style="margin:0;font-size:11px;color:rgba(255,255,255,0.2);">Powered by VenueCore · <a href="https://venuecore.live" style="color:rgba(208,194,144,0.4);text-decoration:none;">venuecore.live</a></p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

    // 1. Customer email — payment link
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "West 72 Entertainment <ticketing@west72ent.com>",
        to: [order.customer_email],
        subject: `Action required: complete your payment for ${order.events.title}`,
        html,
      }),
    });

    // 2. Admin receipt — itemized exactly as Stripe received it, plus session link
    const stripeLineItemRows = [
      ...lineItems.map((item) => {
        const name = item.price_data.product_data.name;
        const unitAmount = item.price_data.unit_amount;
        const qty = item.quantity;
        const lineTotal = unitAmount * qty;
        return `<tr>
          <td style="padding:6px 0;font-size:13px;color:#333;border-bottom:1px solid #eee;">${name}</td>
          <td style="padding:6px 0;font-size:13px;color:#333;text-align:center;border-bottom:1px solid #eee;">${qty}</td>
          <td style="padding:6px 0;font-size:13px;color:#333;text-align:right;border-bottom:1px solid #eee;">$${(unitAmount / 100).toFixed(2)}</td>
          <td style="padding:6px 0;font-size:13px;font-weight:600;color:#111;text-align:right;border-bottom:1px solid #eee;">$${(lineTotal / 100).toFixed(2)}</td>
        </tr>`;
      }),
      `<tr>
        <td colspan="3" style="padding:10px 0 4px;font-size:14px;font-weight:700;color:#111;">Total charged to Stripe</td>
        <td style="padding:10px 0 4px;font-size:14px;font-weight:700;color:#111;text-align:right;">$${displayTotal}</td>
      </tr>`,
    ].join("");

    const adminHtml = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:32px;background:#f5f5f5;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:8px;padding:28px 32px;border:1px solid #e0e0e0;">
    <h2 style="margin:0 0 4px;font-size:18px;color:#111;">Payment Request Sent</h2>
    <p style="margin:0 0 24px;font-size:13px;color:#666;">This is your admin receipt — itemized exactly as sent to Stripe.</p>

    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;border:1px solid #e0e0e0;border-radius:6px;overflow:hidden;">
      <tr style="background:#f9f9f9;">
        <td style="padding:8px 12px;font-size:11px;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:1px;">Customer</td>
        <td colspan="3" style="padding:8px 12px;font-size:13px;color:#111;">${order.customer_name} &lt;${order.customer_email}&gt;</td>
      </tr>
      <tr>
        <td style="padding:8px 12px;font-size:11px;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:1px;">Event</td>
        <td colspan="3" style="padding:8px 12px;font-size:13px;color:#111;">${order.events.title}</td>
      </tr>
      <tr style="background:#f9f9f9;">
        <td style="padding:8px 12px;font-size:11px;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:1px;">Order ID</td>
        <td colspan="3" style="padding:8px 12px;font-size:13px;font-family:monospace;color:#111;">${orderId.slice(0, 8).toUpperCase()}</td>
      </tr>
      <tr>
        <td style="padding:8px 12px;font-size:11px;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:1px;">Stripe Session</td>
        <td colspan="3" style="padding:8px 12px;font-size:13px;font-family:monospace;color:#111;">
          <a href="https://dashboard.stripe.com/payments/${session.id}" style="color:#5469d4;">${session.id}</a>
        </td>
      </tr>
    </table>

    <h3 style="margin:0 0 10px;font-size:14px;font-weight:700;color:#111;text-transform:uppercase;letter-spacing:1px;">Stripe Line Items (exact)</h3>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      <thead>
        <tr style="background:#f5f5f5;">
          <th style="padding:8px 0;font-size:11px;color:#888;text-align:left;font-weight:700;text-transform:uppercase;letter-spacing:1px;">Item</th>
          <th style="padding:8px 0;font-size:11px;color:#888;text-align:center;font-weight:700;text-transform:uppercase;letter-spacing:1px;">Qty</th>
          <th style="padding:8px 0;font-size:11px;color:#888;text-align:right;font-weight:700;text-transform:uppercase;letter-spacing:1px;">Unit</th>
          <th style="padding:8px 0;font-size:11px;color:#888;text-align:right;font-weight:700;text-transform:uppercase;letter-spacing:1px;">Total</th>
        </tr>
      </thead>
      <tbody>${stripeLineItemRows}</tbody>
    </table>

    <div style="background:#f0f7ff;border:1px solid #c0d8f0;border-radius:6px;padding:14px 16px;margin-bottom:20px;">
      <p style="margin:0;font-size:12px;color:#444;line-height:1.6;">
        The customer has been sent a Stripe-hosted checkout link. When they complete payment,
        the order will automatically update to <strong>Paid</strong> at $${displayTotal}.
        No new tickets or seat assignments will be created — their existing tickets remain valid.
      </p>
    </div>

    <p style="margin:0;font-size:11px;color:#aaa;">Sent by VenueCore admin panel · ${new Date().toLocaleString("en-US", { timeZone: "America/Chicago" })} CT</p>
  </div>
</body>
</html>`;

    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "West 72 Entertainment <ticketing@west72ent.com>",
        to: ["Matt.irby@west72ent.com"],
        subject: `[Admin] Payment request sent — ${order.customer_name} · $${displayTotal} · ${order.events.title}`,
        html: adminHtml,
      }),
    });
  }

  return NextResponse.json({
    success: true,
    checkoutUrl: session.url,
    sentTo: order.customer_email,
    totalCents,
    breakdown: {
      ticketPrice: breakdown.discountedTicketPriceCents * quantity,
      ticketingFee: breakdown.ticketingFeeCents * quantity,
      facilityFee: breakdown.facilityFeeCents * quantity,
      tax: breakdown.taxCents * quantity,
      processingFee: breakdown.stripeFeeCents,
      total: totalCents,
    },
  });
}

import { createAdminClient } from "@/lib/supabase-server";
import { getStripe } from "@/lib/stripe";
import { NextResponse } from "next/server";

/**
 * POST /api/admin/orders/[orderId]/payment-request
 *
 * Creates a Stripe Checkout Session for the correct amount and emails the
 * customer a payment link. When paid, the webhook (billing_correction handler)
 * updates the existing order — no new tickets or seat assignments are created.
 *
 * Body: { amount_cents: number, note?: string }
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ orderId: string }> }
) {
  const { orderId } = await params;
  const body = await req.json().catch(() => ({}));
  const amountCents: number = body.amount_cents;

  if (!amountCents || amountCents < 50) {
    return NextResponse.json({ error: "amount_cents must be at least 50 (50¢)" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Load order + event
  const { data: order, error: orderError } = await admin
    .from("orders")
    .select(`*, events!inner(id, title, date, venue, venue_id)`)
    .eq("id", orderId)
    .single();

  if (orderError || !order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  const origin = req.headers.get("origin") || "https://shoals-ticketing.vercel.app";
  const stripe = getStripe();

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: order.customer_email,
    line_items: [
      {
        price_data: {
          currency: "usd",
          product_data: {
            name: `${order.events.title} — Table`,
            description: `${order.events.venue} · Corrected payment for Order #${orderId.slice(0, 8).toUpperCase()}`,
          },
          unit_amount: amountCents,
        },
        quantity: 1,
      },
    ],
    metadata: {
      type: "billing_correction",
      order_id: orderId,
      event_id: order.events.id,
    },
    success_url: `${origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/events/${order.events.id}`,
  });

  // Send the payment link to the customer via Resend
  const resendKey = process.env.RESEND_API_KEY;
  if (resendKey && session.url) {
    const eventDate = new Date(order.events.date).toLocaleDateString("en-US", {
      weekday: "long", month: "long", day: "numeric", year: "numeric",
    });
    const amount = (amountCents / 100).toFixed(2);
    const note = body.note?.trim() || "";

    const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /></head>
<body style="margin:0;padding:0;background:#0b0d1d;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0b0d1d;padding:32px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="width:100%;max-width:560px;background:#131629;border-radius:12px;overflow:hidden;border:1px solid rgba(208,194,144,0.15);">
        <tr><td style="background:#d0c290;padding:20px 28px;">
          <p style="margin:0;font-size:11px;font-weight:700;letter-spacing:2px;color:#0b0d1d;text-transform:uppercase;">VenueCore</p>
          <h1 style="margin:6px 0 0;font-size:22px;font-weight:800;color:#0b0d1d;">Complete Your Payment</h1>
        </td></tr>
        <tr><td style="padding:28px 28px 20px;">
          <p style="margin:0 0 16px;color:rgba(255,255,255,0.7);font-size:15px;line-height:1.6;">
            Hey ${order.customer_name ? order.customer_name.split(" ")[0] : "there"},
          </p>
          ${note ? `<p style="margin:0 0 16px;color:rgba(255,255,255,0.7);font-size:15px;line-height:1.6;">${note}</p>` : `
          <p style="margin:0 0 16px;color:rgba(255,255,255,0.7);font-size:15px;line-height:1.6;">
            We had a billing issue with your recent order and issued a full refund. Your table and tickets are still reserved for you. Please use the link below to complete your purchase at the correct price.
          </p>`}

          <table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(208,194,144,0.08);border:1px solid rgba(208,194,144,0.2);border-radius:10px;margin-bottom:24px;">
            <tr><td style="padding:18px 20px;">
              <p style="margin:0;font-size:18px;font-weight:700;color:#d0c290;">${order.events.title}</p>
              <p style="margin:6px 0 0;font-size:14px;color:rgba(255,255,255,0.6);">${eventDate}</p>
              <p style="margin:4px 0 0;font-size:14px;color:rgba(255,255,255,0.6);">${order.events.venue}</p>
              <p style="margin:12px 0 0;font-size:16px;font-weight:700;color:#d0c290;">Amount due: $${amount}</p>
            </td></tr>
          </table>

          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
            <tr><td align="center">
              <a href="${session.url}" style="display:inline-block;background:#d0c290;color:#0b0d1d;font-weight:700;font-size:14px;padding:14px 40px;border-radius:8px;text-decoration:none;">
                Pay $${amount} Now →
              </a>
            </td></tr>
          </table>

          <p style="margin:0;font-size:13px;color:rgba(255,255,255,0.4);line-height:1.6;">
            Your existing tickets and seat assignments remain valid. If you have questions, reply to this email.
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

    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "VenueCore Tickets <tickets@venuecore.live>",
        to: [order.customer_email],
        subject: `Action required: complete payment for ${order.events.title}`,
        html,
      }),
    });
  }

  return NextResponse.json({
    success: true,
    checkoutUrl: session.url,
    sentTo: order.customer_email,
  });
}

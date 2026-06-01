// Shared ticket email template + send function.
// Used by the Stripe webhook (initial send) and the admin resend endpoint.

export function ticketEmailHtml({
  customerName,
  eventTitle,
  eventDate,
  eventVenue,
  ticketCount,
  totalAmount,
  qrDataUrl,
  ticketUrl,
  seatAssignments,
}: {
  customerName: string;
  eventTitle: string;
  eventDate: string;
  eventVenue: string;
  ticketCount: number;
  totalAmount: number;
  qrDataUrl: string;
  ticketUrl: string;
  seatAssignments?: { section: string; row: string; seat: string }[];
}) {
  const formattedDate = new Date(eventDate).toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
  });

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Your ${ticketCount > 1 ? 'Tickets' : 'Ticket'} — ${eventTitle}</title>
</head>
<body style="margin:0;padding:0;background:#0b0d1d;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0b0d1d;padding:32px 0;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="width:100%;max-width:560px;background:#131629;border-radius:12px;overflow:hidden;border:1px solid rgba(208,194,144,0.15);">

          <!-- Header -->
          <tr>
            <td style="background:#d0c290;padding:20px 28px;">
              <p style="margin:0;font-size:11px;font-weight:700;letter-spacing:2px;color:#0b0d1d;text-transform:uppercase;">VenueCore</p>
              <h1 style="margin:6px 0 0;font-size:22px;font-weight:800;color:#0b0d1d;">Your ${ticketCount > 1 ? 'Tickets are' : 'Ticket is'} Ready</h1>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:28px 28px 20px;">
              <p style="margin:0 0 20px;color:rgba(255,255,255,0.7);font-size:15px;line-height:1.6;">
                Hey ${customerName ? customerName.split(" ")[0] : "there"},<br/>
                You&apos;re all set! Here&apos;s everything you need for the show.
              </p>

              <!-- Event info box -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(208,194,144,0.08);border:1px solid rgba(208,194,144,0.2);border-radius:10px;margin-bottom:24px;">
                <tr>
                  <td style="padding:18px 20px;">
                    <p style="margin:0;font-size:18px;font-weight:700;color:#d0c290;">${eventTitle}</p>
                    <p style="margin:6px 0 0;font-size:14px;color:rgba(255,255,255,0.6);">${formattedDate}</p>
                    <p style="margin:4px 0 0;font-size:14px;color:rgba(255,255,255,0.6);">${eventVenue}</p>
                    <p style="margin:10px 0 0;font-size:13px;color:rgba(255,255,255,0.4);">
                      ${ticketCount} ticket${ticketCount !== 1 ? "s" : ""} · $${totalAmount.toFixed(2)} total
                    </p>
                  </td>
                </tr>
              </table>

              ${seatAssignments && seatAssignments.length > 0 ? `
              <!-- Assigned Seats -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(99,102,241,0.08);border:1px solid rgba(99,102,241,0.2);border-radius:10px;margin-bottom:24px;">
                <tr>
                  <td style="padding:16px 20px;">
                    <p style="margin:0 0 10px;font-size:14px;font-weight:700;color:#818cf8;">Your Assigned Seats</p>
                    ${seatAssignments.map((s) => `
                    <p style="margin:4px 0;font-size:14px;color:rgba(255,255,255,0.7);">
                      ${s.row
                        ? `<span style="color:#d0c290;font-weight:600;">${s.section}</span> &middot; Row ${s.row} &middot; Seat ${s.seat}`
                        : `<span style="color:#d0c290;font-weight:700;">${s.seat}</span>`
                      }
                    </p>`).join("")}
                  </td>
                </tr>
              </table>
              ` : ""}

              <!-- QR Entry Notice -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(208,194,144,0.06);border:1px solid rgba(208,194,144,0.15);border-radius:10px;margin-bottom:20px;">
                <tr>
                  <td style="padding:16px 20px;text-align:center;">
                    <p style="margin:0 0 4px;font-size:14px;font-weight:700;color:#d0c290;">Your QR Code Is Your Ticket</p>
                    <p style="margin:0;font-size:13px;color:rgba(255,255,255,0.5);line-height:1.5;">
                      Present your QR code at the door for entry. Screenshot it, save it to your photos, or print a copy &mdash; just have it ready when you arrive.
                    </p>
                  </td>
                </tr>
              </table>

              <!-- CTA button -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
                <tr>
                  <td align="center">
                    <a href="${ticketUrl}" style="display:inline-block;background:#d0c290;color:#0b0d1d;font-weight:700;font-size:14px;padding:12px 32px;border-radius:8px;text-decoration:none;">
                      View My ${ticketCount > 1 ? 'Tickets' : 'Ticket'} &amp; QR Code
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Fine print -->
              <p style="margin:0;font-size:12px;color:rgba(255,255,255,0.3);line-height:1.6;border-top:1px solid rgba(255,255,255,0.06);padding-top:20px;">
                All sales are final. Refunds are issued only if the event is cancelled by the organizer.
                Questions? Reply to this email or contact <a href="mailto:support@venuecore.live" style="color:rgba(208,194,144,0.6);">support@venuecore.live</a>.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:14px 28px;background:rgba(0,0,0,0.2);text-align:center;">
              <p style="margin:0;font-size:11px;color:rgba(255,255,255,0.2);">
                Powered by VenueCore · <a href="https://venuecore.live" style="color:rgba(208,194,144,0.4);text-decoration:none;">venuecore.live</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export async function sendTicketEmail({
  to,
  customerName,
  eventTitle,
  eventDate,
  eventVenue,
  ticketCount,
  totalAmount,
  qrDataUrl,
  ticketId,
  venueSlug,
  seatAssignments,
}: {
  to: string;
  customerName: string;
  eventTitle: string;
  eventDate: string;
  eventVenue: string;
  ticketCount: number;
  totalAmount: number;
  qrDataUrl: string;
  ticketId: string;
  venueSlug: string;
  seatAssignments?: { section: string; row: string; seat: string }[];
}): Promise<{ success: boolean; error?: string }> {
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    console.warn("RESEND_API_KEY not set — skipping ticket email");
    return { success: false, error: "RESEND_API_KEY not configured" };
  }

  const fromEmail = venueSlug ? `${venueSlug}@venuecore.live` : "tickets@venuecore.live";
  const ticketUrl = `https://venuecore.live/tickets/${ticketId}`;

  const html = ticketEmailHtml({
    customerName,
    eventTitle,
    eventDate,
    eventVenue,
    ticketCount,
    totalAmount,
    qrDataUrl,
    ticketUrl,
    seatAssignments,
  });

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: `VenueCore Tickets <${fromEmail}>`,
      to: [to],
      subject: `Your ${ticketCount > 1 ? 'tickets' : 'ticket'} for ${eventTitle}`,
      html,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error("Resend email failed:", err);
    return { success: false, error: err };
  }

  console.log(`Ticket email sent to ${to}`);
  return { success: true };
}

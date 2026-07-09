// Ticket delivery email — sent by the Stripe webhook on successful
// checkout, and resendable via the admin resend-email endpoint.
//
// Renders lib/email/TicketDeliveryEmail.tsx directly (a bespoke React Email
// component matching "your ticket is here email.psd"). Previously tried
// routing through the DB-backed block composer (transactional-templates.ts)
// — abandoned because that system's block components have their own fixed
// generic styling with no way to pixel-match a specific design. That
// composer/DB row still exists and is harmless, just no longer read here.
import { render } from "@react-email/components";
import { TicketDeliveryEmail } from "./TicketDeliveryEmail";

export async function sendTicketEmail({
  to,
  customerName,
  eventTitle,
  eventDate,
  eventVenue,
  eventImage,
  ticketCount,
  totalAmount,
  ticketId,
  venueSlug,
  operatorSlug = "venuecore",
}: {
  to: string;
  customerName: string;
  eventTitle: string;
  eventDate: string;
  eventVenue: string;
  /** events.image_url — NOT the email flyer (email_flyer_url). */
  eventImage?: string;
  ticketCount: number;
  totalAmount: number;
  qrDataUrl?: string;
  ticketId: string;
  venueSlug: string;
  operatorSlug?: string;
  seatAssignments?: { section: string; row: string; seat: string }[];
}): Promise<{ success: boolean; error?: string }> {
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    console.warn("RESEND_API_KEY not set — skipping ticket email");
    return { success: false, error: "RESEND_API_KEY not configured" };
  }

  const { getOperator } = await import("@/lib/operators");
  const operator = getOperator(operatorSlug);
  const ticketUrl = `https://${operator.domain}/tickets/${ticketId}`;

  const firstName = customerName?.split(" ")[0] || "there";
  const formattedDate = eventDate
    ? new Date(eventDate).toLocaleDateString("en-US", {
        weekday: "long", month: "long", day: "numeric", year: "numeric",
      })
    : eventDate;

  const html = await render(
    TicketDeliveryEmail({
      firstName,
      eventName: eventTitle,
      eventDate: formattedDate,
      venueName: eventVenue,
      ticketCount,
      totalAmount,
      heroImageUrl: eventImage ?? "",
      ticketUrl,
      previewText: `Hey ${firstName}, Thank you for coming to the show!`,
    }),
  );

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "West 72 Entertainment <tickets@west72ent.com>",
      to: [to],
      subject: `Your ${ticketCount > 1 ? "tickets" : "ticket"} for ${eventTitle}`,
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

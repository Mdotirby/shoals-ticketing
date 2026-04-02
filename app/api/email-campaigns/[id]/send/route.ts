import { createAdminClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";

// POST /api/email-campaigns/[id]/send — Send a campaign
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const admin = createAdminClient();

  // Fetch campaign with template
  const { data: campaign, error: campError } = await admin
    .from("email_campaigns")
    .select("*, email_templates(subject, body_html)")
    .eq("id", id)
    .single();

  if (campError || !campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  if (campaign.status === "sent") {
    return NextResponse.json({ error: "Campaign already sent" }, { status: 400 });
  }

  // Get recipient list based on audience_type
  let recipients: { email: string; name: string }[] = [];

  if (campaign.audience_type === "event_buyers" && campaign.event_id) {
    const { data: orders } = await admin
      .from("orders")
      .select("customer_email, customer_name")
      .eq("event_id", campaign.event_id)
      .eq("status", "paid");

    // Deduplicate by email
    const seen = new Set<string>();
    (orders ?? []).forEach((o: { customer_email: string; customer_name: string }) => {
      const email = o.customer_email?.toLowerCase();
      if (email && !seen.has(email)) {
        seen.add(email);
        recipients.push({ email, name: o.customer_name || "" });
      }
    });
  } else if (campaign.audience_type === "fwb_subscribers") {
    const { data: subs } = await admin
      .from("newsletter_subscribers")
      .select("email, first_name, last_name")
      .is("unsubscribed_at", null);

    recipients = (subs ?? []).map((s: { email: string; first_name: string; last_name: string }) => ({
      email: s.email,
      name: `${s.first_name} ${s.last_name}`.trim(),
    }));
  } else if (campaign.audience_type === "all_customers") {
    const { data: orders } = await admin
      .from("orders")
      .select("customer_email, customer_name")
      .eq("status", "paid");

    const seen = new Set<string>();
    (orders ?? []).forEach((o: { customer_email: string; customer_name: string }) => {
      const email = o.customer_email?.toLowerCase();
      if (email && !seen.has(email)) {
        seen.add(email);
        recipients.push({ email, name: o.customer_name || "" });
      }
    });
  }

  if (recipients.length === 0) {
    return NextResponse.json({ error: "No recipients found for this audience" }, { status: 400 });
  }

  // Get template details
  const subject = campaign.subject_override || campaign.email_templates?.subject || "Update from VenueCore";
  let bodyHtml = campaign.email_templates?.body_html || "<p>No content</p>";

  // ── Fetch event data for template variable replacement ──
  let eventTitle = "";
  let eventDate = "";
  let venueName = "";
  let eventImage = "";
  let eventId = campaign.event_id || "";

  if (campaign.event_id) {
    const { data: eventData } = await admin
      .from("events")
      .select("title, date, venue, venue_id, image_url")
      .eq("id", campaign.event_id)
      .single();

    if (eventData) {
      eventTitle = eventData.title || "";
      eventImage = eventData.image_url || "";

      // Try to get venue name from venues table, fall back to event.venue string
      if (eventData.venue_id) {
        const { data: venueRow } = await admin
          .from("venues")
          .select("name")
          .eq("id", eventData.venue_id)
          .single();
        venueName = venueRow?.name || eventData.venue || "";
      } else {
        venueName = eventData.venue || "";
      }

      if (eventData.date) {
        try {
          const d = new Date(eventData.date);
          eventDate = d.toLocaleDateString("en-US", {
            weekday: "long",
            month: "long",
            day: "numeric",
            year: "numeric",
          });
        } catch {
          eventDate = eventData.date;
        }
      }
    }
  }

  // Replace event-level variables in the template (same for all recipients)
  bodyHtml = bodyHtml
    .replace(/\{\{event_title\}\}/g, eventTitle)
    .replace(/\{\{event_date\}\}/g, eventDate)
    .replace(/\{\{venue_name\}\}/g, venueName)
    .replace(/\{\{event_id\}\}/g, eventId)
    .replace(/\{\{event_image\}\}/g, eventImage);

  // If no event image, remove any image blocks that reference it to avoid broken images
  if (!eventImage) {
    // Remove img tags that had {{event_image}} as src (now empty string)
    bodyHtml = bodyHtml.replace(/<img[^>]*src=""[^>]*>/gi, "");
  }

  // Also replace in subject line
  const subjectWithEvent = subject
    .replace(/\{\{event_title\}\}/g, eventTitle)
    .replace(/\{\{event_date\}\}/g, eventDate)
    .replace(/\{\{venue_name\}\}/g, venueName)
    .replace(/\{\{event_id\}\}/g, eventId);

  // Send via Resend
  const resendKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL || "VenueCore <onboarding@resend.dev>";

  if (!resendKey) {
    return NextResponse.json({ error: "Email service not configured" }, { status: 500 });
  }

  const { Resend } = await import("resend");
  const resend = new Resend(resendKey);

  // Create email_sends records and send
  let sentCount = 0;
  for (const recipient of recipients) {
    const firstName = recipient.name.split(" ")[0] || "there";
    const personalizedHtml = bodyHtml
      .replace(/\{\{first_name\}\}/g, firstName)
      .replace(/\{\{email\}\}/g, recipient.email)
      .replace(/\{\{name\}\}/g, recipient.name);

    try {
      const emailRes = await resend.emails.send({
        from: fromEmail,
        to: recipient.email,
        subject: subjectWithEvent.replace(/\{\{first_name\}\}/g, firstName),
        html: personalizedHtml,
      });

      // Log the send
      await admin.from("email_sends").insert({
        campaign_id: id,
        resend_message_id: emailRes.data?.id || null,
        recipient_email: recipient.email,
        recipient_name: recipient.name,
        status: "sent",
      });

      sentCount++;
    } catch (err) {
      console.error(`Failed to send to ${recipient.email}:`, err);
      await admin.from("email_sends").insert({
        campaign_id: id,
        recipient_email: recipient.email,
        recipient_name: recipient.name,
        status: "failed",
      });
    }
  }

  // Update campaign status
  await admin
    .from("email_campaigns")
    .update({
      status: "sent",
      sent_at: new Date().toISOString(),
      total_recipients: sentCount,
    })
    .eq("id", id);

  return NextResponse.json({ sent: sentCount, total: recipients.length });
}

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-server";
import { renderEmail, EMAIL_ENGINE } from "@/modules/email-engine";
import {
  loadEventContext,
  previewEventDefaults,
} from "@/modules/email-engine/lib/eventContext";

/**
 * POST /api/email-engine/render-preview
 *
 * Server-side preview for the composer. Takes the draft subject + HTML +
 * optional event_id and returns a fully-rendered preview using the SAME
 * pipeline that actually sends the email (loadEventContext + renderEmail).
 *
 * This keeps the composer's iframe preview 1:1 with what the recipient
 * will see in their inbox — event image, venue name, on-sale countdown,
 * UTM-stamped links — so there's no drift between preview and delivery.
 *
 * Body:
 *   {
 *     subject: string,
 *     content_html: string,
 *     content_text?: string,
 *     event_id?: string,
 *     first_name?: string,
 *     email?: string,
 *   }
 *
 * Returns: { subject, html, text }
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!body?.subject || !body?.content_html) {
    return NextResponse.json(
      { error: "subject and content_html are required" },
      { status: 400 },
    );
  }

  const admin = createAdminClient();

  // Pull full event context when an event is attached; otherwise fill in
  // synthetic values so landing-page templates render cleanly.
  const eventCtx = body.event_id
    ? await loadEventContext(admin, body.event_id)
    : previewEventDefaults();

  const firstName = body.first_name || "Alex";
  const lastName  = body.last_name  || "Example";
  const recipientEmail = body.email || "preview@venuecore.live";

  const rendered = renderEmail({
    subject: body.subject,
    content_html: body.content_html,
    content_text: body.content_text ?? null,
    context: {
      ...eventCtx,
      first_name: firstName,
      last_name: lastName,
      email: recipientEmail,
    },
    utm: {
      utm_source: EMAIL_ENGINE.UTM_SOURCE,
      utm_medium: "email",
      utm_campaign: body.event_id
        ? `${EMAIL_ENGINE.UTM_CAMPAIGN_PREFIX}preview-${body.event_id}`
        : `${EMAIL_ENGINE.UTM_CAMPAIGN_PREFIX}preview`,
    },
    unsubscribe_url: (process.env.NEXT_PUBLIC_SITE_URL || "https://venuecore.live") + "/u/preview",
  });

  return NextResponse.json({
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
  });
}

import { NextRequest, NextResponse } from "next/server";
import { renderDocument } from "@/emails/render";
import { renderEmail, EMAIL_ENGINE } from "@/modules/email-engine";
import { createAdminClient } from "@/lib/supabase-server";
import { loadEventContext, previewEventDefaults } from "@/modules/email-engine/lib/eventContext";
import type { EmailDocument } from "@/emails/email-document";

/**
 * POST /api/email/render-blocks
 *
 * Renders an EmailDocument (block array) to HTML using React Email,
 * then pipes it through the existing email-engine variable substitution
 * and UTM pipeline — so the preview is 1:1 with what gets dispatched.
 *
 * Body: { document: EmailDocument, subject: string, event_id?: string }
 * Returns: { html: string, subject: string }
 */
export async function POST(req: NextRequest) {
  const body = await req.json() as {
    document: EmailDocument;
    subject?: string;
    event_id?: string;
    sample_vars?: Record<string, string>;
  };

  if (!body.document?.blocks) {
    return NextResponse.json({ error: "document.blocks is required" }, { status: 400 });
  }

  const doc = body.document as EmailDocument;

  // 1. Render React Email → HTML string
  const rawHtml = await renderDocument(doc);

  // 2. Run through email-engine variable substitution + UTM stamping
  const admin = createAdminClient();
  const eventCtx = body.event_id
    ? await loadEventContext(admin, body.event_id)
    : previewEventDefaults();

  const rendered = renderEmail({
    subject: body.subject || "Preview",
    content_html: rawHtml,
    content_text: null,
    context: {
      ...eventCtx,
      first_name: "Alex",
      last_name: "Example",
      email: "preview@venuecore.live",
      // Merge any template-specific sample vars so they're substituted
      // before the HTML is returned — prevents placeholders being blanked.
      ...(body.sample_vars ?? {}),
    },
    utm: {
      utm_source: EMAIL_ENGINE.UTM_SOURCE,
      utm_medium: "email",
      utm_campaign: `${EMAIL_ENGINE.UTM_CAMPAIGN_PREFIX}preview`,
    },
    unsubscribe_url: (process.env.NEXT_PUBLIC_SITE_URL || "https://venuecore.live") + "/u/preview",
  });

  return NextResponse.json({ html: rendered.html, subject: rendered.subject });
}

import { NextRequest, NextResponse } from "next/server";
import { renderDocument } from "@/emails/render";
import type { EmailDocument } from "@/emails/email-document";

/**
 * POST /api/email/render-blocks
 *
 * Renders an EmailDocument (block array) to HTML using React Email. Only
 * caller is the transactional template editor (user_onboarding) — mirrors
 * the real send path in app/api/admin/users/route.ts exactly (renderDocument
 * + client-side var substitution), rather than the old campaign-engine's
 * UTM/unsubscribe stamping, which never applied to a welcome email anyway.
 *
 * Body: { document: EmailDocument, subject: string }
 * Returns: { html: string, subject: string }
 */
export async function POST(req: NextRequest) {
  const body = await req.json() as {
    document: EmailDocument;
    subject?: string;
    sample_vars?: Record<string, string>;
  };

  if (!body.document?.blocks) {
    return NextResponse.json({ error: "document.blocks is required" }, { status: 400 });
  }

  const html = await renderDocument(body.document);

  return NextResponse.json({ html, subject: body.subject || "Preview" });
}

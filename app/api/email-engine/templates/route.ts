import { NextRequest, NextResponse } from "next/server";
import { EMAIL_TEMPLATES, getTemplate } from "@/modules/email-engine";

/**
 * GET /api/email-engine/templates
 *   → Returns the starter template catalog (metadata only — fast list).
 *
 * GET /api/email-engine/templates?key=event_announcement_v1
 *   → Returns the full template (subject, preview_text, HTML, text).
 */
export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key");
  if (key) {
    const t = getTemplate(key);
    if (!t) return NextResponse.json({ error: "unknown template key" }, { status: 404 });
    return NextResponse.json(t);
  }
  return NextResponse.json(
    EMAIL_TEMPLATES.map((t) => ({
      key: t.key,
      name: t.name,
      category: t.category,
      description: t.description,
      subject: t.subject,
      suggested_trigger: t.suggested_trigger ?? null,
    })),
  );
}

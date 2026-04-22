import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET  /u/[token]  — renders a tiny "you have been unsubscribed" page.
 * POST /u/[token]  — RFC 8058 one-click unsubscribe target (called by
 *                    List-Unsubscribe-Post header from Gmail/Yahoo/etc).
 *
 * Both paths mark the token used, append the email to ee_suppressions,
 * and set newsletter_subscribers.unsubscribed_at if the row exists.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const result = await unsubscribe(token);
  if (!result.ok) {
    return new NextResponse(
      `<html><body style="font-family:Helvetica,Arial;padding:32px;text-align:center"><h2>Link invalid</h2><p>This unsubscribe link is expired or already used.</p></body></html>`,
      { status: 404, headers: { "Content-Type": "text/html" } },
    );
  }
  return new NextResponse(
    `<html><body style="font-family:Helvetica,Arial;padding:32px;text-align:center"><h2>You've been unsubscribed</h2><p>${result.email} will no longer receive marketing emails.</p></body></html>`,
    { status: 200, headers: { "Content-Type": "text/html" } },
  );
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const result = await unsubscribe(token);
  return NextResponse.json({ ok: result.ok });
}

async function unsubscribe(token: string): Promise<{ ok: true; email: string } | { ok: false }> {
  const admin = createAdminClient();
  const { data: row } = await admin
    .from("ee_unsubscribe_tokens")
    .select("email, venue_id, campaign_id, used_at")
    .eq("token", token)
    .maybeSingle();
  if (!row) return { ok: false };

  await admin.from("ee_unsubscribe_tokens")
    .update({ used_at: new Date().toISOString() })
    .eq("token", token);

  // 1. Add to suppression list
  await admin.from("ee_suppressions").upsert(
    { email: row.email, reason: "unsubscribe", campaign_id: row.campaign_id },
    { onConflict: "email" },
  );

  // 2. Mark the corresponding send_log row as unsubscribed if tied to a campaign
  if (row.campaign_id) {
    await admin
      .from("ee_send_log")
      .update({ status: "unsubscribed" })
      .eq("campaign_id", row.campaign_id)
      .eq("recipient_email", row.email);
  }

  // 3. Flip newsletter_subscribers.unsubscribed_at if they're in that table
  await admin
    .from("newsletter_subscribers")
    .update({ unsubscribed_at: new Date().toISOString() })
    .eq("email", row.email);

  // 4. Flip the flag on ee_contact_attributes for fast segment evaluation
  await admin
    .from("ee_contact_attributes")
    .update({ is_unsubscribed: true })
    .eq("email", row.email);

  return { ok: true, email: row.email };
}

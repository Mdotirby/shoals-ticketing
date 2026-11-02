import path from "path";
import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth/can";
import { tenantScope, DENY } from "@/lib/auth/tenant";
import { writeAudit } from "@/lib/auth/audit";
import { createAdminClient } from "@/lib/supabase-server";
import { sanitize } from "@/lib/pdf/pdf-header";
import { renderXlsxTemplate } from "@/lib/xlsx-templates/render";
import { buildArtistSettlementData } from "@/lib/xlsx-templates/artist-settlement/adapter";
import { loadPayouts } from "@/lib/settlement/payoutRecord";
import { resolveRecipients } from "@/lib/email/recipients";
import { senderForDomain, settlementEmailHtml, settlementsAddress } from "@/lib/settlement/agentEmail";
import type { Settlement } from "@/lib/types/settlement";
import type { ArtistOffer } from "@/lib/types/offer";

export const runtime = "nodejs";
export const maxDuration = 30;

const TEMPLATE_DIR = path.join(process.cwd(), "lib/xlsx-templates/artist-settlement");

type SendBody = {
  /** The settlement as the workspace holds it — the same shape Export Excel posts. */
  settlement: Settlement;
  expenses?: { name: string; category: string; actual_amount: number }[];
  to?: string;
  cc?: string[];
  /** Saved to the linked offer, so it's there next time. */
  assistantEmail?: string;
  subject: string;
  message: string;
  /** Which operator domain to send from: west72ent.com or venuecore.live. */
  fromDomain: string;
  /** Send only to the signed-in user, marked [TEST]. See lib/email/recipients.ts. */
  test?: boolean;
};

/**
 * POST /api/settlements/:id/send — email the artist settlement through Resend
 * from settlements@<operator domain>, with the locked artist workbook
 * attached. Replies go to whoever sent it. The settlement itself is unchanged.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireCapability("view_settlement", { write: true });
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const admin = createAdminClient();

  const { data: current } = await admin
    .from("settlements")
    .select("id, venue_id, offer_id")
    .eq("id", id)
    .maybeSingle();
  // The id alone is not a boundary (lib/auth/tenant.ts).
  const scope = tenantScope(guard.actor, current?.venue_id ?? null);
  if (!current || scope === DENY || (scope !== null && scope !== current.venue_id)) {
    return NextResponse.json({ error: "Settlement not found" }, { status: 404 });
  }

  let body: SendBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body?.settlement) return NextResponse.json({ error: "Missing settlement" }, { status: 400 });

  const recipients = resolveRecipients(body, guard.actor.email);
  if (!recipients.ok) return NextResponse.json({ error: recipients.error }, { status: 400 });
  const { to, cc, subject, test } = recipients;

  const sender = senderForDomain(body.fromDomain);
  if (!sender) return NextResponse.json({ error: "Pick a sending domain." }, { status: 400 });

  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) return NextResponse.json({ error: "RESEND_API_KEY not configured" }, { status: 500 });

  let offer: ArtistOffer | null = null;
  if (current.offer_id) {
    const { data: offerRow } = await admin.from("artist_offers").select("*").eq("id", current.offer_id).maybeSingle();
    offer = (offerRow as ArtistOffer) ?? null;
  }

  const settlement = { ...body.settlement, id } as Settlement;
  const data = buildArtistSettlementData(settlement, body.expenses ?? [], offer, await loadPayouts(admin, id));
  let xlsx: Buffer;
  try {
    xlsx = await renderXlsxTemplate(TEMPLATE_DIR, data as unknown as Record<string, unknown>);
  } catch (err) {
    console.error("[settlements/send] render failed:", err);
    return NextResponse.json({ error: "Couldn't build the settlement sheet." }, { status: 500 });
  }
  const attachmentName = `${sanitize(settlement.artist_name ?? "Artist")}-${sanitize(data.event_date_label)}-Artist_Settlement.xlsx`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: `${sender.copyright} <${settlementsAddress(sender)}>`,
      to: [to],
      cc: cc.length ? cc : undefined,
      // settlements@ is a sending address; the conversation belongs to the sender.
      reply_to: guard.actor.email || undefined,
      subject,
      html: settlementEmailHtml({ data, sender, subject, message: String(body.message || ""), attachmentName }),
      attachments: [{ filename: attachmentName, content: xlsx.toString("base64") }],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error("[settlements/send] resend failed:", err);
    return NextResponse.json({ error: `Resend refused it: ${err}` }, { status: 502 });
  }
  const sent = (await res.json().catch(() => ({}))) as { id?: string };

  if (!test) {
    if (current.offer_id && typeof body.assistantEmail === "string") {
      await admin
        .from("artist_offers")
        .update({ agent_assistant_email: body.assistantEmail.trim() || null })
        .eq("id", current.offer_id);
    }
    await writeAudit(guard.actor, {
      action: "settlement.sent",
      targetType: "settlement",
      targetId: id,
      venueId: current.venue_id,
      detail: { to, cc, from: settlementsAddress(sender), balance_due: data.balance_due },
    });
  }

  return NextResponse.json({ sent: true, test, emailId: sent.id ?? null, to, cc, from: settlementsAddress(sender) });
}

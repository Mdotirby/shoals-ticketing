import path from "path";
import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth/can";
import { tenantScope, DENY } from "@/lib/auth/tenant";
import { createAdminClient } from "@/lib/supabase-server";
import { sanitize } from "@/lib/pdf/pdf-header";
import { renderXlsxTemplate } from "@/lib/xlsx-templates/render";
import { buildOfferData } from "@/lib/xlsx-templates/offer/adapter";
import { agentRecipients, resolveRecipients } from "@/lib/email/recipients";
import { AGENT_COPY_CUT, agentEmailHtml, offersAddress, senderForDomain } from "@/lib/offers/agentEmail";
import type { ArtistOffer } from "@/lib/types/offer";

export const runtime = "nodejs";
export const maxDuration = 30;

const TEMPLATE_DIR = path.join(process.cwd(), "lib/xlsx-templates/offer");

type SendBody = {
  /** The offer as the builder holds it — the same shape Export Excel posts. */
  offer: ArtistOffer;
  subject: string;
  message: string;
  /** Which operator domain to send from: west72ent.com or venuecore.live. */
  fromDomain: string;
  /** Send only to the signed-in user, marked [TEST]. See lib/email/recipients.ts. */
  test?: boolean;
};

/**
 * POST /api/offers/:id/send — email the offer to the agent through Resend,
 * from offers@<operator domain>, to the assistant with the agent copied (or
 * the agent alone), with the offer workbook attached: locked,
 * and cut before the venue's own numbers. Replies go to whoever sent it.
 *
 * A draft becomes "sent". Nothing else about the offer changes. A test goes
 * only to the sender and leaves the offer a draft.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireCapability("offers", { write: true });
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const admin = createAdminClient();

  const { data: current } = await admin
    .from("artist_offers")
    .select("id, venue_id, status, agent_email, agent_assistant_email")
    .eq("id", id)
    .maybeSingle();
  // The id alone is not a boundary (lib/auth/tenant.ts).
  const scope = tenantScope(guard.actor, current?.venue_id ?? null);
  if (!current || scope === DENY || (scope !== null && scope !== current.venue_id)) {
    return NextResponse.json({ error: "Offer not found" }, { status: 404 });
  }

  let body: SendBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body?.offer) return NextResponse.json({ error: "Missing offer" }, { status: 400 });

  // An offer only ever goes to the agent and their assistant, as saved on it.
  const { to: toAddress, cc: agentCc } = agentRecipients(current.agent_email, current.agent_assistant_email);
  if (!body.test && !toAddress) return NextResponse.json({ error: "Add the agent's email to the offer first." }, { status: 400 });
  const recipients = resolveRecipients({ to: toAddress, cc: agentCc ? [agentCc] : [], subject: body.subject, test: body.test }, guard.actor.email);
  if (!recipients.ok) return NextResponse.json({ error: recipients.error }, { status: 400 });
  const { to, cc, subject, test } = recipients;

  const sender = senderForDomain(body.fromDomain);
  if (!sender) return NextResponse.json({ error: "Pick a sending domain." }, { status: 400 });

  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) return NextResponse.json({ error: "RESEND_API_KEY not configured" }, { status: 500 });

  const offer = { ...body.offer, id } as ArtistOffer;
  const data = buildOfferData(offer);
  let xlsx: Buffer;
  try {
    xlsx = await renderXlsxTemplate(TEMPLATE_DIR, data as unknown as Record<string, unknown>, { cutFromLabel: AGENT_COPY_CUT });
  } catch (err) {
    console.error("[offers/send] render failed:", err);
    return NextResponse.json({ error: "Couldn't build the offer sheet." }, { status: 500 });
  }
  const attachmentName = `${sanitize(offer.artist_name ?? "Artist")}-${sanitize(data.event_date_label)}-Offer.xlsx`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: `${sender.copyright} <${offersAddress(sender)}>`,
      to: [to],
      cc: cc.length ? cc : undefined,
      // offers@ is a sending address; the conversation belongs to the buyer.
      reply_to: guard.actor.email || undefined,
      subject,
      html: agentEmailHtml({
        offer,
        sender,
        message: String(body.message || ""),
        artistAtSellout: data.artist_total_potential,
      }),
      attachments: [{ filename: attachmentName, content: xlsx.toString("base64") }],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error("[offers/send] resend failed:", err);
    return NextResponse.json({ error: `Resend refused it: ${err}` }, { status: 502 });
  }
  const sent = (await res.json().catch(() => ({}))) as { id?: string };

  let status = current.status as string;
  if (!test && status === "draft") {
    const { error } = await admin.from("artist_offers").update({ status: "sent" }).eq("id", id);
    if (!error) status = "sent";
  }

  return NextResponse.json({ sent: true, test, emailId: sent.id ?? null, to, cc, from: offersAddress(sender), status });
}

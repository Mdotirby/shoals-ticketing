import path from "path";
import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth/can";
import { tenantScope, DENY } from "@/lib/auth/tenant";
import { createAdminClient } from "@/lib/supabase-server";
import { sanitize } from "@/lib/pdf/pdf-header";
import { renderXlsxTemplate } from "@/lib/xlsx-templates/render";
import { buildOfferData } from "@/lib/xlsx-templates/offer/adapter";
import { AGENT_COPY_CUT, agentEmailHtml, offersAddress, senderForDomain } from "@/lib/offers/agentEmail";
import type { ArtistOffer } from "@/lib/types/offer";

export const runtime = "nodejs";
export const maxDuration = 30;

const TEMPLATE_DIR = path.join(process.cwd(), "lib/xlsx-templates/offer");

const EMAIL = /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/;

type SendBody = {
  /** The offer as the builder holds it — the same shape Export Excel posts. */
  offer: ArtistOffer;
  to: string;
  cc?: string[];
  /** Copy the sender, so the sent offer lands in their own inbox. */
  ccMe?: boolean;
  subject: string;
  message: string;
  /** Which operator domain to send from: west72ent.com or venuecore.live. */
  fromDomain: string;
};

/**
 * POST /api/offers/:id/send — email the offer to the agent through Resend,
 * from offers@<operator domain>, with the offer workbook attached: locked,
 * and cut before the venue's own numbers. Replies go to whoever sent it.
 *
 * A draft becomes "sent". Nothing else about the offer changes.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireCapability("offers", { write: true });
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const admin = createAdminClient();

  const { data: current } = await admin
    .from("artist_offers")
    .select("id, venue_id, status")
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

  const to = String(body.to || "").trim();
  if (!EMAIL.test(to)) return NextResponse.json({ error: "The agent's email address isn't valid." }, { status: 400 });
  const cc = (Array.isArray(body.cc) ? body.cc : []).map((e) => String(e).trim()).filter(Boolean);
  const badCc = cc.find((e) => !EMAIL.test(e));
  if (badCc) return NextResponse.json({ error: `"${badCc}" isn't a valid email address.` }, { status: 400 });
  if (body.ccMe && guard.actor.email && !cc.includes(guard.actor.email)) cc.push(guard.actor.email);
  if (cc.length > 10) return NextResponse.json({ error: "Ten CCs at most." }, { status: 400 });

  const subject = String(body.subject || "").trim();
  if (!subject) return NextResponse.json({ error: "Add a subject." }, { status: 400 });

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
        attachmentName,
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
  if (status === "draft") {
    const { error } = await admin.from("artist_offers").update({ status: "sent" }).eq("id", id);
    if (!error) status = "sent";
  }

  return NextResponse.json({ sent: true, emailId: sent.id ?? null, to, cc, from: offersAddress(sender), status });
}

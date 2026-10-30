import { joinNames, offTopNames } from "./door";
import { artistFacPerTicket } from "./facilityShare";
import { tierAllInPrice } from "./cardExpense";
import { OPERATORS, type OperatorConfig } from "@/lib/operators";
import type { ArtistOffer } from "@/lib/types/offer";

/**
 * The email an offer goes to the agent in, sent through Resend from the
 * operator's own domain (offers@west72ent.com / offers@venuecore.live —
 * both verified). Agent-facing only: the deal, the date, the ticket, what
 * the artist walks with at sellout. Never the venue's side of the sheet.
 */

/** Where the offer workbook's venue-only block starts. Nothing from here down goes to an agent. */
export const AGENT_COPY_CUT = "VENUE POTENTIAL AT SELLOUT";

/** The sending local part on every operator domain. */
export const OFFERS_LOCAL_PART = "offers";

export function offersAddress(op: OperatorConfig): string {
  return `${OFFERS_LOCAL_PART}@${op.domain}`;
}

/** The operators an offer can be sent from — their domains are verified in Resend. */
export function senderForDomain(domain: string | null | undefined): OperatorConfig | null {
  return Object.values(OPERATORS).find((o) => o.domain === domain) ?? null;
}

const money = (n: number) =>
  `$${(Number(n) || 0).toLocaleString("en-US", { minimumFractionDigits: Number(n) % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;

export function offerDateLabel(offer: Pick<ArtistOffer, "event_date">): string {
  return offer.event_date
    ? new Date(String(offer.event_date).slice(0, 10) + "T12:00:00").toLocaleDateString("en-US", {
        weekday: "short", month: "short", day: "numeric", year: "numeric",
      })
    : "Date TBD";
}

export function offerSubject(offer: Pick<ArtistOffer, "artist_name" | "venue" | "event_date">): string {
  return ["Offer", [offer.artist_name, offer.venue, offerDateLabel(offer)].filter(Boolean).join(" — ")].join(": ");
}

/** The deal in one plain sentence, as the agent would say it back. */
export function agentDealLine(offer: ArtistOffer): string {
  const d = String(offer.deal_type || "FLAT").toUpperCase();
  const g = money(Number(offer.guarantee) || 0);
  const p = Number(offer.backend_percentage) || 0;
  let line: string;
  if (d === "DOOR") {
    const off = offTopNames(offer.fixed_expenses);
    line = `${p}% of the door${off.length ? ` after ${joinNames(off)}` : ""} (face value, after tax and fees)`;
  } else if (d === "PLUS") {
    line = `${g} guarantee plus ${p}% of net after expenses`;
  } else if (d === "VS" || d === "BONUS") {
    line = `${g} guarantee vs. ${p}% of net after expenses, whichever is greater`;
  } else {
    line = `${g} flat guarantee`;
  }
  const fac = artistFacPerTicket(offer.ticket_scaling);
  return fac > 0 ? `${line}, plus ${money(fac)} per ticket from the facility fee` : line;
}

/**
 * "General Admission $27.50 ($37.50 with fees)", one per tier. The figure in
 * brackets is what the buyer actually pays -- fees, tax and card processing
 * in. It used to be the face plus the two fees, $4 short of the checkout.
 */
export function ticketLines(offer: ArtistOffer): string[] {
  return (offer.ticket_scaling || []).map((t) => {
    const face = Number(t.net_price) || 0;
    const allIn = tierAllInPrice(t, { taxMethod: offer.tax_method, taxRate: offer.tax_rate });
    return `${t.name || "Tier"} ${money(face)}${allIn > face ? ` (${money(allIn)} with fees)` : ""}`;
  });
}

/** The offer's other terms: the field, or the notes it used to live in. */
export function otherTerms(offer: Pick<ArtistOffer, "other_terms" | "notes">): string {
  return String(offer.other_terms || offer.notes || "").trim();
}

const esc = (s: unknown) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export type AgentEmailInput = {
  offer: ArtistOffer;
  sender: OperatorConfig;
  /** The note typed in the compose box. Plain text; line breaks kept. */
  message: string;
  /** What the artist walks with at sellout — the offer sheet's own figure. */
  artistAtSellout: number;
  attachmentName: string;
};

export function agentEmailHtml({ offer, sender, message, artistAtSellout, attachmentName }: AgentEmailInput): string {
  const sellable = (offer.ticket_scaling || []).reduce((n, t) => n + (Number(t.sellable_cap) || 0), 0);
  const rows: Array<[string, string]> = [
    ["Artist", offer.artist_name || ""],
    ["Date", offerDateLabel(offer)],
    ["Venue", [offer.venue, offer.venue_address].filter(Boolean).join(" · ")],
    ["Deal", agentDealLine(offer)],
    ["Tickets", ticketLines(offer).join("<br/>")],
    ["Sellable", sellable ? `${sellable.toLocaleString("en-US")}` : ""],
    ["Artist at sellout", money(artistAtSellout)],
    ["Billing", offer.billing || ""],
    ["Radius", [offer.radius_distance ? `${offer.radius_distance} mi` : "", offer.radius_days_prior != null ? `${offer.radius_days_prior} days prior` : "", offer.radius_days_after != null ? `${offer.radius_days_after} days after` : ""].filter(Boolean).join(" · ")],
    ["Merch", offer.merch_split || ""],
    ["Other terms", otherTerms(offer)],
    ["Valid for", offer.offer_valid_days ? `${offer.offer_valid_days} days` : ""],
  ].filter(([, v]) => v) as Array<[string, string]>;

  const termRows = rows
    .map(([k, v]) => `<tr>
      <td style="padding:8px 0;border-bottom:1px solid #ececec;color:#6b6b6b;font-size:13px;width:130px;vertical-align:top;">${esc(k)}</td>
      <td style="padding:8px 0;border-bottom:1px solid #ececec;color:#111;font-size:14px;vertical-align:top;">${k === "Tickets" ? v.split("<br/>").map(esc).join("<br/>") : esc(v)}</td>
    </tr>`)
    .join("");

  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>${esc(offerSubject(offer))}</title></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:28px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:10px;overflow:hidden;border:1px solid #e4e4e7;">
        <tr><td style="background:#111111;padding:18px 28px;">
          <p style="margin:0;font-size:11px;font-weight:700;letter-spacing:2px;color:#a1a1aa;text-transform:uppercase;">Offer · ${esc(sender.copyright)}</p>
          <h1 style="margin:6px 0 0;font-size:20px;font-weight:700;color:#ffffff;">${esc(offer.artist_name || "Offer")}</h1>
        </td></tr>
        <tr><td style="padding:24px 28px 8px;">
          <p style="margin:0;color:#111;font-size:15px;line-height:1.6;white-space:pre-wrap;">${esc(message)}</p>
        </td></tr>
        <tr><td style="padding:8px 28px 4px;">
          <table width="100%" cellpadding="0" cellspacing="0">${termRows}</table>
        </td></tr>
        <tr><td style="padding:16px 28px 26px;">
          <p style="margin:0;color:#6b6b6b;font-size:13px;line-height:1.6;">The full offer is attached: <b style="color:#111;">${esc(attachmentName)}</b>. Reply to this email with any questions or to confirm.</p>
        </td></tr>
        <tr><td style="padding:12px 28px;background:#fafafa;border-top:1px solid #ececec;">
          <p style="margin:0;font-size:11px;color:#a1a1aa;">${esc(sender.copyright)} · ${esc(sender.domain)}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

/** What the compose box opens with. */
export function defaultAgentMessage(offer: ArtistOffer): string {
  const first = String(offer.agent_name || "").trim().split(/\s+/)[0];
  return `Hi ${first || "there"},\n\nPlease find our offer for ${offer.artist_name || "your artist"} on ${offerDateLabel(offer)} at ${String(offer.venue || "our venue").replace(/\.$/, "")}. The terms are below and the full offer is attached.\n\nThanks,`;
}

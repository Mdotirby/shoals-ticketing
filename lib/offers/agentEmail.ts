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

export const money = (n: number) =>
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

export const esc = (s: unknown) =>
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
    ["Venue", [offer.venue, offer.venue_address].filter(Boolean).join(" · ")],
    ["Tickets", ticketLines(offer).join("\n")],
    ["Sellable", sellable ? `${sellable.toLocaleString("en-US")}` : ""],
    ["Billing", offer.billing || ""],
    ["Radius", [offer.radius_distance ? `${offer.radius_distance} mi` : "", offer.radius_days_prior != null ? `${offer.radius_days_prior} days prior` : "", offer.radius_days_after != null ? `${offer.radius_days_after} days after` : ""].filter(Boolean).join(" · ")],
    ["Merch", offer.merch_split || ""],
    ["Other terms", otherTerms(offer)],
    ["Valid for", offer.offer_valid_days ? `${offer.offer_valid_days} days` : ""],
  ].filter(([, v]) => v) as Array<[string, string]>;

  return documentEmailHtml({
    title: offerSubject(offer),
    kind: "Offer",
    heading: offer.artist_name || "Offer",
    subline: [offerDateLabel(offer), offer.venue].filter(Boolean).join(" · "),
    heroLabel: "Artist at sellout",
    heroValue: money(artistAtSellout),
    heroNote: agentDealLine(offer),
    message,
    rows,
    attachmentName,
    attachmentNote: "Attached. Reply to this email with any questions or to confirm.",
    sender,
  });
}

/** Logo widths at 26px tall. Outlook draws an image at full size without one. */
const LOGO_WIDTH: Record<string, number> = { west72: 89, venuecore: 170 };

const FONT = "'Inter','Helvetica Neue',Helvetica,Arial,sans-serif";
const PANEL = "#15161b";
const LINE = "#2d2e35";
const TEXT = "#ffffff";
const BODY = "#e6e6e8";
const MUTED = "#a3a3aa";

/**
 * The layout every document email shares: the platform's liquid glass, built
 * for mail clients. Tables and inline styles throughout, solid hex colours
 * beneath every gradient, and no blur, since none of that survives everywhere.
 * Outlook gets flat dark panels with square corners; the rest get the glow.
 */
export function documentEmailHtml({
  title, kind, heading, subline, heroLabel, heroValue, heroSide, heroNote, badges = [], message, rows, total, attachmentName, attachmentNote, sender,
}: {
  title: string;
  kind: string;
  heading: string;
  subline: string;
  heroLabel: string;
  heroValue: string;
  /** A second figure beside the first, for when two matter equally. */
  heroSide?: { label: string; value: string };
  heroNote?: string;
  /** Short green confirmations under the big number. */
  badges?: string[];
  message: string;
  rows: Array<[string, string]>;
  /** A bold last row. */
  total?: [string, string];
  attachmentName?: string;
  attachmentNote?: string;
  sender: OperatorConfig;
}): string {
  const row = ([k, v]: [string, string], last: boolean, strong = false) => `<tr>
    <td class="k" width="120" valign="top" style="padding:14px 16px 14px 0;${last ? "" : `border-bottom:1px solid ${LINE};`}font-family:${FONT};font-size:14px;line-height:20px;color:${strong ? TEXT : MUTED};${strong ? "font-weight:700;" : ""}">${esc(k)}</td>
    <td valign="top" style="padding:14px 0;${last ? "" : `border-bottom:1px solid ${LINE};`}font-family:${FONT};font-size:14px;line-height:20px;color:${TEXT};font-weight:${strong ? 700 : 500};">${v.split("\n").map(esc).join("<br/>")}</td>
  </tr>`;
  const all = [...rows.map((r, i) => row(r, !total && i === rows.length - 1)), ...(total ? [row(total, true, true)] : [])].join("");
  const badgeHtml = badges.map((b) => `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:14px;"><tr><td bgcolor="#16261d" style="padding:7px 12px;background-color:#16261d;border:1px solid #2f4b39;border-radius:999px;font-family:${FONT};font-size:13px;line-height:18px;font-weight:500;color:#8fd6a8;">${esc(b)}</td></tr></table>`).join("");
  const logo = `https://${sender.domain}${sender.logoWhite}`;
  const logoWidth = LOGO_WIDTH[sender.slug] ?? 150;
  const glass = `https://${sender.domain}/email/glass-panel.jpg`;
  const stat = (label: string, value: string, size: number) => `<div style="font-family:${FONT};font-size:11px;line-height:16px;font-weight:600;letter-spacing:1.5px;text-transform:uppercase;color:${MUTED};">${esc(label)}</div>
        <div class="hero" style="margin-top:6px;font-family:${FONT};font-size:${size}px;line-height:${size + 4}px;font-weight:700;color:${TEXT};">${esc(value)}</div>`;
  const stats = heroSide
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
          <td class="stat" width="50%" valign="top" style="padding-right:12px;">${stat(heroLabel, heroValue, 44)}</td>
          <td class="stat" width="50%" valign="top">${stat(heroSide.label, heroSide.value, 44)}</td>
        </tr></table>`
    : stat(heroLabel, heroValue, 52);
  const paragraphs = esc(message).split(/\r?\n/).join("<br/>");

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="color-scheme" content="dark light">
<meta name="supported-color-schemes" content="dark light">
<title>${esc(title)}</title>
<!--[if mso]><style>table,td{border-collapse:collapse;}td{mso-line-height-rule:exactly;}</style><![endif]-->
<style>
  :root { color-scheme: dark light; }
  body { margin:0 !important; padding:0 !important; width:100% !important; -webkit-text-size-adjust:100%; }
  img { border:0; outline:none; text-decoration:none; }
  @media only screen and (max-width: 620px) {
    .outer { padding:24px 12px !important; }
    .pad { padding:24px 20px !important; }
    .hero { font-size:40px !important; line-height:44px !important; }
    .title { font-size:28px !important; line-height:32px !important; }
    .k { width:96px !important; }
    .stat { display:block !important; width:100% !important; padding:0 0 16px !important; }
  }
</style>
</head>
<body bgcolor="#08080a" style="margin:0;padding:0;background-color:#08080a;">
<div style="display:none;max-height:0;max-width:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#08080a;opacity:0;">${esc(heading)}: ${esc(heroLabel)} ${esc(heroValue)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#08080a" style="background-color:#08080a;">
  <tr><td class="outer" align="center" bgcolor="#08080a" style="padding:40px 16px;background-color:#08080a;background-image:radial-gradient(620px 420px at 12% 0%,#1c1f38 0%,#08080a 70%);">
    <!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;">
      <tr><td style="padding:0 4px 20px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
          <td align="left"><img src="${esc(logo)}" alt="${esc(sender.copyright)}" width="${logoWidth}" height="26" style="display:block;width:${logoWidth}px;height:26px;"></td>
          <td align="right" style="font-family:${FONT};font-size:11px;line-height:16px;font-weight:600;letter-spacing:2px;text-transform:uppercase;color:${MUTED};">${esc(kind)}</td>
        </tr></table>
      </td></tr>

      <tr><td class="pad" bgcolor="${PANEL}" background="${glass}" style="padding:32px;background-color:${PANEL};background-image:linear-gradient(120deg,#2a2b31 0%,${PANEL} 32%,${PANEL} 100%);background-image:url('${glass}');background-size:cover;background-position:center top;border:1px solid #33343b;border-radius:24px;">
        <div style="font-family:${FONT};font-size:13px;line-height:18px;color:${MUTED};">${esc(subline)}</div>
        <h1 class="title" style="margin:6px 0 24px;font-family:${FONT};font-size:34px;line-height:39px;font-weight:700;color:${TEXT};">${esc(heading)}</h1>
        ${stats}
        ${heroNote ? `<div style="margin-top:14px;font-family:${FONT};font-size:14px;line-height:21px;color:${BODY};">${esc(heroNote)}</div>` : ""}
        ${badgeHtml}
      </td></tr>

      <tr><td style="padding:24px 8px;font-family:${FONT};font-size:15px;line-height:24px;color:${BODY};">${paragraphs}</td></tr>

      <tr><td class="pad" bgcolor="${PANEL}" style="padding:10px 28px;background-color:${PANEL};border:1px solid #33343b;border-radius:24px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${all}</table>
      </td></tr>

      ${attachmentName ? `      <tr><td style="height:20px;line-height:20px;font-size:1px;">&nbsp;</td></tr>

      <tr><td bgcolor="#101115" style="padding:16px 20px;background-color:#101115;border:1px solid #33343b;border-radius:18px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
          <td valign="middle" style="padding-right:14px;font-family:${FONT};font-size:11px;line-height:16px;font-weight:700;letter-spacing:1px;color:#8fd6a8;">XLSX</td>
          <td valign="middle">
            <div style="font-family:${FONT};font-size:14px;line-height:20px;font-weight:600;color:${TEXT};word-break:break-all;">${esc(attachmentName)}</div>
            <div style="margin-top:2px;font-family:${FONT};font-size:12px;line-height:18px;color:${MUTED};">${esc(attachmentNote ?? "")}</div>
          </td>
        </tr></table>
      </td></tr>
` : ""}

      <tr><td style="padding:24px 8px 0;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
          <td align="left" style="font-family:${FONT};font-size:12px;line-height:18px;color:${MUTED};">${esc(sender.copyright)}</td>
          <td align="right" style="font-family:${FONT};font-size:12px;line-height:18px;color:${MUTED};">${esc(sender.domain)}</td>
        </tr></table>
      </td></tr>
    </table>
    <!--[if mso]></td></tr></table><![endif]-->
  </td></tr>
</table>
</body>
</html>`;
}

/** What the compose box opens with. */
export function defaultAgentMessage(offer: ArtistOffer): string {
  const first = String(offer.agent_name || "").trim().split(/\s+/)[0];
  return `Hi ${first || "there"},\n\nPlease find our offer for ${offer.artist_name || "your artist"} on ${offerDateLabel(offer)} at ${String(offer.venue || "our venue").replace(/\.$/, "")}. The terms are below and the full offer is attached.\n\nThanks,`;
}

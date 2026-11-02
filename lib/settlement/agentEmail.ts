import { documentEmailHtml, esc, money, senderForDomain } from "@/lib/offers/agentEmail";
import type { OperatorConfig } from "@/lib/operators";
import type { ArtistSettlementData } from "@/lib/xlsx-templates/artist-settlement/adapter";

/**
 * The email a settlement goes to the agent in, from settlements@<operator
 * domain>. It only carries figures from the artist's workbook, the one that's
 * attached. The venue workbook and its P&L never go out this way.
 */

export { senderForDomain };

export const SETTLEMENTS_LOCAL_PART = "settlements";

export function settlementsAddress(op: OperatorConfig): string {
  return `${SETTLEMENTS_LOCAL_PART}@${op.domain}`;
}

type Named = { artistName: string; venueName: string; dateLabel: string };

export function settlementSubject({ artistName, venueName, dateLabel }: Named): string {
  return `Settlement: ${[artistName, venueName, dateLabel].filter(Boolean).join(" — ")}`;
}

/** What the compose box opens with. */
export function defaultSettlementMessage({ artistName, venueName, dateLabel, agentName }: Named & { agentName?: string | null }): string {
  const first = String(agentName || "").trim().split(/\s+/)[0];
  return `Hi ${first || "there"},\n\nHere's the settlement for ${artistName || "the show"} on ${dateLabel} at ${String(venueName || "our venue").replace(/\.$/, "")}. The summary is below and the full settlement is attached.\n\nThanks,`;
}

export type SettlementEmailInput = {
  data: ArtistSettlementData;
  sender: OperatorConfig;
  subject: string;
  message: string;
  attachmentName: string;
};

export function settlementEmailHtml({ data, sender, subject, message, attachmentName }: SettlementEmailInput): string {
  const merch = data.merch_venue_take_deduction + data.seller_fee;
  const rows: Array<[string, string]> = [
    ["Artist", data.artist_name],
    ["Date", data.event_date_label],
    ["Venue", [data.venue_name, data.venue_address].filter(Boolean).join(" · ")],
    ["Tickets sold", data.ticket_totals_sold.toLocaleString("en-US")],
    ["Guarantee", money(data.artist_guarantee)],
    ["Backend", data.backend_overage ? money(data.backend_overage) : ""],
    ["Deposits paid", data.deposits_paid ? `-${money(data.deposits_paid)}` : ""],
    ["Cash advance", data.cash_advance ? `-${money(data.cash_advance)}` : ""],
    ["Merch", merch ? `-${money(merch)}` : ""],
    ["Balance due", money(data.balance_due)],
  ];

  return documentEmailHtml({
    title: subject,
    eyebrow: `Settlement · ${sender.copyright}`,
    heading: data.artist_name || "Settlement",
    message,
    rows: rows.filter(([, v]) => v),
    note: `The full settlement is attached: <b style="color:#111;">${esc(attachmentName)}</b>. Reply to this email with any questions.`,
    sender,
  });
}

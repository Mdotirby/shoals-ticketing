import { documentEmailHtml, senderForDomain } from "@/lib/offers/agentEmail";
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
  return `Hi ${first || "there"},\n\nHere's the settlement for ${artistName || "the show"} on ${dateLabel} at ${String(venueName || "our venue").replace(/\.$/, "")}. The summary is below and the full settlement is attached. Reply to this email with any questions.\n\nThanks,`;
}

export type SettlementEmailInput = {
  data: ArtistSettlementData;
  sender: OperatorConfig;
  subject: string;
  message: string;
};

const usd = (n: number) => `$${(Number(n) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function settlementEmailHtml({ data, sender, subject, message }: SettlementEmailInput): string {
  const merch = data.merch_venue_take_deduction + data.seller_fee;
  const rows: Array<[string, string]> = [
    ["Venue", [data.venue_name, data.venue_address].filter(Boolean).join(" · ")],
    ["Tickets sold", data.ticket_totals_sold.toLocaleString("en-US")],
    ["Guarantee", usd(data.artist_guarantee)],
    ["Backend", data.backend_overage ? usd(data.backend_overage) : ""],
    ["Deposits paid", data.deposits_paid ? `-${usd(data.deposits_paid)}` : ""],
    ["Cash advance", data.cash_advance ? `-${usd(data.cash_advance)}` : ""],
    ["Merch", merch ? `-${usd(merch)}` : ""],
  ];

  return documentEmailHtml({
    title: subject,
    kind: "Settlement",
    heading: data.artist_name || "Settlement",
    subline: [data.event_date_label, data.venue_name].filter(Boolean).join(" · "),
    heroLabel: "Balance due",
    heroValue: usd(data.balance_due),
    badges: (data.payout_records ?? []).filter((p) => p.amount !== null).map((p) => p.label),
    message,
    rows: rows.filter(([, v]) => v),
    total: ["Balance due", usd(data.balance_due)],
    sender,
  });
}

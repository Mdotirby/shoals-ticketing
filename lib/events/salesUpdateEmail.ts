import { documentEmailHtml, money } from "@/lib/offers/agentEmail";
import type { OperatorConfig } from "@/lib/operators";

/**
 * The sales update sent to an agent by hand from the event hub: tickets sold
 * and GBOR for one show, as of right now. Nothing sends this on a schedule.
 */

export const UPDATES_LOCAL_PART = "updates";

export function updatesAddress(op: OperatorConfig): string {
  return `${UPDATES_LOCAL_PART}@${op.domain}`;
}

export type SalesFigures = {
  title: string;
  venue: string;
  /** The show's date, as stored. */
  date: string;
  sold: number;
  capacity: number;
  gbor: number;
};

const showDay = (date: string) => new Date(`${String(date).slice(0, 10)}T12:00:00`);

export function salesDateLabel(date: string): string {
  return showDay(date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

export function salesSubject(f: Pick<SalesFigures, "title" | "date" | "sold">): string {
  return `Sales update: ${f.title} — ${salesDateLabel(f.date)} — ${f.sold.toLocaleString("en-US")} sold`;
}

/** What the send box opens with. */
export function defaultSalesMessage(f: Pick<SalesFigures, "title" | "date">, agentName?: string | null): string {
  const first = String(agentName || "").trim().split(/\s+/)[0];
  return `Hi ${first || "there"},\n\nHere's where ${f.title} on ${salesDateLabel(f.date)} stands today.\n\nThanks,`;
}

/** Whole days until the show, or null once it has passed. */
export function daysOut(date: string, now: Date): number | null {
  const today = new Date(now.toLocaleDateString("en-US", { timeZone: "America/Chicago" }));
  const days = Math.round((showDay(date).setHours(0, 0, 0, 0) - today.getTime()) / 86_400_000);
  return days >= 0 ? days : null;
}

export function salesUpdateEmailHtml({ figures, sender, subject, message, now = new Date() }: {
  figures: SalesFigures;
  sender: OperatorConfig;
  subject: string;
  message: string;
  now?: Date;
}): string {
  const { title, venue, date, sold, capacity, gbor } = figures;
  const days = daysOut(date, now);
  const rows: Array<[string, string]> = [
    ["Capacity", capacity > 0 ? `${sold.toLocaleString("en-US")} of ${capacity.toLocaleString("en-US")} (${Math.round((sold / capacity) * 100)}%)` : ""],
    ["Days out", days === null ? "" : days === 0 ? "Today" : String(days)],
    ["As of", now.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Chicago", timeZoneName: "short" })],
  ];

  return documentEmailHtml({
    title: subject,
    kind: "Sales update",
    heading: title,
    subline: [salesDateLabel(date), venue].filter(Boolean).join(" · "),
    heroLabel: "Tickets sold",
    heroValue: sold.toLocaleString("en-US"),
    heroSide: { label: "GBOR", value: money(gbor) },
    message,
    rows: rows.filter(([, v]) => v),
    sender,
  });
}

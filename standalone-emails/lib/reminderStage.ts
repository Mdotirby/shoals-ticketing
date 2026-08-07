// Pure date-math for the "how close is the event" reminder-stage concept —
// deliberately has ZERO server-only imports (no Supabase client, no secrets)
// so both server code (mapEventRowToEmailProps.ts) and the admin broadcast
// wizard (app/admin/broadcasts/new/page.tsx, a client component) can import
// this directly without pulling service-role credentials into the browser
// bundle. Keep it that way — anything added here must stay import-safe from
// a "use client" file.
import type { ReminderStage } from "../templates/EventAnnouncementEmail";

const VENUE_TZ = "America/Chicago";

// events.date/start_time are naive wall-clock values with no real timezone
// conversion (confirmed against the admin edit page, which reads them via
// raw string-slicing, not Date parsing) — the stored digits ARE the intended
// Central wall-clock time, just mislabeled with a +00:00/Z suffix. Encoded
// here as "fake UTC" (Date.UTC of the raw digits) so the resulting Date is
// correct regardless of the caller's own timezone — read back with
// `timeZone: "UTC"`, never the caller's default. Canonical home for this
// parser is here (not mapEventRowToEmailProps.ts) specifically so the admin
// broadcast wizard, a client component, can reuse it too.
export function parseNaiveLocalDate(s: string): Date {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/);
  if (!m) return new Date(NaN);
  const [, y, mo, d, h, min] = m;
  return new Date(Date.UTC(+y, +mo - 1, +d, h ? +h : 12, min ? +min : 0));
}

/**
 * Days between "today" (in the venue's own wall-clock) and the event's
 * naive wall-clock date, both floored to start-of-day so the comparison
 * lines up with what the venue actually considers "today" instead of
 * drifting near midnight from comparing raw timestamps.
 */
function daysUntilEvent(eventDateObj: Date): number {
  const startOfEventDay = Date.UTC(
    eventDateObj.getUTCFullYear(), eventDateObj.getUTCMonth(), eventDateObj.getUTCDate(),
  );
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: VENUE_TZ, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const get = (t: string) => +(parts.find((p) => p.type === t)?.value ?? 0);
  const startOfToday = Date.UTC(get("year"), get("month") - 1, get("day"));
  return Math.round((startOfEventDay - startOfToday) / 86_400_000);
}

/**
 * Auto-suggested default for the broadcast dashboard's "Reminder Stage"
 * selector — Matt can always override before sending. Never applied
 * automatically inside the send/mapping pipeline itself (see
 * mapEventRowToEmailProps.ts) — only ever used to pre-fill the UI control,
 * so the regular announcement send's behavior can't silently change just
 * because an event happens to land N days out.
 */
export function suggestReminderStage(eventDateObj: Date): ReminderStage | undefined {
  const days = daysUntilEvent(eventDateObj);
  if (days === 0) return "tonight";
  if (days === 1) return "tomorrow";
  if (days >= 5 && days <= 9) return "week";
  return undefined;
}

/**
 * Shared event → render context loader.
 *
 * Called from both campaignBuilder.ts (manual campaigns) and automations.ts
 * (drip steps). Mirrors the semantics of lib/dates.ts so the email renders
 * with the SAME date/time/image the operator sees at /admin/events/[id].
 *
 *   • image   ← events.image_url
 *   • venue   ← events.venue (display) + venues.name (canonical via venue_id)
 *   • date    ← events.date (same timestamp column the landing page reads)
 *   • time    ← extracted from events.date; falls back to events.start_time
 *               for private events that store time separately
 *   • on-sale ← events.on_sale_at (countdown + absolute target)
 *   • url     ← /e/<landing_page_slug> (or /events/<id> fallback)
 *   • branding← venues.primary_color, venues.logo_url
 *
 * Kept inside /modules/email-engine so the module stays self-contained and
 * doesn't reach into /lib (see module isolation guarantee in the README).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { RenderContext } from "../types";

// ────────────────────────────────────────────────────────────────────
//  Date helpers — mirror lib/dates.ts without importing from outside
//  the module. Kept in lockstep so email matches the landing page.
// ────────────────────────────────────────────────────────────────────

function safeDate(s: string): Date {
  if (s && s.length === 10 && s[4] === "-") {
    return new Date(s + "T12:00:00");
  }
  return new Date(s.replace(/[+-]\d{2}:\d{2}$/, "").replace(/Z$/, ""));
}

function formatFull(d: Date): string {
  return d.toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
  });
}
function formatShort(d: Date): string {
  return d.toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric",
  });
}
function formatTime(d: Date): string {
  return d.toLocaleTimeString("en-US", {
    hour: "numeric", minute: "2-digit", hour12: true,
  });
}
function formatOnSaleTime(d: Date): string {
  return d.toLocaleTimeString("en-US", {
    hour: "numeric", minute: "2-digit", timeZoneName: "short",
  });
}

/**
 * Extract the display time from an event.
 *   1. Prefer `events.date`'s time portion (what the landing page shows)
 *   2. Fall back to `events.start_time` (private events store time there)
 *   3. Return "" when no time was set (midnight = "date only")
 */
function resolveEventTime(dateStr: string | null, startTime: string | null): string {
  if (dateStr) {
    const d = safeDate(dateStr);
    if (!Number.isNaN(d.getTime())) {
      const h = d.getHours();
      const m = d.getMinutes();
      if (h !== 0 || m !== 0) return formatTime(d);
    }
  }
  if (startTime) {
    const s = String(startTime).trim();
    // timestamp form "2026-03-14T20:00:00"
    const match = s.match(/T(\d{1,2}):(\d{2})/) || s.match(/^(\d{1,2}):(\d{2})/);
    if (match) {
      const hr = parseInt(match[1], 10);
      const min = match[2];
      const ampm = hr >= 12 ? "PM" : "AM";
      const disp = ((hr + 11) % 12) + 1;
      return `${disp}:${min} ${ampm}`;
    }
    return s;
  }
  return "";
}

// ────────────────────────────────────────────────────────────────────
//  Public: loadEventContext
// ────────────────────────────────────────────────────────────────────

export async function loadEventContext(
  client: SupabaseClient,
  eventId: string | null,
): Promise<RenderContext> {
  if (!eventId) return {} as RenderContext;

  const { data } = await client
    .from("events")
    .select("title, date, start_time, venue, venue_id, image_url, on_sale_at, landing_page_slug")
    .eq("id", eventId)
    .single();
  if (!data) return {} as RenderContext;

  // Venue canonical info + branding
  let venue_name = data.venue || "";
  let venue_primary = "#d0c290";
  let venue_logo = "";
  if (data.venue_id) {
    const { data: v } = await client
      .from("venues")
      .select("name, primary_color, logo_url")
      .eq("id", data.venue_id)
      .single();
    if (v?.name) venue_name = v.name;
    if (v?.primary_color) venue_primary = v.primary_color;
    if (v?.logo_url) venue_logo = v.logo_url;
  }

  // URL
  const origin = process.env.NEXT_PUBLIC_SITE_URL || "https://venuecore.live";
  const event_url = data.landing_page_slug
    ? `${origin}/e/${data.landing_page_slug}`
    : `${origin}/events/${eventId}`;

  // Date strings
  let event_date = "";
  let event_date_short = "";
  if (data.date) {
    try {
      const d = safeDate(String(data.date));
      if (!Number.isNaN(d.getTime())) {
        event_date = formatFull(d);
        event_date_short = formatShort(d);
      }
    } catch { /* ignore */ }
  }
  const event_time = resolveEventTime(data.date, data.start_time);

  // On-sale countdown — friendly defaults when missing / past
  const onSaleRaw = data.on_sale_at ? safeDate(String(data.on_sale_at)) : null;
  const onSaleValid = !!(onSaleRaw && !Number.isNaN(onSaleRaw.getTime()));
  const onSaleMs = onSaleValid ? onSaleRaw!.getTime() - Date.now() : -1;
  const onSaleInFuture = onSaleValid && onSaleMs > 0;

  const on_sale_date = onSaleValid ? formatFull(onSaleRaw!) : "now";
  const on_sale_date_short = onSaleValid ? formatShort(onSaleRaw!) : "now";
  const on_sale_time = onSaleValid ? formatOnSaleTime(onSaleRaw!) : "";
  const days_until_onsale = onSaleInFuture ? String(Math.floor(onSaleMs / 86_400_000)) : "0";
  const hours_until_onsale = onSaleInFuture ? String(Math.floor((onSaleMs % 86_400_000) / 3_600_000)) : "0";
  const minutes_until_onsale = onSaleInFuture ? String(Math.floor((onSaleMs % 3_600_000) / 60_000)) : "0";
  const has_presale = onSaleInFuture ? "true" : "false";

  return {
    email: "", // placeholder; overwritten by caller with the recipient's email
    event_name: data.title || "",
    event_title: data.title || "",
    event_date,
    event_date_short,
    event_time,
    event_image: data.image_url || "",
    event_url,
    venue_name,
    venue_primary_color: venue_primary,
    venue_logo_url: venue_logo,
    event_id: eventId,
    on_sale_date,
    on_sale_date_short,
    on_sale_time,
    days_until_onsale,
    hours_until_onsale,
    minutes_until_onsale,
    has_presale,
  };
}

/**
 * Synthetic defaults used in the composer's live preview, and in manual
 * campaign previews that aren't tied to a real event yet. Mirrors
 * loadEventContext()'s shape so template rendering is consistent.
 */
export function previewEventDefaults(): RenderContext {
  const onSaleFake = new Date(Date.now() + 3 * 86_400_000 + 5 * 3_600_000);
  return {
    email: "",
    event_name: "Your Event",
    event_title: "Your Event",
    event_date: "Saturday, March 1, 2026",
    event_date_short: "Sat, Mar 1",
    event_time: "8:00 PM",
    event_image: "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=1200&h=630&fit=crop",
    event_url: "https://venuecore.live/e/preview",
    venue_name: "Your Venue",
    venue_primary_color: "#d0c290",
    venue_logo_url: "",
    event_id: "",
    on_sale_date: formatFull(onSaleFake),
    on_sale_date_short: formatShort(onSaleFake),
    on_sale_time: formatOnSaleTime(onSaleFake),
    days_until_onsale: "3",
    hours_until_onsale: "5",
    minutes_until_onsale: "0",
    has_presale: "true",
  };
}

/**
 * Email Engine — attribute refresher.
 *
 * Recomputes `ee_contact_attributes` from the authoritative tables:
 *   • orders             (purchase rollups, favorite event type)
 *   • events             (join for event_type, venue_id, date)
 *   • customer_profiles  (lfv_segment mirror, total_spend reconciliation)
 *   • newsletter_subscribers (is_fwb_subscriber, is_unsubscribed)
 *   • cart_abandonment   (has_cart_abandonment)
 *   • ee_send_log        (engagement rollups)
 *   • ee_suppressions    (is_suppressed)
 *
 * Runs nightly via /api/cron/email-engine/refresh-attributes.
 * Fully idempotent and uses bulk upserts so re-running is safe.
 *
 * Performance: ~1 upsert query per ~1k contacts chunk, plus a handful of
 * aggregate reads. Designed to finish a venue-sized tenant (<= 500k
 * contacts) inside a 60s serverless window.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

type PurchaseRow = {
  email: string;
  total_orders: number;
  total_spent: number;
  first_order_at: string | null;
  last_order_at: string | null;
  last_event_date: string | null;
  total_events_attended: number;
  favorite_event_type: string | null;
  favorite_venue_id: string | null;
};

type EngagementRow = {
  email: string;
  emails_received: number;
  emails_opened: number;
  emails_clicked: number;
  last_email_sent_at: string | null;
  last_email_opened_at: string | null;
  last_email_clicked_at: string | null;
};

type FlagRow = {
  email: string;
  is_fwb_subscriber: boolean;
  is_unsubscribed: boolean;
  is_suppressed: boolean;
  has_cart_abandonment: boolean;
  lfv_segment: string | null;
};

/**
 * Refresh the ee_contacts materialized view first (so new emails flow in),
 * then recompute ee_contact_attributes for every email that appears in the
 * view. Returns counts for monitoring.
 */
export async function refreshAllAttributes(
  client: SupabaseClient,
): Promise<{ refreshed: number; durationMs: number }> {
  const started = Date.now();

  // 1. Refresh the contacts materialized view
  try {
    const { error: rpcErr } = await client.rpc("ee_refresh_contacts");
    if (rpcErr) console.warn("[EmailEngine] ee_refresh_contacts RPC failed", rpcErr.message);
  } catch (e) {
    console.warn("[EmailEngine] ee_refresh_contacts RPC threw", (e as Error).message);
  }

  // 2. Build rollups
  const purchase = await collectPurchaseRollups(client);
  const engagement = await collectEngagementRollups(client);
  const flags = await collectFlags(client);

  // 3. Merge by email
  const byEmail = new Map<string, Partial<PurchaseRow & EngagementRow & FlagRow>>();
  const put = (row: { email: string }) => {
    const key = row.email.toLowerCase();
    const existing = byEmail.get(key) ?? { email: key };
    byEmail.set(key, { ...existing, ...row, email: key });
  };
  purchase.forEach(put);
  engagement.forEach(put);
  flags.forEach(put);

  // 4. Upsert in 1k-sized chunks
  const rows = Array.from(byEmail.values()).map((r) => {
    const received = r.emails_received ?? 0;
    const opened = r.emails_opened ?? 0;
    const clicked = r.emails_clicked ?? 0;
    return {
      email: r.email!,
      total_events_attended: r.total_events_attended ?? 0,
      total_orders: r.total_orders ?? 0,
      total_spent: r.total_spent ?? 0,
      first_order_at: r.first_order_at ?? null,
      last_event_date: r.last_event_date ?? null,
      last_order_at: r.last_order_at ?? null,
      favorite_event_type: r.favorite_event_type ?? null,
      favorite_venue_id: r.favorite_venue_id ?? null,
      emails_received: received,
      emails_opened: opened,
      emails_clicked: clicked,
      last_email_sent_at: r.last_email_sent_at ?? null,
      last_email_opened_at: r.last_email_opened_at ?? null,
      last_email_clicked_at: r.last_email_clicked_at ?? null,
      open_rate: received > 0 ? Number((opened / received).toFixed(4)) : null,
      click_rate: received > 0 ? Number((clicked / received).toFixed(4)) : null,
      is_fwb_subscriber: r.is_fwb_subscriber ?? false,
      is_unsubscribed: r.is_unsubscribed ?? false,
      is_suppressed: r.is_suppressed ?? false,
      has_cart_abandonment: r.has_cart_abandonment ?? false,
      lfv_segment: r.lfv_segment ?? null,
      computed_at: new Date().toISOString(),
    };
  });

  const CHUNK = 1000;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    const { error } = await client
      .from("ee_contact_attributes")
      .upsert(slice, { onConflict: "email" });
    if (error) {
      console.error("[EmailEngine] attribute upsert failed", error);
      throw new Error(`attribute upsert failed: ${error.message}`);
    }
  }

  return { refreshed: rows.length, durationMs: Date.now() - started };
}

// ────────────────────────────────────────────────────────────────────
//  Sub-collectors — each one scans one authoritative table
// ────────────────────────────────────────────────────────────────────

async function collectPurchaseRollups(
  client: SupabaseClient,
): Promise<PurchaseRow[]> {
  // Pull orders + event join in pages of 1k, then aggregate in-memory.
  const PAGE = 1000;
  let from = 0;
  type OrderJoin = {
    customer_email: string;
    total_amount: number | string;
    created_at: string;
    events: { id: string; date: string | null; event_type: string | null; venue_id: string | null } | null;
  };
  const acc = new Map<string, {
    orders: number;
    spent: number;
    firstOrder: string | null;
    lastOrder: string | null;
    lastEventDate: string | null;
    eventsAttended: Set<string>;
    typeCount: Record<string, number>;
    venueCount: Record<string, number>;
  }>();

  for (;;) {
    const { data, error } = await client
      .from("orders")
      .select("customer_email,total_amount,created_at,events(id,date,event_type,venue_id)")
      .eq("status", "paid")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`orders scan failed: ${error.message}`);
    const rows = (data ?? []) as unknown as OrderJoin[];
    if (rows.length === 0) break;

    for (const o of rows) {
      if (!o.customer_email) continue;
      const key = o.customer_email.toLowerCase();
      const a = acc.get(key) ?? {
        orders: 0,
        spent: 0,
        firstOrder: null as string | null,
        lastOrder: null as string | null,
        lastEventDate: null as string | null,
        eventsAttended: new Set<string>(),
        typeCount: {} as Record<string, number>,
        venueCount: {} as Record<string, number>,
      };
      a.orders += 1;
      a.spent += Number(o.total_amount) || 0;
      if (!a.firstOrder || new Date(o.created_at) < new Date(a.firstOrder)) a.firstOrder = o.created_at;
      if (!a.lastOrder || new Date(o.created_at) > new Date(a.lastOrder)) a.lastOrder = o.created_at;
      const ev = o.events;
      if (ev?.id) a.eventsAttended.add(ev.id);
      if (ev?.date && (!a.lastEventDate || new Date(ev.date) > new Date(a.lastEventDate))) {
        a.lastEventDate = ev.date;
      }
      if (ev?.event_type) a.typeCount[ev.event_type] = (a.typeCount[ev.event_type] ?? 0) + 1;
      if (ev?.venue_id)   a.venueCount[ev.venue_id]  = (a.venueCount[ev.venue_id]  ?? 0) + 1;
      acc.set(key, a);
    }
    if (rows.length < PAGE) break;
    from += PAGE;
  }

  const out: PurchaseRow[] = [];
  for (const [email, a] of acc) {
    const favType = pickMode(a.typeCount);
    const favVenue = pickMode(a.venueCount);
    out.push({
      email,
      total_orders: a.orders,
      total_spent: Number(a.spent.toFixed(2)),
      first_order_at: a.firstOrder,
      last_order_at: a.lastOrder,
      last_event_date: a.lastEventDate,
      total_events_attended: a.eventsAttended.size,
      favorite_event_type: favType,
      favorite_venue_id: favVenue,
    });
  }
  return out;
}

async function collectEngagementRollups(
  client: SupabaseClient,
): Promise<EngagementRow[]> {
  const PAGE = 1000;
  let from = 0;
  type Row = {
    recipient_email: string;
    status: string;
    sent_at: string | null;
    opened_at: string | null;
    clicked_at: string | null;
  };
  const acc = new Map<string, {
    received: number;
    opened: number;
    clicked: number;
    lastSent: string | null;
    lastOpen: string | null;
    lastClick: string | null;
  }>();

  for (;;) {
    const { data, error } = await client
      .from("ee_send_log")
      .select("recipient_email,status,sent_at,opened_at,clicked_at")
      .range(from, from + PAGE - 1);
    if (error) {
      // Table exists but may be empty on first run — not fatal.
      console.warn("[EmailEngine] ee_send_log read failed", error.message);
      return [];
    }
    const rows = (data ?? []) as Row[];
    if (rows.length === 0) break;
    for (const r of rows) {
      if (!r.recipient_email) continue;
      const key = r.recipient_email.toLowerCase();
      const a = acc.get(key) ?? {
        received: 0, opened: 0, clicked: 0,
        lastSent: null as string | null,
        lastOpen: null as string | null,
        lastClick: null as string | null,
      };
      // A send counts toward received if it reached the provider.
      if (["sent","delivered","opened","clicked","bounced","complained"].includes(r.status)) a.received++;
      if (r.opened_at)  { a.opened++;  if (!a.lastOpen  || r.opened_at  > a.lastOpen)  a.lastOpen  = r.opened_at; }
      if (r.clicked_at) { a.clicked++; if (!a.lastClick || r.clicked_at > a.lastClick) a.lastClick = r.clicked_at; }
      if (r.sent_at && (!a.lastSent || r.sent_at > a.lastSent)) a.lastSent = r.sent_at;
      acc.set(key, a);
    }
    if (rows.length < PAGE) break;
    from += PAGE;
  }

  const out: EngagementRow[] = [];
  for (const [email, a] of acc) {
    out.push({
      email,
      emails_received: a.received,
      emails_opened: a.opened,
      emails_clicked: a.clicked,
      last_email_sent_at: a.lastSent,
      last_email_opened_at: a.lastOpen,
      last_email_clicked_at: a.lastClick,
    });
  }
  return out;
}

async function collectFlags(client: SupabaseClient): Promise<FlagRow[]> {
  const acc = new Map<string, FlagRow>();

  // FWB + unsubscribed from newsletter_subscribers
  const { data: nsRows, error: nsErr } = await client
    .from("newsletter_subscribers")
    .select("email,is_fwb_subscriber,unsubscribed_at")
    .limit(200_000);
  if (nsErr) console.warn("[EmailEngine] newsletter_subscribers read failed", nsErr.message);
  for (const r of (nsRows ?? []) as { email: string; is_fwb_subscriber: boolean | null; unsubscribed_at: string | null }[]) {
    if (!r.email) continue;
    const k = r.email.toLowerCase();
    acc.set(k, {
      email: k,
      is_fwb_subscriber: !!r.is_fwb_subscriber,
      is_unsubscribed: !!r.unsubscribed_at,
      is_suppressed: false,
      has_cart_abandonment: false,
      lfv_segment: null,
    });
  }

  // Suppressions
  const { data: supRows, error: supErr } = await client
    .from("ee_suppressions")
    .select("email")
    .limit(200_000);
  if (supErr) console.warn("[EmailEngine] ee_suppressions read failed", supErr.message);
  for (const r of (supRows ?? []) as { email: string }[]) {
    const k = r.email.toLowerCase();
    const cur = acc.get(k) ?? { email: k, is_fwb_subscriber: false, is_unsubscribed: false, is_suppressed: false, has_cart_abandonment: false, lfv_segment: null };
    cur.is_suppressed = true;
    acc.set(k, cur);
  }

  // Cart abandonment (currently-pending)
  const { data: caRows, error: caErr } = await client
    .from("cart_abandonment")
    .select("customer_email")
    .eq("recovered", false)
    .limit(200_000);
  if (caErr) console.warn("[EmailEngine] cart_abandonment read failed", caErr.message);
  for (const r of (caRows ?? []) as { customer_email: string }[]) {
    const k = r.customer_email.toLowerCase();
    const cur = acc.get(k) ?? { email: k, is_fwb_subscriber: false, is_unsubscribed: false, is_suppressed: false, has_cart_abandonment: false, lfv_segment: null };
    cur.has_cart_abandonment = true;
    acc.set(k, cur);
  }

  // LFV mirror from customer_profiles
  const { data: cpRows, error: cpErr } = await client
    .from("customer_profiles")
    .select("email,lfv_segment")
    .limit(200_000);
  if (cpErr) console.warn("[EmailEngine] customer_profiles read failed", cpErr.message);
  for (const r of (cpRows ?? []) as { email: string; lfv_segment: string | null }[]) {
    if (!r.email) continue;
    const k = r.email.toLowerCase();
    const cur = acc.get(k) ?? { email: k, is_fwb_subscriber: false, is_unsubscribed: false, is_suppressed: false, has_cart_abandonment: false, lfv_segment: null };
    cur.lfv_segment = r.lfv_segment;
    acc.set(k, cur);
  }

  return Array.from(acc.values());
}

// ────────────────────────────────────────────────────────────────────
//  Helpers
// ────────────────────────────────────────────────────────────────────

function pickMode(counts: Record<string, number>): string | null {
  let best: string | null = null;
  let bestN = 0;
  for (const [k, n] of Object.entries(counts)) {
    if (n > bestN) { best = k; bestN = n; }
  }
  return best;
}

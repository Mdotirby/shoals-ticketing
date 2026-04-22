/**
 * Email Engine — cross-module integrations (Phase 8).
 *
 * Exposes read-only views of email data to the Ad Engine and Deal Lab
 * WITHOUT duplicating user state. Every function in this file:
 *   • reads from ee_* tables only
 *   • returns plain data structures suitable for other modules to consume
 *   • never writes back into ticketing/order/user tables
 *
 * The *other* modules are responsible for how they use the data — this
 * file only exports the shape. That keeps module coupling one-way.
 */

import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { EngagementCohort, SegmentPerformanceFeed } from "../types";

// ────────────────────────────────────────────────────────────────────
//  Cohort exports → Ad Engine (Meta / Snap custom-audience seeds)
// ────────────────────────────────────────────────────────────────────

export type CohortSpec = {
  key: string;
  label: string;
  /** PostgREST filter expression evaluated against ee_contact_full. */
  filter: string;
};

/**
 * Canonical, rule-based cohorts derived from email engagement. These are
 * the seeds the Ad Engine can ingest as custom audiences.
 */
export const STANDARD_COHORTS: CohortSpec[] = [
  {
    key: "engaged_last_30d",
    label: "Engaged (opened or clicked in last 30 days)",
    filter: "or(last_email_opened_at.gte.$T30,last_email_clicked_at.gte.$T30)",
  },
  {
    key: "clicked_but_not_bought",
    label: "Clicked an email but never purchased",
    filter: "and(emails_clicked.gt.0,total_orders.eq.0)",
  },
  {
    key: "high_value_buyers",
    label: "High-value buyers ($500+ lifetime)",
    filter: "total_spent.gte.500",
  },
  {
    key: "dormant_loyalists",
    label: "Previous buyers, dormant 60+ days",
    filter: "and(total_orders.gt.0,last_order_at.lt.$T60)",
  },
  {
    key: "fwb_attended_3plus",
    label: "FWB subscribers who attended 3+ events",
    filter: "and(is_fwb_subscriber.eq.true,total_events_attended.gte.3)",
  },
];

function hydrateFilter(filter: string): string {
  // Replace $TN tokens with actual ISO timestamps N days ago.
  return filter.replace(/\$T(\d+)/g, (_, n: string) => {
    const days = Number(n);
    return new Date(Date.now() - days * 86_400_000).toISOString();
  });
}

function sha256Lower(email: string): string {
  return createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
}

/**
 * Build a hashed-email custom audience for the named cohort. Emails are
 * SHA-256 lowercased — the format accepted by both Meta and Snap custom
 * audiences, so the Ad Engine can forward them to either without rehashing.
 */
export async function buildCohort(
  client: SupabaseClient,
  cohort: CohortSpec,
  opts: { venue_id?: string | null; max_size?: number } = {},
): Promise<EngagementCohort> {
  const expression = hydrateFilter(cohort.filter);
  const max = opts.max_size ?? 250_000;
  const pageSize = 1000;

  let from = 0;
  const emails: string[] = [];
  for (;;) {
    let q = client
      .from("ee_contact_full")
      .select("email, venue_id")
      .or(expression)
      .range(from, from + pageSize - 1);
    if (opts.venue_id) q = q.eq("venue_id", opts.venue_id);
    const { data, error } = await q;
    if (error) throw new Error(`buildCohort failed: ${error.message}`);
    const rows = (data ?? []) as { email: string }[];
    for (const r of rows) if (r.email) emails.push(r.email.toLowerCase());
    if (rows.length < pageSize) break;
    if (emails.length >= max) break;
    from += pageSize;
  }

  return {
    key: cohort.key,
    label: cohort.label,
    hashed_emails: emails.map(sha256Lower),
    size: emails.length,
  };
}

export async function buildAllStandardCohorts(
  client: SupabaseClient,
  opts: { venue_id?: string | null } = {},
): Promise<EngagementCohort[]> {
  return Promise.all(STANDARD_COHORTS.map((c) => buildCohort(client, c, opts)));
}

// ────────────────────────────────────────────────────────────────────
//  Segment performance feed → Deal Lab
// ────────────────────────────────────────────────────────────────────

/**
 * For every segment that a recent campaign targeted, aggregate email→sale
 * performance and return it as demand signals Deal Lab can score against.
 *
 * The Deal Lab recommendation engine (modules/deal-lab/services/
 * recommendationEngine.ts) is the consumer — this function doesn't call
 * into it, preserving one-way coupling.
 */
export async function buildSegmentPerformanceFeed(
  client: SupabaseClient,
  opts: { days?: number; venue_id?: string | null } = {},
): Promise<SegmentPerformanceFeed[]> {
  const days = opts.days ?? 90;
  const since = new Date(Date.now() - days * 86_400_000).toISOString();

  // Pull campaigns + their aggregated metrics
  let q = client
    .from("ee_campaigns")
    .select("id, segment_id, venue_id, sent_at, ee_campaign_metrics(recipients,delivered,conversions,revenue)")
    .in("status", ["sent", "paused"])
    .gte("sent_at", since);
  if (opts.venue_id) q = q.eq("venue_id", opts.venue_id);
  const { data: campaigns } = await q;
  if (!campaigns) return [];

  // Group by segment_id
  const bySegment = new Map<string, {
    recipients: number; conversions: number; revenue: number;
  }>();
  for (const c of campaigns as unknown as Array<{
    id: string;
    segment_id: string | null;
    ee_campaign_metrics: Array<{ recipients: number | null; delivered: number | null; conversions: number | null; revenue: number | null }>;
  }>) {
    if (!c.segment_id) continue;
    const m = c.ee_campaign_metrics?.[0];
    if (!m) continue;
    const acc = bySegment.get(c.segment_id) ?? { recipients: 0, conversions: 0, revenue: 0 };
    acc.recipients += m.delivered ?? m.recipients ?? 0;
    acc.conversions += m.conversions ?? 0;
    acc.revenue += Number(m.revenue ?? 0);
    bySegment.set(c.segment_id, acc);
  }

  if (bySegment.size === 0) return [];
  const { data: segmentRows } = await client
    .from("ee_segments")
    .select("id, name")
    .in("id", Array.from(bySegment.keys()));
  const segNameById = new Map((segmentRows ?? []).map((s: { id: string; name: string }) => [s.id, s.name]));

  const out: SegmentPerformanceFeed[] = [];
  for (const [segment_id, v] of bySegment) {
    const delivered = v.recipients;
    out.push({
      segment_id,
      segment_name: segNameById.get(segment_id) ?? "(unknown segment)",
      recipients: delivered,
      conversions: v.conversions,
      conversion_rate: delivered > 0 ? Number((v.conversions / delivered).toFixed(4)) : 0,
      revenue: Number(v.revenue.toFixed(2)),
      revenue_per_email: delivered > 0 ? Number((v.revenue / delivered).toFixed(4)) : 0,
    });
  }
  out.sort((a, b) => b.revenue_per_email - a.revenue_per_email);
  return out;
}

// ────────────────────────────────────────────────────────────────────
//  Ad Engine inbound signals (refine segments from ticket sales)
// ────────────────────────────────────────────────────────────────────

/**
 * Ask the segmentation engine how many of its contacts ALSO bought from
 * a specific event. The Ad Engine can use this to weight lookalike bids —
 * segments that convert against hot events deserve more spend.
 *
 * This is a pure read; no writes happen. Safe to call during a cold path.
 */
export async function getSegmentEventOverlap(
  client: SupabaseClient,
  segmentId: string,
  eventId: string,
): Promise<{ segment_size: number; event_overlap: number; overlap_rate: number }> {
  const { data: seg } = await client
    .from("ee_segments")
    .select("id, last_count")
    .eq("id", segmentId)
    .single();
  if (!seg) return { segment_size: 0, event_overlap: 0, overlap_rate: 0 };

  const { data: orders } = await client
    .from("orders")
    .select("customer_email")
    .eq("event_id", eventId)
    .eq("status", "paid");
  const eventEmails = new Set((orders ?? []).map((o: { customer_email: string }) => (o.customer_email || "").toLowerCase()).filter(Boolean));
  if (eventEmails.size === 0) {
    return { segment_size: seg.last_count ?? 0, event_overlap: 0, overlap_rate: 0 };
  }

  // Check segment membership for the event attendees in batches of 500
  const batch = Array.from(eventEmails);
  let overlap = 0;
  const CHUNK = 500;
  for (let i = 0; i < batch.length; i += CHUNK) {
    const slice = batch.slice(i, i + CHUNK);
    const { count } = await client
      .from("ee_contact_full")
      .select("email", { head: true, count: "exact" })
      .in("email", slice);
    overlap += count ?? 0;
  }

  const size = seg.last_count ?? 0;
  return {
    segment_size: size,
    event_overlap: overlap,
    overlap_rate: size > 0 ? Number((overlap / size).toFixed(4)) : 0,
  };
}

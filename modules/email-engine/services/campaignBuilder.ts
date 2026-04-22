/**
 * Email Engine — campaign builder.
 *
 * Creates, updates, previews, schedules, and dispatches email campaigns.
 * Schedules enqueue rendered messages into ee_dispatch_queue; the cron
 * worker (/api/cron/email-engine/process-scheduled) drains the queue.
 *
 * No network I/O happens in this file — all sends are performed by the
 * dispatcher (services/dispatcher.ts) against Resend. That separation
 * keeps this module unit-testable and scale-safe (no sync hot loops).
 */

import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { EMAIL_ENGINE } from "../constants";
import type {
  EeCampaign,
  EeCampaignMetrics,
  EeSegment,
  RenderContext,
} from "../types";
import { listRecipients } from "./segmentation";
import { renderEmail } from "./renderer";

// ────────────────────────────────────────────────────────────────────
//  CRUD
// ────────────────────────────────────────────────────────────────────

export type CreateCampaignInput = {
  venue_id?: string | null;
  segment_id?: string | null;
  event_id?: string | null;
  name: string;
  subject: string;
  preview_text?: string | null;
  from_name?: string | null;
  from_email?: string | null;
  reply_to?: string | null;
  content_html: string;
  content_text?: string | null;
  template_key?: string | null;
  body_json?: unknown;
  scheduled_at?: string | null;
  created_by?: string | null;
};

export async function createCampaign(
  client: SupabaseClient,
  input: CreateCampaignInput,
): Promise<EeCampaign> {
  const { data: campaign, error } = await client
    .from("ee_campaigns")
    .insert({
      venue_id: input.venue_id ?? null,
      segment_id: input.segment_id ?? null,
      event_id: input.event_id ?? null,
      name: input.name,
      subject: input.subject,
      preview_text: input.preview_text ?? null,
      from_name: input.from_name ?? null,
      from_email: input.from_email ?? null,
      reply_to: input.reply_to ?? null,
      status: input.scheduled_at ? "scheduled" : "draft",
      scheduled_at: input.scheduled_at ?? null,
      created_by: input.created_by ?? null,
    })
    .select()
    .single();
  if (error) throw new Error(`createCampaign failed: ${error.message}`);

  const { error: msgErr } = await client.from("ee_campaign_messages").insert({
    campaign_id: campaign.id,
    content_html: input.content_html,
    content_text: input.content_text ?? null,
    body_json: input.body_json ?? null,
    template_key: input.template_key ?? null,
  });
  if (msgErr) throw new Error(`createCampaign message failed: ${msgErr.message}`);

  // Initialise empty metrics row for O(1) reads later
  await client.from("ee_campaign_metrics").insert({ campaign_id: campaign.id });

  return campaign as EeCampaign;
}

export async function updateCampaign(
  client: SupabaseClient,
  id: string,
  patch: Partial<CreateCampaignInput> & { status?: EeCampaign["status"] },
): Promise<EeCampaign> {
  const updates: Record<string, unknown> = {};
  const fields: (keyof CreateCampaignInput)[] = [
    "venue_id", "segment_id", "event_id", "name", "subject",
    "preview_text", "from_name", "from_email", "reply_to", "scheduled_at",
  ];
  for (const f of fields) if (patch[f] !== undefined) updates[f] = patch[f];
  if (patch.status) updates.status = patch.status;

  if (Object.keys(updates).length > 0) {
    const { error } = await client.from("ee_campaigns").update(updates).eq("id", id);
    if (error) throw new Error(`updateCampaign failed: ${error.message}`);
  }

  if (patch.content_html !== undefined || patch.content_text !== undefined || patch.body_json !== undefined) {
    const msgPatch: Record<string, unknown> = {};
    if (patch.content_html !== undefined) msgPatch.content_html = patch.content_html;
    if (patch.content_text !== undefined) msgPatch.content_text = patch.content_text;
    if (patch.body_json !== undefined) msgPatch.body_json = patch.body_json;
    if (patch.template_key !== undefined) msgPatch.template_key = patch.template_key;

    const { error } = await client
      .from("ee_campaign_messages")
      .update(msgPatch)
      .eq("campaign_id", id);
    if (error) throw new Error(`updateCampaign message failed: ${error.message}`);
  }

  const { data, error } = await client.from("ee_campaigns").select("*").eq("id", id).single();
  if (error) throw new Error(`updateCampaign refetch failed: ${error.message}`);
  return data as EeCampaign;
}

// ────────────────────────────────────────────────────────────────────
//  Preview
// ────────────────────────────────────────────────────────────────────

export async function previewCampaign(
  client: SupabaseClient,
  campaignId: string,
  sampleContext?: RenderContext,
): Promise<{ subject: string; html: string; text: string }> {
  const { data: campaign } = await client
    .from("ee_campaigns")
    .select("*")
    .eq("id", campaignId)
    .single();
  if (!campaign) throw new Error("Campaign not found");

  const { data: msg } = await client
    .from("ee_campaign_messages")
    .select("content_html, content_text")
    .eq("campaign_id", campaignId)
    .single();
  if (!msg) throw new Error("Campaign message not found");

  const eventCtx = await loadEventContext(client, campaign.event_id);

  const ctx: RenderContext = {
    ...eventCtx,
    first_name: sampleContext?.first_name ?? "Alex",
    last_name: sampleContext?.last_name ?? "Example",
    ...sampleContext,
    email: sampleContext?.email ?? "preview@venuecore.live",
  };

  const out = renderEmail({
    subject: campaign.subject,
    content_html: msg.content_html,
    content_text: msg.content_text,
    context: ctx,
    utm: {
      utm_campaign: `${EMAIL_ENGINE.UTM_CAMPAIGN_PREFIX}${campaign.id}`,
      utm_source: EMAIL_ENGINE.UTM_SOURCE,
      utm_medium: "email",
    },
    unsubscribe_url: "https://example.com/u/preview",
  });

  return { subject: out.subject, html: out.html, text: out.text };
}

// ────────────────────────────────────────────────────────────────────
//  Scheduling + dispatch (enqueues to ee_dispatch_queue)
// ────────────────────────────────────────────────────────────────────

const DEFAULT_FROM = process.env.RESEND_FROM_EMAIL || "VenueCore <noreply@venuecore.live>";

export async function sendCampaignNow(
  client: SupabaseClient,
  campaignId: string,
): Promise<{ enqueued: number; suppressed: number }> {
  return enqueueCampaign(client, campaignId);
}

export async function scheduleCampaign(
  client: SupabaseClient,
  campaignId: string,
  whenISO: string,
): Promise<void> {
  const { error } = await client
    .from("ee_campaigns")
    .update({ status: "scheduled", scheduled_at: whenISO })
    .eq("id", campaignId);
  if (error) throw new Error(`scheduleCampaign failed: ${error.message}`);
}

/**
 * Build a recipient list from the attached segment, render per-recipient,
 * insert one row in ee_send_log + ee_dispatch_queue per recipient, and
 * flip the campaign to 'sending'. The cron worker does the actual HTTP.
 */
export async function enqueueCampaign(
  client: SupabaseClient,
  campaignId: string,
): Promise<{ enqueued: number; suppressed: number }> {
  // Load campaign + message + segment + event context
  const { data: campaign } = await client
    .from("ee_campaigns")
    .select("*")
    .eq("id", campaignId)
    .single();
  if (!campaign) throw new Error("Campaign not found");
  if (campaign.status === "sent") throw new Error("Campaign already sent");

  const { data: msg } = await client
    .from("ee_campaign_messages")
    .select("content_html, content_text")
    .eq("campaign_id", campaignId)
    .single();
  if (!msg) throw new Error("Campaign message not found");

  if (!campaign.segment_id) throw new Error("Campaign has no segment attached");
  const { data: segment } = await client
    .from("ee_segments")
    .select("id, rules")
    .eq("id", campaign.segment_id)
    .single();
  if (!segment) throw new Error("Segment not found");

  const recipients = await listRecipients(client, segment as Pick<EeSegment, "rules">);
  if (recipients.length === 0) {
    await client
      .from("ee_campaigns")
      .update({ status: "sent", sent_at: new Date().toISOString(), total_recipients: 0 })
      .eq("id", campaignId);
    return { enqueued: 0, suppressed: 0 };
  }

  // Filter suppressions
  const emails = recipients.map((r) => r.email.toLowerCase());
  const { data: sups } = await client
    .from("ee_suppressions")
    .select("email")
    .in("email", emails);
  const suppressed = new Set((sups ?? []).map((r: { email: string }) => r.email.toLowerCase()));
  const eligible = recipients.filter((r) => !suppressed.has(r.email.toLowerCase()));

  const eventCtx = await loadEventContext(client, campaign.event_id);
  const utm = {
    utm_campaign: `${EMAIL_ENGINE.UTM_CAMPAIGN_PREFIX}${campaign.id}`,
    utm_source: EMAIL_ENGINE.UTM_SOURCE,
    utm_medium: "email",
  };

  // Flip to sending before enqueue so a crash mid-way isn't silently lost
  await client
    .from("ee_campaigns")
    .update({ status: "sending", total_recipients: eligible.length })
    .eq("id", campaignId);

  // Pre-create send_log rows then dispatch queue rows — insert in chunks
  const CHUNK = 500;
  let enqueued = 0;
  for (let i = 0; i < eligible.length; i += CHUNK) {
    const slice = eligible.slice(i, i + CHUNK);

    // 1. Create unsubscribe tokens in bulk
    const tokens = slice.map((r) => ({
      token: randomBytes(18).toString("base64url"),
      email: r.email.toLowerCase(),
      venue_id: campaign.venue_id,
      campaign_id: campaign.id,
    }));
    await client.from("ee_unsubscribe_tokens").insert(tokens);

    // 2. Render each recipient's message + insert send_log row
    const logRows = slice.map((r, idx) => ({
      campaign_id: campaign.id,
      recipient_email: r.email.toLowerCase(),
      recipient_name: joinName(r.first_name, r.last_name),
      status: "queued" as const,
      utm_campaign: utm.utm_campaign,
      // Stash token in error for pickup in enqueue (cleared when dispatched)
      error: tokens[idx].token,
    }));

    const { data: logInserted, error: logErr } = await client
      .from("ee_send_log")
      .insert(logRows)
      .select("id, recipient_email, recipient_name, error");
    if (logErr) throw new Error(`send_log insert failed: ${logErr.message}`);

    // 3. Build dispatch queue rows (render per recipient)
    const origin = process.env.NEXT_PUBLIC_SITE_URL || "https://venuecore.live";
    const queueRows = (logInserted ?? []).map((row) => {
      const ctx: RenderContext = {
        ...eventCtx,
        first_name: firstNameOf(row.recipient_name),
        last_name: lastNameOf(row.recipient_name),
        email: row.recipient_email,
      };
      const rendered = renderEmail({
        subject: campaign.subject,
        content_html: msg.content_html,
        content_text: msg.content_text,
        context: ctx,
        utm,
        unsubscribe_url: `${origin}/u/${row.error}`,
      });
      return {
        campaign_id: campaign.id,
        send_log_id: row.id,
        recipient_email: row.recipient_email,
        recipient_name: row.recipient_name,
        subject: rendered.subject,
        content_html: rendered.html,
        content_text: rendered.text,
        from_email: campaign.from_email || DEFAULT_FROM,
        from_name: campaign.from_name,
        reply_to: campaign.reply_to,
      };
    });

    const { error: queueErr } = await client.from("ee_dispatch_queue").insert(queueRows);
    if (queueErr) throw new Error(`dispatch queue insert failed: ${queueErr.message}`);

    // 4. Clear the temporary token from error field
    await client
      .from("ee_send_log")
      .update({ error: null })
      .in("id", (logInserted ?? []).map((r) => r.id));

    enqueued += slice.length;
  }

  return { enqueued, suppressed: recipients.length - eligible.length };
}

/** Finalise a campaign once the dispatch queue is empty for it. */
export async function finalizeCampaignIfDrained(
  client: SupabaseClient,
  campaignId: string,
): Promise<boolean> {
  const { count } = await client
    .from("ee_dispatch_queue")
    .select("id", { head: true, count: "exact" })
    .eq("campaign_id", campaignId);
  if ((count ?? 0) > 0) return false;

  const { data: agg } = await client
    .from("ee_send_log")
    .select("status", { head: false })
    .eq("campaign_id", campaignId);
  const sent = (agg ?? []).filter((r: { status: string }) =>
    ["sent","delivered","opened","clicked"].includes(r.status)).length;
  const failed = (agg ?? []).filter((r: { status: string }) =>
    ["failed","bounced","complained"].includes(r.status)).length;

  await client
    .from("ee_campaigns")
    .update({
      status: "sent",
      sent_at: new Date().toISOString(),
      total_sent: sent,
      total_failed: failed,
    })
    .eq("id", campaignId);
  return true;
}

// ────────────────────────────────────────────────────────────────────
//  Metrics pass-throughs for UI surfaces
// ────────────────────────────────────────────────────────────────────

export async function getCampaignMetrics(
  client: SupabaseClient,
  campaignId: string,
): Promise<EeCampaignMetrics | null> {
  const { data } = await client
    .from("ee_campaign_metrics")
    .select("*")
    .eq("campaign_id", campaignId)
    .maybeSingle();
  return (data as EeCampaignMetrics | null) ?? null;
}

// ────────────────────────────────────────────────────────────────────
//  Helpers
// ────────────────────────────────────────────────────────────────────

async function loadEventContext(
  client: SupabaseClient,
  eventId: string | null,
): Promise<RenderContext> {
  if (!eventId) return {} as RenderContext;
  const { data } = await client
    .from("events")
    .select("title, date, venue, venue_id, image_url")
    .eq("id", eventId)
    .single();
  if (!data) return {} as RenderContext;

  let venue_name = data.venue || "";
  if (data.venue_id) {
    const { data: v } = await client
      .from("venues")
      .select("name")
      .eq("id", data.venue_id)
      .single();
    if (v?.name) venue_name = v.name;
  }

  let event_date = "";
  if (data.date) {
    try {
      event_date = new Date(data.date).toLocaleDateString("en-US", {
        weekday: "long", month: "long", day: "numeric", year: "numeric",
      });
    } catch { event_date = String(data.date); }
  }

  return {
    email: "", // placeholder, overwritten by caller
    event_name: data.title || "",
    event_title: data.title || "",
    event_date,
    event_image: data.image_url || "",
    venue_name,
    event_id: eventId,
  };
}

function joinName(first: string | null, last: string | null): string | null {
  const s = `${first ?? ""} ${last ?? ""}`.trim();
  return s || null;
}
function firstNameOf(full: string | null): string {
  if (!full) return "";
  return full.trim().split(/\s+/)[0] || "";
}
function lastNameOf(full: string | null): string {
  if (!full) return "";
  const parts = full.trim().split(/\s+/);
  return parts.length > 1 ? parts.slice(1).join(" ") : "";
}

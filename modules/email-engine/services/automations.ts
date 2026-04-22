/**
 * Email Engine — automation engine.
 *
 * Pure-rules (no AI) event-triggered flow execution.
 *
 * Model:
 *   • ee_automation_flows = declarative flow definitions (trigger + steps)
 *   • ee_automation_runs  = per-contact execution instances with a dedup_key
 *   • ee_dispatch_queue   = outbound side-effect (shared with campaigns)
 *
 * Each invocation of runAutomationTick():
 *   1. discoverCandidates() for every active flow → inserts pending runs
 *      (dedup_key UNIQUE constraint prevents re-creation)
 *   2. executeDueRuns() advances runs whose next_run_at ≤ now:
 *         a) render the current step
 *         b) enqueue a row in ee_dispatch_queue
 *         c) bump current_step + next_run_at (or mark completed)
 *
 * Designed to run every minute via Vercel cron.
 */

import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { EMAIL_ENGINE } from "../constants";
import type {
  EeAutomationFlow,
  EeAutomationRun,
  EeAutomationStep,
  RenderContext,
} from "../types";
import { renderEmail } from "./renderer";
import { listRecipients } from "./segmentation";
import { loadEventContext } from "../lib/eventContext";

// ────────────────────────────────────────────────────────────────────
//  Entry point — called by cron
// ────────────────────────────────────────────────────────────────────

export type AutomationTickResult = {
  discovered: number;
  executed: number;
  completed: number;
  failed: number;
};

export async function runAutomationTick(
  client: SupabaseClient,
): Promise<AutomationTickResult> {
  const { data: flows, error } = await client
    .from("ee_automation_flows")
    .select("*")
    .eq("is_active", true);
  if (error) throw new Error(`flows fetch failed: ${error.message}`);

  let discovered = 0;
  for (const flow of (flows ?? []) as EeAutomationFlow[]) {
    try {
      discovered += await discoverCandidates(client, flow);
    } catch (e) {
      console.error(`[EmailEngine] discover failed for flow ${flow.id}:`, (e as Error).message);
    }
  }

  const { executed, completed, failed } = await executeDueRuns(client);
  return { discovered, executed, completed, failed };
}

// ────────────────────────────────────────────────────────────────────
//  Discovery — trigger-specific candidate detection
// ────────────────────────────────────────────────────────────────────

async function discoverCandidates(
  client: SupabaseClient,
  flow: EeAutomationFlow,
): Promise<number> {
  switch (flow.trigger_type) {
    case EMAIL_ENGINE.TRIGGERS.CART_ABANDONMENT:
      return discoverCartAbandonment(client, flow);
    case EMAIL_ENGINE.TRIGGERS.POST_EVENT_FOLLOWUP:
      return discoverPostEventFollowup(client, flow);
    case EMAIL_ENGINE.TRIGGERS.NEW_EVENT_ANNOUNCEMENT:
      return discoverNewEventAnnouncement(client, flow);
    case EMAIL_ENGINE.TRIGGERS.REPEAT_BUYER_NURTURE:
      return discoverRepeatBuyerNurture(client, flow);
    case EMAIL_ENGINE.TRIGGERS.WELCOME_SERIES:
      return discoverWelcomeSeries(client, flow);
    case EMAIL_ENGINE.TRIGGERS.REENGAGEMENT:
      return discoverReengagement(client, flow);
    default:
      return 0;
  }
}

/**
 * Cart abandonment: cart_abandonment rows where recovered=false
 * and recovery_email_sent=false AND created_at < now - grace_minutes.
 * Grace window comes from flow.config.grace_minutes (default 45).
 */
async function discoverCartAbandonment(
  client: SupabaseClient,
  flow: EeAutomationFlow,
): Promise<number> {
  const graceMin = Number(flow.config?.grace_minutes ?? 45);
  const cutoff = new Date(Date.now() - graceMin * 60_000).toISOString();

  const { data: rows } = await client
    .from("cart_abandonment")
    .select("id, event_id, customer_email, customer_name, created_at")
    .eq("recovered", false)
    .eq("recovery_email_sent", false)
    .lt("created_at", cutoff)
    .limit(500);

  if (!rows || rows.length === 0) return 0;

  const runs = rows.map((r) => ({
    flow_id: flow.id,
    recipient_email: String(r.customer_email).toLowerCase(),
    trigger_ref: {
      cart_id: r.id,
      event_id: r.event_id,
      customer_name: r.customer_name,
    },
    status: "pending" as const,
    next_run_at: new Date().toISOString(),
  }));
  const inserted = await insertRunsIgnoreDup(client, runs);

  // Mark the cart rows so we don't re-trigger
  if (inserted.length > 0) {
    await client
      .from("cart_abandonment")
      .update({ recovery_email_sent: true, recovery_sent_at: new Date().toISOString() })
      .in("id", inserted.map((r) => r.trigger_ref.cart_id as string));
  }
  return inserted.length;
}

/**
 * Post-event follow-up: for every event that ended >= days_after days ago
 * and <= days_after + 1 day ago, enqueue a run per distinct paid buyer.
 */
async function discoverPostEventFollowup(
  client: SupabaseClient,
  flow: EeAutomationFlow,
): Promise<number> {
  const daysAfter = Number(flow.config?.days_after ?? 2);
  const start = new Date(Date.now() - (daysAfter + 1) * 86_400_000).toISOString();
  const end   = new Date(Date.now() - daysAfter * 86_400_000).toISOString();

  const { data: events } = await client
    .from("events")
    .select("id, title, date, venue, venue_id")
    .gte("date", start)
    .lte("date", end)
    .limit(100);

  if (!events || events.length === 0) return 0;

  let total = 0;
  for (const ev of events) {
    const { data: orders } = await client
      .from("orders")
      .select("customer_email, customer_name")
      .eq("event_id", ev.id)
      .eq("status", "paid")
      .limit(5000);
    if (!orders || orders.length === 0) continue;

    const seen = new Set<string>();
    const runs: Parameters<typeof insertRunsIgnoreDup>[1] = [];
    for (const o of orders) {
      const email = (o.customer_email || "").toLowerCase();
      if (!email || seen.has(email)) continue;
      seen.add(email);
      runs.push({
        flow_id: flow.id,
        recipient_email: email,
        trigger_ref: {
          event_id: ev.id,
          event_title: ev.title,
          customer_name: o.customer_name,
        },
        status: "pending",
        next_run_at: new Date().toISOString(),
      });
    }
    const inserted = await insertRunsIgnoreDup(client, runs);
    total += inserted.length;
  }
  return total;
}

/**
 * New event announcement: when a new event is published (status='published')
 * less than N hours ago, enqueue one run per contact in the attached segment.
 * Segment is required on the flow.
 */
async function discoverNewEventAnnouncement(
  client: SupabaseClient,
  flow: EeAutomationFlow,
): Promise<number> {
  if (!flow.segment_id) return 0;
  const freshHours = Number(flow.config?.fresh_hours ?? 24);
  const cutoff = new Date(Date.now() - freshHours * 3_600_000).toISOString();

  const { data: events } = await client
    .from("events")
    .select("id, title, date, venue, venue_id, created_at, status")
    .eq("status", "published")
    .gte("created_at", cutoff)
    .limit(20);
  if (!events || events.length === 0) return 0;

  const { data: seg } = await client
    .from("ee_segments").select("id, rules").eq("id", flow.segment_id).single();
  if (!seg) return 0;

  const recipients = await listRecipients(client, { rules: seg.rules });
  if (recipients.length === 0) return 0;

  let total = 0;
  for (const ev of events) {
    const runs = recipients.map((r) => ({
      flow_id: flow.id,
      recipient_email: r.email.toLowerCase(),
      trigger_ref: {
        event_id: ev.id,
        event_title: ev.title,
        first_name: r.first_name,
        last_name: r.last_name,
      },
      status: "pending" as const,
      next_run_at: new Date().toISOString(),
    }));
    const inserted = await insertRunsIgnoreDup(client, runs);
    total += inserted.length;
  }
  return total;
}

/**
 * Repeat buyer nurture: contacts whose total_orders crossed a threshold
 * within the last 24h. Uses ee_contact_attributes; flow.config.min_orders
 * sets the threshold (default 3).
 */
async function discoverRepeatBuyerNurture(
  client: SupabaseClient,
  flow: EeAutomationFlow,
): Promise<number> {
  const minOrders = Number(flow.config?.min_orders ?? 3);
  const since = new Date(Date.now() - 86_400_000).toISOString();

  const { data: attrs } = await client
    .from("ee_contact_attributes")
    .select("email, total_orders, last_order_at")
    .gte("total_orders", minOrders)
    .gte("last_order_at", since)
    .limit(1000);
  if (!attrs || attrs.length === 0) return 0;

  const runs = attrs.map((a) => ({
    flow_id: flow.id,
    recipient_email: String(a.email).toLowerCase(),
    trigger_ref: { min_orders: minOrders, total_orders: a.total_orders },
    status: "pending" as const,
    next_run_at: new Date().toISOString(),
  }));
  const inserted = await insertRunsIgnoreDup(client, runs);
  return inserted.length;
}

/**
 * Welcome series: newsletter_subscribers created in last 24h
 * that haven't been touched by this flow yet.
 */
async function discoverWelcomeSeries(
  client: SupabaseClient,
  flow: EeAutomationFlow,
): Promise<number> {
  const since = new Date(Date.now() - 86_400_000).toISOString();
  const { data: subs } = await client
    .from("newsletter_subscribers")
    .select("email, first_name, last_name, created_at, unsubscribed_at")
    .gte("created_at", since)
    .is("unsubscribed_at", null)
    .limit(2000);
  if (!subs || subs.length === 0) return 0;

  const runs = subs.map((s) => ({
    flow_id: flow.id,
    recipient_email: String(s.email).toLowerCase(),
    trigger_ref: { first_name: s.first_name, last_name: s.last_name },
    status: "pending" as const,
    next_run_at: new Date().toISOString(),
  }));
  return (await insertRunsIgnoreDup(client, runs)).length;
}

/**
 * Re-engagement: contacts who have bought before but haven't opened any
 * email in N days. Threshold from flow.config.dormant_days (default 90).
 */
async function discoverReengagement(
  client: SupabaseClient,
  flow: EeAutomationFlow,
): Promise<number> {
  const dormant = Number(flow.config?.dormant_days ?? 90);
  const cutoff = new Date(Date.now() - dormant * 86_400_000).toISOString();

  const { data: attrs } = await client
    .from("ee_contact_attributes")
    .select("email, total_orders, last_email_opened_at")
    .gt("total_orders", 0)
    .or(`last_email_opened_at.lt.${cutoff},last_email_opened_at.is.null`)
    .limit(1000);
  if (!attrs || attrs.length === 0) return 0;

  const runs = attrs.map((a) => ({
    flow_id: flow.id,
    recipient_email: String(a.email).toLowerCase(),
    trigger_ref: { dormant_days: dormant },
    status: "pending" as const,
    next_run_at: new Date().toISOString(),
  }));
  return (await insertRunsIgnoreDup(client, runs)).length;
}

// ────────────────────────────────────────────────────────────────────
//  Execution — step advancement
// ────────────────────────────────────────────────────────────────────

async function executeDueRuns(client: SupabaseClient): Promise<{
  executed: number; completed: number; failed: number;
}> {
  const { data: due } = await client
    .from("ee_automation_runs")
    .select("*")
    .in("status", ["pending", "running"])
    .lte("next_run_at", new Date().toISOString())
    .limit(200);
  if (!due || due.length === 0) return { executed: 0, completed: 0, failed: 0 };

  let executed = 0;
  let completed = 0;
  let failed = 0;

  for (const run of due as EeAutomationRun[]) {
    try {
      const status = await executeRunStep(client, run);
      executed++;
      if (status === "completed") completed++;
    } catch (e) {
      failed++;
      await client
        .from("ee_automation_runs")
        .update({ status: "failed", last_error: (e as Error).message.slice(0, 500) })
        .eq("id", run.id);
    }
  }
  return { executed, completed, failed };
}

async function executeRunStep(
  client: SupabaseClient,
  run: EeAutomationRun,
): Promise<"completed" | "advanced"> {
  const { data: flow } = await client
    .from("ee_automation_flows")
    .select("*")
    .eq("id", run.flow_id)
    .single();
  if (!flow) throw new Error("flow missing");

  const steps = (flow.steps || []) as EeAutomationStep[];
  if (run.current_step >= steps.length) {
    await client
      .from("ee_automation_runs")
      .update({ status: "completed", completed_at: new Date().toISOString() })
      .eq("id", run.id);
    return "completed";
  }
  const step = steps[run.current_step];

  // Build context from trigger_ref + event lookup (if event_id present).
  // Uses the shared loader so automation emails pick up the same fields
  // (image, venue, time, on-sale countdown) the landing page shows.
  const triggerEventId =
    (run.trigger_ref as Record<string, unknown>).event_id as string | undefined;
  const eventCtx = await loadEventContext(client, triggerEventId ?? null);
  const ctx: RenderContext = {
    ...eventCtx,
    first_name: (run.trigger_ref as Record<string, unknown>).first_name as string | undefined,
    last_name: (run.trigger_ref as Record<string, unknown>).last_name as string | undefined,
    email: run.recipient_email,
  };

  const origin = process.env.NEXT_PUBLIC_SITE_URL || "https://venuecore.live";
  const token = randomBytes(18).toString("base64url");
  await client.from("ee_unsubscribe_tokens").insert({
    token,
    email: run.recipient_email,
    venue_id: flow.venue_id,
  });

  const rendered = renderEmail({
    subject: step.subject,
    content_html: step.content_html,
    content_text: step.content_text ?? null,
    context: ctx,
    utm: {
      utm_source: EMAIL_ENGINE.UTM_SOURCE,
      utm_medium: "email",
      utm_campaign: `ee-flow:${flow.id}:${run.current_step}`,
    },
    unsubscribe_url: `${origin}/u/${token}`,
  });

  // Create send_log row + dispatch queue row
  const { data: logRow, error: logErr } = await client
    .from("ee_send_log")
    .insert({
      campaign_id: null,
      automation_run_id: run.id,
      recipient_email: run.recipient_email,
      status: "queued",
      utm_campaign: `ee-flow:${flow.id}:${run.current_step}`,
    })
    .select("id")
    .single();
  if (logErr) throw new Error(`send_log insert: ${logErr.message}`);

  const { error: qErr } = await client.from("ee_dispatch_queue").insert({
    campaign_id: null,
    automation_run_id: run.id,
    send_log_id: logRow.id,
    recipient_email: run.recipient_email,
    recipient_name: joinNameFromCtx(ctx),
    subject: rendered.subject,
    content_html: rendered.html,
    content_text: rendered.text,
    from_email: (step.from_email as string | undefined) || process.env.RESEND_FROM_EMAIL || null,
    from_name: step.from_name ?? null,
    reply_to: step.reply_to ?? null,
    priority: 3,
  });
  if (qErr) throw new Error(`queue insert: ${qErr.message}`);

  // Advance run
  const nextIndex = run.current_step + 1;
  const finished = nextIndex >= steps.length;
  const nextStep = finished ? null : steps[nextIndex];
  const nextRunAt = finished
    ? null
    : new Date(Date.now() + (nextStep?.delay_minutes ?? 0) * 60_000).toISOString();

  await client
    .from("ee_automation_runs")
    .update({
      current_step: nextIndex,
      next_run_at: nextRunAt ?? new Date().toISOString(),
      status: finished ? "completed" : "running",
      started_at: run.started_at ?? new Date().toISOString(),
      completed_at: finished ? new Date().toISOString() : null,
    })
    .eq("id", run.id);

  return finished ? "completed" : "advanced";
}

// ────────────────────────────────────────────────────────────────────
//  Helpers
// ────────────────────────────────────────────────────────────────────

async function insertRunsIgnoreDup(
  client: SupabaseClient,
  runs: {
    flow_id: string;
    recipient_email: string;
    trigger_ref: Record<string, unknown>;
    status: "pending";
    next_run_at: string;
  }[],
): Promise<typeof runs> {
  if (runs.length === 0) return [];
  // The dedup_key unique constraint silently fails duplicate inserts; we use
  // onConflict: 'dedup_key,status' via upsert with ignoreDuplicates.
  const { data, error } = await client
    .from("ee_automation_runs")
    .upsert(runs, { onConflict: "dedup_key,status", ignoreDuplicates: true })
    .select("id, trigger_ref");
  if (error) {
    console.warn("[EmailEngine] automation run upsert failed:", error.message);
    return [];
  }
  return (data ?? []) as unknown as typeof runs;
}

function joinNameFromCtx(ctx: RenderContext): string | null {
  const s = `${ctx.first_name ?? ""} ${ctx.last_name ?? ""}`.trim();
  return s || null;
}

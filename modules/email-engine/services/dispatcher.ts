/**
 * Email Engine — dispatcher.
 *
 * Drains ee_dispatch_queue in small batches, sends each message via Resend,
 * updates ee_send_log with the provider's message_id, and retries on
 * transient errors with exponential backoff.
 *
 * Invoked by the /api/cron/email-engine/process-scheduled route on a 1-min
 * schedule. Each invocation processes up to DISPATCH_BATCH_SIZE rows and
 * returns control — Vercel cron will call again to drain the rest.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { EMAIL_ENGINE } from "../constants";

type QueueRow = {
  id: string;
  campaign_id: string | null;
  automation_run_id: string | null;
  send_log_id: string | null;
  recipient_email: string;
  recipient_name: string | null;
  subject: string;
  content_html: string;
  content_text: string | null;
  from_email: string | null;
  from_name: string | null;
  reply_to: string | null;
  attempts: number;
};

export type DispatchResult = {
  attempted: number;
  sent: number;
  failed: number;
  retried: number;
};

export async function processQueue(
  client: SupabaseClient,
  opts: { limit?: number; now?: Date } = {},
): Promise<DispatchResult> {
  const limit = opts.limit ?? EMAIL_ENGINE.DISPATCH_BATCH_SIZE;
  const now = opts.now ?? new Date();

  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    return { attempted: 0, sent: 0, failed: 0, retried: 0 };
  }

  // 1. Claim a batch of rows that are due and under attempt cap
  const { data: claimed, error: claimErr } = await client
    .from("ee_dispatch_queue")
    .select("*")
    .lte("available_at", now.toISOString())
    .lt("attempts", EMAIL_ENGINE.DISPATCH_MAX_ATTEMPTS)
    .order("priority", { ascending: true })
    .order("available_at", { ascending: true })
    .limit(limit);
  if (claimErr) throw new Error(`dispatch claim failed: ${claimErr.message}`);
  const batch = (claimed ?? []) as QueueRow[];
  if (batch.length === 0) {
    return { attempted: 0, sent: 0, failed: 0, retried: 0 };
  }

  // 2. Process sequentially with rate-limit pacing
  const result: DispatchResult = { attempted: batch.length, sent: 0, failed: 0, retried: 0 };

  for (const row of batch) {
    try {
      const messageId = await sendViaResend(row, resendKey);

      // Success: update send_log, delete queue row
      if (row.send_log_id) {
        await client
          .from("ee_send_log")
          .update({
            status: "sent",
            sent_at: new Date().toISOString(),
            resend_message_id: messageId ?? null,
            error: null,
          })
          .eq("id", row.send_log_id);
      }
      await client.from("ee_dispatch_queue").delete().eq("id", row.id);
      result.sent++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const nextAttempts = row.attempts + 1;

      if (nextAttempts >= EMAIL_ENGINE.DISPATCH_MAX_ATTEMPTS) {
        // Final failure: mark send_log failed, delete queue row
        if (row.send_log_id) {
          await client
            .from("ee_send_log")
            .update({
              status: "failed",
              failed_at: new Date().toISOString(),
              error: msg.slice(0, 500),
            })
            .eq("id", row.send_log_id);
        }
        await client.from("ee_dispatch_queue").delete().eq("id", row.id);
        result.failed++;
      } else {
        // Retry with exponential backoff
        const delay = Math.min(
          EMAIL_ENGINE.DISPATCH_BACKOFF_MIN_MS * Math.pow(2, nextAttempts - 1),
          EMAIL_ENGINE.DISPATCH_BACKOFF_MAX_MS,
        );
        const nextAvailable = new Date(Date.now() + delay).toISOString();
        await client
          .from("ee_dispatch_queue")
          .update({
            attempts: nextAttempts,
            last_error: msg.slice(0, 500),
            available_at: nextAvailable,
          })
          .eq("id", row.id);
        result.retried++;
      }
    }

    // Inter-send pacing to respect Resend's rate limit
    await new Promise((r) => setTimeout(r, EMAIL_ENGINE.DISPATCH_INTER_SEND_MS));
  }

  return result;
}

// ────────────────────────────────────────────────────────────────────
//  Resend adapter — kept local to avoid any other modules depending on it
// ────────────────────────────────────────────────────────────────────

async function sendViaResend(row: QueueRow, apiKey: string): Promise<string | null> {
  const from = row.from_name
    ? `${row.from_name} <${row.from_email || process.env.RESEND_FROM_EMAIL}>`
    : row.from_email || process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";

  // One-click unsubscribe header per RFC 8058 — we embed the list URL from the
  // rendered content via a <!-- ee-footer --> marker. If we need explicit
  // header control we can extend ee_dispatch_queue; for now, link in footer.
  const headers: Record<string, string> = {};
  const listUnsub = extractListUnsubscribe(row.content_html);
  if (listUnsub) {
    headers["List-Unsubscribe"] = `<${listUnsub}>`;
    headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
  }

  const body: Record<string, unknown> = {
    from,
    to: row.recipient_email,
    subject: row.subject,
    html: row.content_html,
    text: row.content_text ?? undefined,
    reply_to: row.reply_to ?? undefined,
    headers: Object.keys(headers).length > 0 ? headers : undefined,
  };

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Resend ${res.status}: ${txt.slice(0, 300)}`);
  }
  const data = (await res.json()) as { id?: string };
  return data.id ?? null;
}

function extractListUnsubscribe(html: string): string | null {
  // Matches the <a href="..."> inside the footer block (data-ee-footer) or
  // the fallback footer div we inject in renderer.ts (same attribute).
  const m = html.match(/data-ee-footer="1"[\s\S]*?href="([^"]+)"/);
  return m ? m[1] : null;
}

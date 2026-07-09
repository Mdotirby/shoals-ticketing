import { createAdminClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";

export const runtime = "nodejs";

// Verify Resend/Svix webhook signature when RESEND_WEBHOOK_SECRET is set.
// Signed content: "{svix-id}.{svix-timestamp}.{raw-body}"
// Secret format from dashboard: "whsec_<base64>"
async function verifySignature(request: Request): Promise<{ ok: boolean; rawBody: string }> {
  const rawBody = await request.text();
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    // Not configured — log and pass through so existing behaviour is unchanged.
    console.warn("[Resend webhook] RESEND_WEBHOOK_SECRET not set — skipping signature check");
    return { ok: true, rawBody };
  }

  const msgId = request.headers.get("svix-id") ?? "";
  const msgTimestamp = request.headers.get("svix-timestamp") ?? "";
  const msgSig = request.headers.get("svix-signature") ?? "";

  if (!msgId || !msgTimestamp || !msgSig) {
    return { ok: false, rawBody };
  }

  // Reject replays older than 5 minutes
  const tsSeconds = parseInt(msgTimestamp, 10);
  if (Math.abs(Date.now() / 1000 - tsSeconds) > 300) {
    return { ok: false, rawBody };
  }

  const keyBytes = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const signedContent = `${msgId}.${msgTimestamp}.${rawBody}`;
  const computed = createHmac("sha256", keyBytes).update(signedContent).digest("base64");

  const signatures = msgSig.split(" ").map((s) => s.replace(/^v1,/, ""));
  const match = signatures.some((sig) => {
    try {
      return timingSafeEqual(Buffer.from(sig, "base64"), Buffer.from(computed, "base64"));
    } catch {
      return false;
    }
  });

  return { ok: match, rawBody };
}

// POST /api/webhooks/resend — Resend webhook for email events
// Configure in Resend dashboard: https://resend.com/webhooks
// Events: email.delivered, email.opened, email.clicked, email.bounced, email.complained
export async function POST(request: Request) {
  try {
    const { ok, rawBody } = await verifySignature(request);
    if (!ok) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    type ResendEvent = {
      type?: string;
      data?: {
        email_id?: string;
        id?: string;
        broadcast_id?: string;
        to?: string[];
        [k: string]: unknown;
      };
    };
    const body = JSON.parse(rawBody) as ResendEvent;
    const { type, data } = body;

    if (!type || !data) {
      return NextResponse.json({ error: "Invalid webhook payload" }, { status: 400 });
    }

    const admin = createAdminClient();
    const messageId = data.email_id ?? data.id;

    if (!messageId) {
      return NextResponse.json({ received: true });
    }

    // Map Resend event types to our status
    const statusMap: Record<string, string> = {
      "email.delivered": "delivered",
      "email.opened": "opened",
      "email.clicked": "clicked",
      "email.bounced": "bounced",
      "email.complained": "complained",
    };

    const newStatus = statusMap[type];
    if (!newStatus) {
      return NextResponse.json({ received: true });
    }

    // Status priority: clicked > opened > delivered > sent
    const statusPriority: Record<string, number> = {
      queued: 0, sent: 1, delivered: 2, opened: 3, clicked: 4, bounced: 5, complained: 6, failed: 7,
    };

    // ── 1) Legacy email_sends table (unchanged behaviour) ──────────────
    const { data: send } = await admin
      .from("email_sends")
      .select("id, status")
      .eq("resend_message_id", messageId)
      .maybeSingle();

    if (send) {
      const currentPriority = statusPriority[send.status] ?? 0;
      const newPriority = statusPriority[newStatus] ?? 0;
      if (newPriority > currentPriority) {
        const updates: Record<string, unknown> = { status: newStatus };
        if (newStatus === "opened") updates.opened_at = new Date().toISOString();
        if (newStatus === "clicked") {
          updates.clicked_at = new Date().toISOString();
          if (currentPriority < statusPriority.opened) {
            updates.opened_at = updates.opened_at || new Date().toISOString();
          }
        }
        if (newStatus === "bounced") updates.bounced_at = new Date().toISOString();
        await admin.from("email_sends").update(updates).eq("id", send.id);
      }
    }

    // ── 2) Email Engine ee_send_log — additive, isolated ──────────────
    const { data: eeSend } = await admin
      .from("ee_send_log")
      .select("id, status, open_count, click_count, recipient_email")
      .eq("resend_message_id", messageId)
      .maybeSingle();
    if (eeSend) {
      const cur = statusPriority[eeSend.status] ?? 0;
      const nxt = statusPriority[newStatus] ?? 0;
      const updates: Record<string, unknown> = {};
      if (newStatus === "delivered" && nxt > cur) {
        updates.status = "delivered";
        updates.delivered_at = new Date().toISOString();
      }
      if (newStatus === "opened") {
        updates.open_count = (eeSend.open_count ?? 0) + 1;
        updates.opened_at = new Date().toISOString();
        if (nxt > cur) updates.status = "opened";
      }
      if (newStatus === "clicked") {
        updates.click_count = (eeSend.click_count ?? 0) + 1;
        updates.clicked_at = new Date().toISOString();
        if (nxt > cur) updates.status = "clicked";
      }
      if (newStatus === "bounced") {
        updates.status = "bounced";
        updates.bounced_at = new Date().toISOString();
      }
      if (newStatus === "complained") {
        updates.status = "complained";
        updates.complained_at = new Date().toISOString();
      }
      if (Object.keys(updates).length > 0) {
        await admin.from("ee_send_log").update(updates).eq("id", eeSend.id);
      }
      // Promote bounces/complaints into the suppression list so future
      // campaigns skip this address.
      if (newStatus === "bounced" || newStatus === "complained") {
        await admin.from("ee_suppressions").upsert(
          { email: eeSend.recipient_email, reason: newStatus === "bounced" ? "bounce" : "complaint" },
          { onConflict: "email" },
        );
      }
    }

    // ── 3) Standalone broadcasts — recipient-level, resolved via broadcast_id ──
    // email_sends.resend_message_id holds the *broadcast* id for these rows
    // (see standalone-emails/lib/sendEventAnnouncement.ts), not a message id,
    // so it can't be matched directly against this event's messageId. Resolve
    // via data.broadcast_id instead, then upsert a per-recipient detail row.
    const broadcastId = data.broadcast_id;
    const recipientEmail = data.to?.[0];

    if (broadcastId && recipientEmail) {
      const { data: parentSend } = await admin
        .from("email_sends")
        .select("id")
        .eq("resend_message_id", broadcastId)
        .not("trigger_type", "is", null)
        .maybeSingle();

      if (parentSend) {
        const { data: existing } = await admin
          .from("broadcast_recipients")
          .select("id, status")
          .eq("email_send_id", parentSend.id)
          .eq("recipient_email", recipientEmail)
          .maybeSingle();

        const recipientUpdates: Record<string, unknown> = { resend_message_id: messageId };
        if (newStatus === "delivered") recipientUpdates.status = "delivered";
        if (newStatus === "opened") {
          recipientUpdates.status = "opened";
          recipientUpdates.opened_at = new Date().toISOString();
        }
        if (newStatus === "clicked") {
          recipientUpdates.status = "clicked";
          recipientUpdates.clicked_at = new Date().toISOString();
        }
        if (newStatus === "bounced") {
          recipientUpdates.status = "bounced";
          recipientUpdates.bounced_at = new Date().toISOString();
        }
        if (newStatus === "complained") recipientUpdates.status = "complained";

        if (existing) {
          const curPriority = statusPriority[existing.status] ?? 0;
          const nxtPriority = statusPriority[newStatus] ?? 0;
          if (nxtPriority >= curPriority) {
            await admin.from("broadcast_recipients").update(recipientUpdates).eq("id", existing.id);
          }
        } else {
          await admin.from("broadcast_recipients").insert({
            email_send_id: parentSend.id,
            recipient_email: recipientEmail,
            ...recipientUpdates,
          });
        }
      }
    }

    return NextResponse.json({ received: true, updated: newStatus });
  } catch (err) {
    console.error("Resend webhook error:", err);
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}

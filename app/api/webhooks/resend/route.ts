import { createAdminClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";

// POST /api/webhooks/resend — Resend webhook for email events
// Configure in Resend dashboard: https://resend.com/webhooks
// Events: email.delivered, email.opened, email.clicked, email.bounced, email.complained
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { type, data } = body;

    if (!type || !data) {
      return NextResponse.json({ error: "Invalid webhook payload" }, { status: 400 });
    }

    const admin = createAdminClient();
    const messageId = data.email_id || data.id;

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

    return NextResponse.json({ received: true, updated: newStatus });
  } catch (err) {
    console.error("Resend webhook error:", err);
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}

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

    // Find the email_send by resend_message_id
    const { data: send } = await admin
      .from("email_sends")
      .select("id, status")
      .eq("resend_message_id", messageId)
      .single();

    if (!send) {
      // Not one of our tracked campaign emails, ignore
      return NextResponse.json({ received: true });
    }

    // Only upgrade status (don't downgrade: clicked > opened > delivered > sent)
    const statusPriority: Record<string, number> = {
      queued: 0, sent: 1, delivered: 2, opened: 3, clicked: 4, bounced: 5, complained: 6, failed: 7,
    };

    const currentPriority = statusPriority[send.status] ?? 0;
    const newPriority = statusPriority[newStatus] ?? 0;

    if (newPriority > currentPriority) {
      const updates: Record<string, unknown> = { status: newStatus };

      if (newStatus === "opened") updates.opened_at = new Date().toISOString();
      if (newStatus === "clicked") {
        updates.clicked_at = new Date().toISOString();
        // If not already marked as opened, set that too
        if (currentPriority < statusPriority.opened) {
          updates.opened_at = updates.opened_at || new Date().toISOString();
        }
      }
      if (newStatus === "bounced") updates.bounced_at = new Date().toISOString();

      await admin
        .from("email_sends")
        .update(updates)
        .eq("id", send.id);
    }

    return NextResponse.json({ received: true, updated: newStatus });
  } catch (err) {
    console.error("Resend webhook error:", err);
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}

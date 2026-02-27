import { createAdminClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";

// GET /api/marketing/email-kpis — Aggregate email performance data
export async function GET() {
  const admin = createAdminClient();

  // Get all campaigns with their send stats
  const { data: campaigns, error: campError } = await admin
    .from("email_campaigns")
    .select("id, name, sent_at, total_recipients, status")
    .in("status", ["sent", "sending"])
    .order("sent_at", { ascending: false });

  if (campError) {
    // Table might not exist yet
    return NextResponse.json({
      total_sent: 0, total_delivered: 0, total_opened: 0, total_clicked: 0, total_bounced: 0,
      open_rate: "0", click_rate: "0", bounce_rate: "0", campaigns: [],
    });
  }

  // Get aggregate send stats
  const { data: sends } = await admin
    .from("email_sends")
    .select("campaign_id, status");

  const sendsByStatus: Record<string, Record<string, number>> = {};
  const globalCounts = { sent: 0, delivered: 0, opened: 0, clicked: 0, bounced: 0 };

  (sends ?? []).forEach((s: { campaign_id: string; status: string }) => {
    if (!sendsByStatus[s.campaign_id]) {
      sendsByStatus[s.campaign_id] = { sent: 0, delivered: 0, opened: 0, clicked: 0, bounced: 0 };
    }

    // Each status is the "highest" status reached, so opened implies delivered
    sendsByStatus[s.campaign_id].sent += 1;
    globalCounts.sent += 1;

    if (["delivered", "opened", "clicked"].includes(s.status)) {
      sendsByStatus[s.campaign_id].delivered += 1;
      globalCounts.delivered += 1;
    }
    if (["opened", "clicked"].includes(s.status)) {
      sendsByStatus[s.campaign_id].opened += 1;
      globalCounts.opened += 1;
    }
    if (s.status === "clicked") {
      sendsByStatus[s.campaign_id].clicked += 1;
      globalCounts.clicked += 1;
    }
    if (s.status === "bounced") {
      sendsByStatus[s.campaign_id].bounced += 1;
      globalCounts.bounced += 1;
    }
  });

  const openRate = globalCounts.delivered > 0 ? ((globalCounts.opened / globalCounts.delivered) * 100).toFixed(1) : "0";
  const clickRate = globalCounts.delivered > 0 ? ((globalCounts.clicked / globalCounts.delivered) * 100).toFixed(1) : "0";
  const bounceRate = globalCounts.sent > 0 ? ((globalCounts.bounced / globalCounts.sent) * 100).toFixed(1) : "0";

  const campaignStats = (campaigns ?? []).map((c: { id: string; name: string; sent_at: string | null; total_recipients: number }) => {
    const stats = sendsByStatus[c.id] || { sent: 0, delivered: 0, opened: 0, clicked: 0, bounced: 0 };
    return {
      id: c.id,
      name: c.name,
      sent_at: c.sent_at,
      total_recipients: c.total_recipients,
      ...stats,
    };
  });

  return NextResponse.json({
    total_sent: globalCounts.sent,
    total_delivered: globalCounts.delivered,
    total_opened: globalCounts.opened,
    total_clicked: globalCounts.clicked,
    total_bounced: globalCounts.bounced,
    open_rate: openRate,
    click_rate: clickRate,
    bounce_rate: bounceRate,
    campaigns: campaignStats,
  });
}

import { createAdminClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";

// GET /api/marketing/fwb-email-kpis — FWB welcome email performance data
export async function GET() {
  const admin = createAdminClient();

  // Get all FWB welcome email sends (campaign_id IS NULL, recipient_name starts with [FWB Welcome])
  const { data: sends, error } = await admin
    .from("email_sends")
    .select("id, recipient_email, recipient_name, status, created_at, opened_at, clicked_at, bounced_at")
    .is("campaign_id", null)
    .ilike("recipient_name", "[FWB Welcome]%")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("FWB email KPIs error:", error);
    return NextResponse.json({
      total_sent: 0, total_delivered: 0, total_opened: 0, total_clicked: 0,
      total_bounced: 0, total_failed: 0,
      open_rate: "0", click_rate: "0", bounce_rate: "0",
      recent_sends: [],
    });
  }

  const allSends = sends ?? [];

  const counts = {
    sent: 0, delivered: 0, opened: 0, clicked: 0, bounced: 0, failed: 0,
  };

  allSends.forEach((s) => {
    counts.sent += 1;
    if (["delivered", "opened", "clicked"].includes(s.status)) counts.delivered += 1;
    if (["opened", "clicked"].includes(s.status)) counts.opened += 1;
    if (s.status === "clicked") counts.clicked += 1;
    if (s.status === "bounced") counts.bounced += 1;
    if (s.status === "failed") counts.failed += 1;
  });

  const openRate = counts.delivered > 0 ? ((counts.opened / counts.delivered) * 100).toFixed(1) : "0";
  const clickRate = counts.delivered > 0 ? ((counts.clicked / counts.delivered) * 100).toFixed(1) : "0";
  const bounceRate = counts.sent > 0 ? ((counts.bounced / counts.sent) * 100).toFixed(1) : "0";

  // Daily send volume (last 30 days)
  const dailySends: Record<string, number> = {};
  allSends.forEach((s) => {
    const day = new Date(s.created_at).toISOString().split("T")[0];
    dailySends[day] = (dailySends[day] || 0) + 1;
  });

  return NextResponse.json({
    total_sent: counts.sent,
    total_delivered: counts.delivered,
    total_opened: counts.opened,
    total_clicked: counts.clicked,
    total_bounced: counts.bounced,
    total_failed: counts.failed,
    open_rate: openRate,
    click_rate: clickRate,
    bounce_rate: bounceRate,
    daily_sends: Object.entries(dailySends)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, count]) => ({ date, count })),
    recent_sends: allSends.slice(0, 20).map((s) => ({
      email: s.recipient_email,
      name: s.recipient_name?.replace("[FWB Welcome] ", "") || "",
      status: s.status,
      sent_at: s.created_at,
      opened_at: s.opened_at,
      clicked_at: s.clicked_at,
    })),
  });
}

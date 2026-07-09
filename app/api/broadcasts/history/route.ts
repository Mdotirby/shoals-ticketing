// GET /api/broadcasts/history — send log with real open/click/revenue
// rollups. Scoped to trigger_type IS NOT NULL, which cleanly excludes
// legacy per-recipient email_sends rows that predate the standalone system.
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-server";
import { computeSendRevenue } from "@/standalone-emails/lib/attributeRevenue";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get("limit") || "20", 10), 100);
    const offset = parseInt(searchParams.get("offset") || "0", 10);

    const admin = createAdminClient();

    const { data: sends, error, count } = await admin
      .from("email_sends")
      .select("id, trigger_type, event_id, resend_segment_id, sent_at", { count: "exact" })
      .not("trigger_type", "is", null)
      .order("sent_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw new Error(error.message);
    if (!sends || sends.length === 0) {
      return NextResponse.json({ sends: [], total: count ?? 0 });
    }

    const eventIds = sends.map((s) => s.event_id).filter((id): id is string => !!id);
    const eventsById = new Map<string, string>();
    if (eventIds.length > 0) {
      const { data: eventRows } = await admin.from("events").select("id, title").in("id", eventIds);
      for (const e of eventRows ?? []) eventsById.set(e.id, e.title);
    }

    const enriched = await Promise.all(
      sends.map(async (send) => {
        const { data: recipients } = await admin
          .from("broadcast_recipients")
          .select("status")
          .eq("email_send_id", send.id);

        const recipientCount = recipients?.length ?? 0;
        const opens = (recipients ?? []).filter((r) => r.status === "opened" || r.status === "clicked").length;
        const clicks = (recipients ?? []).filter((r) => r.status === "clicked").length;
        const revenue = await computeSendRevenue(send.id);

        return {
          id: send.id,
          triggerType: send.trigger_type,
          eventTitle: send.event_id ? eventsById.get(send.event_id) ?? null : null,
          sentAt: send.sent_at,
          recipientCount,
          opens,
          clicks,
          openRate: recipientCount > 0 ? opens / recipientCount : null,
          clickRate: recipientCount > 0 ? clicks / recipientCount : null,
          revenue,
        };
      }),
    );

    return NextResponse.json({ sends: enriched, total: count ?? enriched.length });
  } catch (err) {
    console.error("broadcasts/history error:", err);
    return NextResponse.json({ error: "Failed to load send history" }, { status: 500 });
  }
}

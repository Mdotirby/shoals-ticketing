// POST /api/broadcasts/test — single-recipient preview send. Never logged
// to email_sends (matches sendXTest's existing intent — only broadcasts are
// logged/attributed).
import { NextResponse } from "next/server";
import { sendEventAnnouncementTest } from "@/standalone-emails/lib/sendEventAnnouncement";
import { sendUpcomingEventsTest } from "@/standalone-emails/lib/sendUpcomingEventsEmail";
import { TRIGGERS } from "@/standalone-emails/lib/triggers";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { trigger, eventId, limit, to } = body;

    if (!to) return NextResponse.json({ error: "to is required" }, { status: 400 });

    let result;
    if (trigger === TRIGGERS.NEW_EVENT_ANNOUNCEMENT) {
      if (!eventId) return NextResponse.json({ error: "eventId is required" }, { status: 400 });
      result = await sendEventAnnouncementTest(eventId, to);
    } else if (trigger === TRIGGERS.UPCOMING_EVENTS_DIGEST) {
      result = await sendUpcomingEventsTest(limit && limit > 0 ? limit : 3, to);
    } else {
      return NextResponse.json({ error: `Unknown or unbuilt trigger: ${trigger}` }, { status: 400 });
    }

    if (result.error) {
      return NextResponse.json({ error: result.error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, messageId: result.data?.id ?? null });
  } catch (err) {
    console.error("broadcasts/test error:", err);
    return NextResponse.json({ error: "Failed to send test email" }, { status: 500 });
  }
}

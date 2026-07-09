// POST /api/broadcasts/send — real broadcast to the newsletter segment.
// segmentId is resolved server-side; never chosen or seen by the admin UI
// (newsletter-only audience, per current scope).
import { NextResponse } from "next/server";
import { sendEventAnnouncementBroadcast } from "@/standalone-emails/lib/sendEventAnnouncement";
import { sendUpcomingEventsBroadcast } from "@/standalone-emails/lib/sendUpcomingEventsEmail";
import { getNewsletterSegmentId } from "@/standalone-emails/lib/getNewsletterSegmentId";
import { TRIGGERS } from "@/standalone-emails/lib/triggers";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { trigger, eventId, limit, confirm } = body;

    if (!confirm) {
      return NextResponse.json({ error: "confirm must be true to send a broadcast" }, { status: 400 });
    }

    const segmentId = await getNewsletterSegmentId();

    let result;
    if (trigger === TRIGGERS.NEW_EVENT_ANNOUNCEMENT) {
      if (!eventId) return NextResponse.json({ error: "eventId is required" }, { status: 400 });
      result = await sendEventAnnouncementBroadcast(eventId, segmentId);
    } else if (trigger === TRIGGERS.UPCOMING_EVENTS_DIGEST) {
      result = await sendUpcomingEventsBroadcast(limit && limit > 0 ? limit : 3, segmentId);
    } else {
      return NextResponse.json({ error: `Unknown or unbuilt trigger: ${trigger}` }, { status: 400 });
    }

    if (result.error) {
      return NextResponse.json({ error: result.error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, broadcastId: result.data?.id ?? null });
  } catch (err) {
    console.error("broadcasts/send error:", err);
    return NextResponse.json({ error: "Failed to send broadcast" }, { status: 500 });
  }
}

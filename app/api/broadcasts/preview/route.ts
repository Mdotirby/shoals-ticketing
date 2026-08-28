// POST /api/broadcasts/preview — renders a trigger with real data but never
// sends anything. Thin wrapper around the already-built standalone-emails/lib
// mappers + templates, reusing the exact render path sendXTest/Broadcast use.
import { NextResponse } from "next/server";
import { render } from "@react-email/components";
import { mapEventIdToEmailProps } from "@/standalone-emails/lib/mapEventRowToEmailProps";
import { mapUpcomingEventsToEmailProps } from "@/standalone-emails/lib/mapUpcomingEventsToEmailProps";
import { EventAnnouncementEmail } from "@/standalone-emails/templates/EventAnnouncementEmail";
import { UpcomingEventsEmail } from "@/standalone-emails/templates/UpcomingEventsEmail";
import { buildEventAnnouncementSubject } from "@/standalone-emails/lib/sendEventAnnouncement";
import { UPCOMING_EVENTS_SUBJECT } from "@/standalone-emails/lib/sendUpcomingEventsEmail";
import { TRIGGERS } from "@/standalone-emails/lib/triggers";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { trigger, eventId, limit, reminderStage, customMessage, eventIds } = body;

    if (trigger === TRIGGERS.NEW_EVENT_ANNOUNCEMENT) {
      if (!eventId) return NextResponse.json({ error: "eventId is required" }, { status: 400 });
      const props = await mapEventIdToEmailProps(eventId, { reminderStage: reminderStage || undefined, customMessage: customMessage || undefined });
      const html = await render(EventAnnouncementEmail(props));
      return NextResponse.json({ html, subject: buildEventAnnouncementSubject(props) });
    }

    if (trigger === TRIGGERS.UPCOMING_EVENTS_DIGEST) {
      const props = await mapUpcomingEventsToEmailProps(limit && limit > 0 ? limit : 3, { eventIds: Array.isArray(eventIds) && eventIds.length > 0 ? eventIds : undefined });
      const html = await render(UpcomingEventsEmail(props));
      return NextResponse.json({ html, subject: UPCOMING_EVENTS_SUBJECT });
    }

    return NextResponse.json({ error: `Unknown or unbuilt trigger: ${trigger}` }, { status: 400 });
  } catch (err) {
    console.error("broadcasts/preview error:", err);
    return NextResponse.json({ error: "Failed to render preview" }, { status: 500 });
  }
}

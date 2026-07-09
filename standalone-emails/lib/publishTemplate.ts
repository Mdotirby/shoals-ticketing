// Publishes the checked-in React Email component to Resend as a named,
// versioned Template — a dashboard-visible REFERENCE MIRROR only. Never
// edit the template inside Resend's UI: sends always re-render fresh HTML
// from this component with real event data (see sendEventAnnouncement.ts),
// not from Resend's stored copy, so a dashboard edit would silently have
// no effect and then get overwritten next time this runs. Re-run this
// function every time EventAnnouncementEmail.tsx changes so the mirror
// doesn't drift from what actually gets sent.
import { render } from "@react-email/components";
import { getResendClient } from "./resendClient";
import { TRIGGERS, TRIGGER_TEMPLATE_ALIAS } from "./triggers";
import { EventAnnouncementEmail } from "../templates/EventAnnouncementEmail";
import { UpcomingEventsEmail } from "../templates/UpcomingEventsEmail";

const FROM = "West 72 Entertainment <events@west72ent.com>";

const ANNOUNCEMENT_PREVIEW_PROPS = {
  eventName: "Sample Show",
  eventDate: "Saturday, October 24",
  eventTime: "9:00 PM",
  venueName: "Sample Venue",
  heroImageUrl: "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=1200&h=630&fit=crop",
  headlinerName: "Headliner Name",
  supportingActs: ["Support Act One", "Support Act Two"],
  ticketUrl: "https://west72ent.com/e/sample",
  ticketPrice: "$25",
  sponsorLogos: [],
  previewText: "Sample Show — Saturday, October 24 at Sample Venue",
};

const UPCOMING_EVENTS_PREVIEW_PROPS = {
  events: [
    {
      id: "1",
      eventName: "Sample Show One",
      eventDate: "July 10",
      venueName: "Sample Venue",
      ticketPrice: "$10",
      heroImageUrl: "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=1200&h=1500&fit=crop",
      ticketUrl: "https://west72ent.com/events/1",
    },
    {
      id: "2",
      eventName: "Sample Show Two",
      eventDate: "August 4",
      venueName: "Sample Venue",
      ticketPrice: "$15",
      heroImageUrl: "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=1200&h=1500&fit=crop",
      ticketUrl: "https://west72ent.com/events/2",
    },
  ],
  previewText: "Coming up: Sample Show One, Sample Show Two",
};

// Pre-rendered to html ourselves rather than passing `react` to Resend — the
// installed resend SDK (6.9.2) internally destructures `renderAsync` from
// @react-email/render, but that package renamed it to `render` in v2.x, so
// the SDK's own react->html path throws. html-only sidesteps it.
async function upsertTemplate(opts: { alias: string; name: string; html: string; subject: string }) {
  const resend = getResendClient();
  const existing = await resend.templates.get(opts.alias);

  if (existing.error) {
    const chainable = resend.templates.create({
      name: opts.name,
      alias: opts.alias,
      html: opts.html,
      subject: opts.subject,
      from: FROM,
    });
    await chainable.publish();
    return chainable;
  }

  const updated = await resend.templates.update(opts.alias, {
    html: opts.html,
    subject: opts.subject,
    from: FROM,
  });
  await resend.templates.publish(opts.alias);
  return updated;
}

export async function publishEventAnnouncementTemplate() {
  const html = await render(EventAnnouncementEmail(ANNOUNCEMENT_PREVIEW_PROPS));
  return upsertTemplate({
    alias: TRIGGER_TEMPLATE_ALIAS[TRIGGERS.NEW_EVENT_ANNOUNCEMENT],
    name: "New Event Announcement",
    html,
    subject: "{{eventName}} — {{eventDate}}",
  });
}

export async function publishUpcomingEventsTemplate() {
  const html = await render(UpcomingEventsEmail(UPCOMING_EVENTS_PREVIEW_PROPS));
  return upsertTemplate({
    alias: TRIGGER_TEMPLATE_ALIAS[TRIGGERS.UPCOMING_EVENTS_DIGEST],
    name: "Upcoming Events Digest",
    html,
    subject: "Check Out What's On at West 72",
  });
}

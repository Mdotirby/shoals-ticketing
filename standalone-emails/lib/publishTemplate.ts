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

const PREVIEW_PROPS = {
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

export async function publishEventAnnouncementTemplate() {
  const resend = getResendClient();
  const alias = TRIGGER_TEMPLATE_ALIAS[TRIGGERS.NEW_EVENT_ANNOUNCEMENT];

  // Pre-rendered to html ourselves rather than passing `react` to Resend —
  // the installed resend SDK (6.9.2) internally destructures `renderAsync`
  // from @react-email/render, but that package renamed it to `render` in
  // v2.x, so the SDK's own react->html path throws. html-only sidesteps it.
  const html = await render(EventAnnouncementEmail(PREVIEW_PROPS));
  const existing = await resend.templates.get(alias);

  if (existing.error) {
    const chainable = resend.templates.create({
      name: "New Event Announcement",
      alias,
      html,
      subject: "{{eventName}} — {{eventDate}}",
      from: "West 72 Entertainment <events@west72ent.com>",
    });
    await chainable.publish();
    return chainable;
  }

  const updated = await resend.templates.update(alias, {
    html,
    subject: "{{eventName}} — {{eventDate}}",
    from: "West 72 Entertainment <events@west72ent.com>",
  });
  await resend.templates.publish(alias);
  return updated;
}

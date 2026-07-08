// Always renders locally via the checked-in React component rather than
// leaning on Resend's own {{variable}} substitution — that substitution
// only handles flat strings/numbers, and this design has variable-length
// lineup/sponsor sections. Rendering here is the single source of truth
// for what actually gets sent; publishTemplate.ts's Resend Template is a
// dashboard record, not what's used at send time.
import { render } from "@react-email/components";
import { createAdminClient } from "@/lib/supabase-server";
import { getResendClient } from "./resendClient";
import { mapEventIdToEmailProps } from "./mapEventRowToEmailProps";
import { EventAnnouncementEmail, getAnnouncementStatusLabel } from "../templates/EventAnnouncementEmail";
import { TRIGGERS, TRIGGER_TEMPLATE_ALIAS } from "./triggers";

const FROM = "West 72 Entertainment <events@west72ent.com>";

function buildSubject(props: Awaited<ReturnType<typeof mapEventIdToEmailProps>>): string {
  return `${getAnnouncementStatusLabel(props.onSaleState)} - ${props.eventName}, ${props.eventDate}`;
}

/** Single-recipient preview send — always do this before blasting a segment. */
export async function sendEventAnnouncementTest(eventId: string, to: string) {
  const resend = getResendClient();
  const props = await mapEventIdToEmailProps(eventId);
  const html = await render(EventAnnouncementEmail(props));

  return resend.emails.send({
    from: FROM,
    to,
    subject: buildSubject(props),
    html,
  });
}

/** Sends to every contact in the given Resend segment. */
export async function sendEventAnnouncementBroadcast(eventId: string, segmentId: string) {
  const resend = getResendClient();
  const supabase = createAdminClient();

  const props = await mapEventIdToEmailProps(eventId);
  const html = await render(EventAnnouncementEmail(props));

  const result = await resend.broadcasts.create({
    segmentId,
    from: FROM,
    subject: buildSubject(props),
    html,
    send: true,
  });

  // recipient_email/campaign_id intentionally left null — this table's
  // original shape (marketing-migration.sql) is a per-recipient log tied to
  // email_campaigns; this is a per-broadcast summary row instead.
  await supabase.from("email_sends").insert({
    trigger_type: TRIGGERS.NEW_EVENT_ANNOUNCEMENT,
    event_id: eventId,
    resend_message_id: result.data?.id ?? null,
    resend_segment_id: segmentId,
    sent_at: new Date().toISOString(),
  });

  return result;
}

// Kept for reference — which template alias this trigger corresponds to
// in the Resend dashboard (see publishTemplate.ts).
export const EVENT_ANNOUNCEMENT_TEMPLATE_ALIAS =
  TRIGGER_TEMPLATE_ALIAS[TRIGGERS.NEW_EVENT_ANNOUNCEMENT];

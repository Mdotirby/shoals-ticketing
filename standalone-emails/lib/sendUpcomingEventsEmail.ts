// Same rendering approach as sendEventAnnouncement.ts — always renders
// locally from the checked-in component with real data, never relies on
// Resend's own {{variable}} substitution (can't express a variable-length
// event list anyway).
import { randomUUID } from "crypto";
import { render } from "@react-email/components";
import { createAdminClient } from "@/lib/supabase-server";
import { getResendClient } from "./resendClient";
import { mapUpcomingEventsToEmailProps } from "./mapUpcomingEventsToEmailProps";
import { UpcomingEventsEmail } from "../templates/UpcomingEventsEmail";
import { TRIGGERS } from "./triggers";

const FROM = "West 72 Entertainment <events@west72ent.com>";
export const UPCOMING_EVENTS_SUBJECT = "Check Out What's On at West 72";
const SUBJECT = UPCOMING_EVENTS_SUBJECT;

/** Single-recipient preview send — always do this before blasting a segment. */
export async function sendUpcomingEventsTest(limit: number, to: string, eventIds?: string[]) {
  const resend = getResendClient();
  const props = await mapUpcomingEventsToEmailProps(limit, { eventIds });
  const html = await render(UpcomingEventsEmail(props));

  return resend.emails.send({
    from: FROM,
    to,
    subject: SUBJECT,
    html,
  });
}

/** Sends to every contact in the given Resend segment. */
export async function sendUpcomingEventsBroadcast(limit: number, segmentId: string, eventIds?: string[]) {
  const resend = getResendClient();
  const supabase = createAdminClient();

  const sendId = randomUUID();
  const props = await mapUpcomingEventsToEmailProps(limit, { utmCampaign: `broadcast:${sendId}`, eventIds });
  const html = await render(UpcomingEventsEmail(props));

  const result = await resend.broadcasts.create({
    segmentId,
    from: FROM,
    subject: SUBJECT,
    html,
    send: true,
  });

  await supabase.from("email_sends").insert({
    id: sendId,
    trigger_type: TRIGGERS.UPCOMING_EVENTS_DIGEST,
    resend_message_id: result.data?.id ?? null,
    resend_segment_id: segmentId,
    sent_at: new Date().toISOString(),
  });

  return result;
}

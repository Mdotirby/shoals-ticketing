// One-way sync: our newsletter_subscribers table -> a Resend Segment.
// Resend owns unsubscribe/bounce/complaint suppression from here on;
// we only ever add contacts, never delete (unsubscribes flow through
// Resend's own suppression, not by removing rows on our side).
import { createAdminClient } from "@/lib/supabase-server";
import { getResendClient } from "./resendClient";

type SubscriberRow = {
  email: string;
  first_name: string;
  last_name: string;
};

export async function syncNewsletterSubscribersToSegment(segmentId: string) {
  const supabase = createAdminClient();
  const resend = getResendClient();

  const { data: subscribers, error } = await supabase
    .from("newsletter_subscribers")
    .select("email, first_name, last_name")
    .is("unsubscribed_at", null)
    .returns<SubscriberRow[]>();

  if (error) throw new Error(`syncNewsletterSubscribersToSegment: ${error.message}`);

  let created = 0;
  let updated = 0;

  for (const sub of subscribers ?? []) {
    const createResult = await resend.contacts.create({
      email: sub.email,
      firstName: sub.first_name,
      lastName: sub.last_name,
      segments: [{ id: segmentId }],
    });

    if (!createResult.error) {
      created++;
      continue;
    }

    // Contact already exists — update details, then ensure segment membership.
    await resend.contacts.update({
      email: sub.email,
      firstName: sub.first_name,
      lastName: sub.last_name,
    });
    await resend.contacts.segments.add({ email: sub.email, segmentId });
    updated++;
  }

  return { created, updated, total: subscribers?.length ?? 0 };
}

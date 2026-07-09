// Resolves the Resend Segment ID that broadcast sends and audience syncs
// target. Newsletter-only audience for now (no dynamic segmentation) — an
// env var is the simplest correct source of truth for a value that's
// operationally a deploy-time constant, not something that changes per-send.
// The auto-create fallback exists purely so a missing env var never hard-
// blocks a send; once logged, pin RESEND_NEWSLETTER_SEGMENT_ID to skip the
// list/create round-trip on every call.
import { getResendClient } from "./resendClient";

const SEGMENT_NAME = "Newsletter";

export async function getNewsletterSegmentId(): Promise<string> {
  const fromEnv = process.env.RESEND_NEWSLETTER_SEGMENT_ID;
  if (fromEnv) return fromEnv;

  const resend = getResendClient();
  const existing = await resend.segments.list();
  const found = existing.data?.data?.find((s) => s.name === SEGMENT_NAME);
  if (found) return found.id;

  const created = await resend.segments.create({ name: SEGMENT_NAME });
  if (created.error || !created.data?.id) {
    throw new Error(`getNewsletterSegmentId: failed to create segment — ${created.error?.message}`);
  }

  console.warn(
    `[broadcasts] No RESEND_NEWSLETTER_SEGMENT_ID set — created segment ${created.data.id}. ` +
    `Set RESEND_NEWSLETTER_SEGMENT_ID=${created.data.id} in env vars to pin it.`,
  );
  return created.data.id;
}

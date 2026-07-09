// POST /api/broadcasts/audience/sync — pushes newsletter_subscribers into
// the Resend Newsletter segment. Thin wrapper around the already-built
// syncNewsletterSubscribersToSegment.
import { NextResponse } from "next/server";
import { syncNewsletterSubscribersToSegment } from "@/standalone-emails/lib/contactSync";
import { getNewsletterSegmentId } from "@/standalone-emails/lib/getNewsletterSegmentId";

export async function POST() {
  try {
    const segmentId = await getNewsletterSegmentId();
    const result = await syncNewsletterSubscribersToSegment(segmentId);
    return NextResponse.json(result);
  } catch (err) {
    console.error("broadcasts/audience/sync error:", err);
    return NextResponse.json({ error: "Failed to sync audience" }, { status: 500 });
  }
}

// GET /api/broadcasts/audience — current newsletter audience size, used to
// populate the confirm() dialog before a real broadcast send.
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-server";
import { getNewsletterSegmentId } from "@/standalone-emails/lib/getNewsletterSegmentId";

export async function GET() {
  try {
    const admin = createAdminClient();

    const { count } = await admin
      .from("newsletter_subscribers")
      .select("*", { count: "exact", head: true })
      .is("unsubscribed_at", null);

    const segmentId = await getNewsletterSegmentId();

    return NextResponse.json({ segmentId, subscriberCount: count ?? 0 });
  } catch (err) {
    console.error("broadcasts/audience error:", err);
    return NextResponse.json({ error: "Failed to load audience" }, { status: 500 });
  }
}

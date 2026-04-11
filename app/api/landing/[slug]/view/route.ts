import { createAdminClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";

/**
 * POST /api/landing/[eventId]/view — Record a landing page view.
 *
 * Tracks the view in event_views with source = 'landing_page'.
 * If a tracking ref is provided, also records a 'view' event in
 * trackable_link_events for attribution analytics.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug: eventId } = await params;
    const admin = createAdminClient();
    const body = await request.json().catch(() => ({}));

    // 1. Record the landing page view in event_views
    await admin.from("event_views").insert({
      event_id: eventId,
      session_id: body.session_id || null,
      purchased: false,
      referrer_url: body.referrer_url || null,
      utm_source: body.utm_source || "landing_page",
      utm_medium: body.utm_medium || null,
      utm_campaign: body.utm_campaign || null,
    });

    // 2. If there's a tracking ref, record a 'view' event for the trackable link
    if (body.ref) {
      const { data: link } = await admin
        .from("trackable_links")
        .select("id")
        .eq("slug", body.ref)
        .eq("is_active", true)
        .single();

      if (link) {
        const headers = new Headers(request.headers);
        const ip_address =
          headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
          headers.get("x-real-ip") ||
          null;
        const user_agent = headers.get("user-agent") || null;

        await admin.from("trackable_link_events").insert({
          link_id: link.id,
          event_type: "view",
          ip_address,
          user_agent,
          referrer: body.referrer_url || null,
        });
      }
    }

    return NextResponse.json({ tracked: true });
  } catch {
    // Silently succeed — tracking should never block UX
    return NextResponse.json({ tracked: false });
  }
}

import { createAdminClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";

// GET: public redirect endpoint — tracks click and redirects to destination
export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const admin = createAdminClient();
    const origin = new URL(request.url).origin;

    // Look up the trackable link by slug
    const { data: link, error } = await admin
      .from("trackable_links")
      .select("*")
      .eq("slug", slug)
      .eq("is_active", true)
      .single();

    if (error || !link) {
      return NextResponse.redirect(new URL("/", origin));
    }

    // Extract tracking info from headers
    const headers = new Headers(request.headers);
    const ip_address =
      headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      headers.get("x-real-ip") ||
      null;
    const user_agent = headers.get("user-agent") || null;
    const referrer = headers.get("referer") || null;

    // Record the click event
    await admin.from("trackable_link_events").insert({
      link_id: link.id,
      event_type: "click",
      ip_address,
      user_agent,
      referrer,
    });

    // Increment denormalized click counter
    await admin
      .from("trackable_links")
      .update({ clicks: (link.clicks || 0) + 1 })
      .eq("id", link.id);

    // 302 redirect to the destination URL
    return NextResponse.redirect(new URL(link.destination_url), 302);
  } catch {
    // On any error, redirect to home
    const origin = new URL(request.url).origin;
    return NextResponse.redirect(new URL("/", origin));
  }
}

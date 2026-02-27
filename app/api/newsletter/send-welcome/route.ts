import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { buildWelcomeEmailHtml } from "../route";

const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || "VenueCore <onboarding@resend.dev>";

/**
 * POST /api/newsletter/send-welcome
 * Send (or re-send) the FWB welcome email to all active subscribers.
 * Requires owner-level auth token in the Authorization header.
 */
export async function POST(req: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const resendKey = process.env.RESEND_API_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }
    if (!resendKey) {
      return NextResponse.json({ error: "RESEND_API_KEY not configured" }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Auth check — only owners can trigger bulk sends
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.replace("Bearer ", "");
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: adminUser } = await supabase
      .from("admin_users")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!adminUser || !["owner", "venue_admin"].includes(adminUser.role)) {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
    }

    // Optional: filter by venue_id from request body
    const body = await req.json().catch(() => ({}));
    const venueId = body.venue_id || null;

    // Fetch all active subscribers
    let query = supabase
      .from("newsletter_subscribers")
      .select("id, email, first_name")
      .is("unsubscribed_at", null);

    if (venueId) {
      query = query.eq("venue_id", venueId);
    }

    const { data: subscribers, error: fetchError } = await query;

    if (fetchError) {
      console.error("Failed to fetch subscribers:", fetchError);
      return NextResponse.json({ error: "Failed to fetch subscribers" }, { status: 500 });
    }

    if (!subscribers || subscribers.length === 0) {
      return NextResponse.json({ error: "No active subscribers found" }, { status: 404 });
    }

    // Send welcome email to each subscriber
    let sentCount = 0;
    let failedCount = 0;
    const errors: string[] = [];

    for (const sub of subscribers) {
      const firstName = sub.first_name || "there";
      const html = buildWelcomeEmailHtml(firstName);

      try {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${resendKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: FROM_EMAIL,
            to: sub.email,
            subject: "Welcome to Friends with Benefits!",
            html,
          }),
        });

        if (res.ok) {
          sentCount++;
        } else {
          const errText = await res.text();
          console.error(`Failed to send to ${sub.email}:`, errText);
          errors.push(`${sub.email}: ${errText}`);
          failedCount++;
        }
      } catch (err) {
        console.error(`Error sending to ${sub.email}:`, err);
        errors.push(`${sub.email}: ${err instanceof Error ? err.message : "Unknown error"}`);
        failedCount++;
      }

      // Rate limit: ~10 emails/second to stay within Resend limits
      await new Promise((r) => setTimeout(r, 100));
    }

    return NextResponse.json({
      total: subscribers.length,
      sent: sentCount,
      failed: failedCount,
      errors: errors.length > 0 ? errors.slice(0, 10) : undefined,
    });
  } catch (err) {
    console.error("Bulk welcome send error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

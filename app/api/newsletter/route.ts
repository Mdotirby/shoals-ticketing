import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || "VenueCore <onboarding@resend.dev>";
const NOTIFY_EMAIL = "Matt.irby@west72ent.com";

/** Build the FWB welcome email HTML */
export function buildWelcomeEmailHtml(firstName: string): string {
  return `
    <div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #0b0d1d; color: #ffffff; padding: 40px 32px; border-radius: 12px;">
      <div style="text-align: center; margin-bottom: 32px;">
        <img src="https://venuecore.live/VenueCore_VenueCore-FullLogo.png" alt="VenueCore" width="120" style="margin-bottom: 16px;" />
      </div>
      <h1 style="font-size: 28px; color: #d0c290; text-align: center; margin: 0 0 8px;">Welcome, ${firstName}!</h1>
      <p style="text-align: center; color: rgba(255,255,255,0.5); font-size: 14px; margin: 0 0 32px;">You're officially a Friend with Benefits.</p>
      
      <div style="background: rgba(208,194,144,0.08); border: 1px solid rgba(208,194,144,0.15); border-radius: 10px; padding: 24px; margin-bottom: 24px;">
        <h2 style="font-size: 18px; color: #d0c290; margin: 0 0 12px;">Here's what you get:</h2>
        <ul style="list-style: none; padding: 0; margin: 0;">
          <li style="padding: 8px 0; color: rgba(255,255,255,0.7); font-size: 14px; border-bottom: 1px solid rgba(255,255,255,0.06);">&#9889; <strong style="color: #fff;">Presale Access</strong> — Get tickets before they go public</li>
          <li style="padding: 8px 0; color: rgba(255,255,255,0.7); font-size: 14px; border-bottom: 1px solid rgba(255,255,255,0.06);">&#127381; <strong style="color: #fff;">Exclusive Offers</strong> — Special deals just for subscribers</li>
          <li style="padding: 8px 0; color: rgba(255,255,255,0.7); font-size: 14px; border-bottom: 1px solid rgba(255,255,255,0.06);">&#128240; <strong style="color: #fff;">Breaking News</strong> — Be the first to know about new shows</li>
          <li style="padding: 8px 0; color: rgba(255,255,255,0.7); font-size: 14px;">&#128276; <strong style="color: #fff;">Early Announcements</strong> — Artist lineups and venue updates</li>
        </ul>
      </div>

      <div style="text-align: center; margin-bottom: 32px;">
        <a href="https://venuecore.live/events" style="display: inline-block; background: linear-gradient(135deg, #d0c290, #b8a66e); color: #0b0d1d; font-weight: 700; font-size: 14px; padding: 14px 32px; border-radius: 8px; text-decoration: none;">Browse Upcoming Events</a>
      </div>

      <hr style="border: none; border-top: 1px solid rgba(255,255,255,0.06); margin: 24px 0;" />
      <p style="text-align: center; font-size: 11px; color: rgba(255,255,255,0.25); margin: 0;">
        You're receiving this because you signed up at VenueCore.<br />
        <a href="https://venuecore.live/privacy" style="color: rgba(208,194,144,0.6); text-decoration: underline;">Privacy Policy</a>
      </p>
    </div>
  `;
}

/** Send an email via Resend REST API with retry on rate limit */
async function sendViaResend(to: string, subject: string, html: string, retries = 3): Promise<{ success: boolean; error?: string }> {
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    console.warn("RESEND_API_KEY not set — skipping email to", to);
    return { success: false, error: "RESEND_API_KEY not set" };
  }

  for (let attempt = 0; attempt < retries; attempt++) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: FROM_EMAIL, to, subject, html }),
    });

    if (res.ok) {
      const data = await res.json();
      console.log(`Email sent to ${to}, Resend ID: ${data.id}`);
      return { success: true };
    }

    const errText = await res.text();

    // Retry on rate limit (429)
    if (res.status === 429 && attempt < retries - 1) {
      const delay = (attempt + 1) * 1000; // 1s, 2s, 3s backoff
      console.warn(`Rate limited sending to ${to}, retrying in ${delay}ms (attempt ${attempt + 1}/${retries})`);
      await new Promise((r) => setTimeout(r, delay));
      continue;
    }

    console.error(`Resend email failed (${res.status}) to ${to}:`, errText);
    return { success: false, error: errText };
  }

  return { success: false, error: "Max retries exceeded" };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { firstName, lastName, email, source, venueSlug } = body;

    if (!firstName?.trim() || !lastName?.trim() || !email?.trim()) {
      return NextResponse.json({ error: "All fields are required." }, { status: 400 });
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json({ error: "Please enter a valid email address." }, { status: 400 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      console.error("Missing Supabase env vars for newsletter signup");
      return NextResponse.json({ error: "Server configuration error." }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Resolve venue_id from slug if provided
    let venueId: string | null = null;
    if (venueSlug && venueSlug !== "default") {
      const { data: venue } = await supabase
        .from("venues")
        .select("id")
        .eq("slug", venueSlug)
        .maybeSingle();
      if (venue) venueId = venue.id;
    }

    // Check if email already exists
    const { data: existing } = await supabase
      .from("newsletter_subscribers")
      .select("id")
      .eq("email", email.trim().toLowerCase())
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ error: "This email is already subscribed." }, { status: 409 });
    }

    const insertData: Record<string, unknown> = {
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      email: email.trim().toLowerCase(),
      subscribed_at: new Date().toISOString(),
    };
    if (source) insertData.source = source;
    if (venueId) insertData.venue_id = venueId;

    const { error } = await supabase.from("newsletter_subscribers").insert(insertData);

    if (error) {
      console.error("Newsletter insert error:", error);
      return NextResponse.json({ error: "Failed to subscribe. Please try again." }, { status: 500 });
    }

    // ── Send welcome email (awaited, not fire-and-forget) ──
    const subscriberName = `${firstName.trim()} ${lastName.trim()}`;

    const welcomeResult = await sendViaResend(
      email.trim().toLowerCase(),
      "Welcome to Friends with Benefits!",
      buildWelcomeEmailHtml(firstName.trim())
    );

    if (!welcomeResult.success) {
      console.error("Welcome email failed for", email, welcomeResult.error);
    }

    // Admin notification (fire-and-forget is fine for this)
    sendViaResend(
      NOTIFY_EMAIL,
      `[Newsletter] New Signup: ${subscriberName}`,
      `
        <div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
          <h2 style="color: #333; margin: 0 0 16px;">New Newsletter Subscriber</h2>
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 10px 12px; font-weight: bold; color: #555; border-bottom: 1px solid #eee;">Name</td>
              <td style="padding: 10px 12px; border-bottom: 1px solid #eee;">${subscriberName}</td>
            </tr>
            <tr>
              <td style="padding: 10px 12px; font-weight: bold; color: #555; border-bottom: 1px solid #eee;">Email</td>
              <td style="padding: 10px 12px; border-bottom: 1px solid #eee;"><a href="mailto:${email.trim().toLowerCase()}">${email.trim().toLowerCase()}</a></td>
            </tr>
            <tr>
              <td style="padding: 10px 12px; font-weight: bold; color: #555; border-bottom: 1px solid #eee;">Source</td>
              <td style="padding: 10px 12px; border-bottom: 1px solid #eee;">${source || "homepage"}${venueSlug ? ` (${venueSlug})` : ""}</td>
            </tr>
            <tr>
              <td style="padding: 10px 12px; font-weight: bold; color: #555; border-bottom: 1px solid #eee;">Signed Up</td>
              <td style="padding: 10px 12px; border-bottom: 1px solid #eee;">${new Date().toLocaleString("en-US", { timeZone: "America/Chicago" })}</td>
            </tr>
          </table>
        </div>
      `
    ).catch((err) => console.error("Admin notification email failed:", err));

    return NextResponse.json({ success: true, emailSent: welcomeResult.success });
  } catch (err) {
    console.error("Newsletter route error:", err);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}

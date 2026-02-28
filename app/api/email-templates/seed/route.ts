import { createAdminClient } from "@/lib/supabase-server";
import { NextRequest, NextResponse } from "next/server";

// POST /api/email-templates/seed?venue_id=xxx — Seed default templates for a venue
export async function POST(req: NextRequest) {
  const venueId = req.nextUrl.searchParams.get("venue_id") || null;
  const admin = createAdminClient();

  const templates = [
    {
      venue_id: venueId,
      name: "Friends With Benefits Welcome",
      subject: "Welcome to Friends with Benefits, {{first_name}}!",
      category: "welcome",
      is_system: true,
      body_html: `<div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #0b0d1d; color: #000000; padding: 40px 32px; border-radius: 12px;">
  <div style="text-align: center; margin-bottom: 32px;">
    <img src="https://venuecore.live/VenueCore_VenueCore-FullLogo.png" alt="VenueCore" width="120" style="margin-bottom: 16px;" />
  </div>
  <h1 style="font-size: 28px; color: #d0c290; text-align: center; margin: 0 0 8px;">Welcome, {{first_name}}!</h1>
  <p style="text-align: center; color: rgba(255,255,255,0.5); font-size: 14px; margin: 0 0 32px;">You're officially a part of the FWB Crew!.</p>
  
  <div style="background: rgba(208,194,144,0.08); border: 1px solid rgba(208,194,144,0.15); border-radius: 10px; padding: 24px; margin-bottom: 24px;">
    <h2 style="font-size: 18px; color: #d0c290; margin: 0 0 12px;">Whats included:</h2>
    <ul style="list-style: none; padding: 0; margin: 0;">
      <li style="padding: 8px 0; color: rgba(255,255,255,0.7); font-size: 14px; border-bottom: 1px solid rgba(255,255,255,0.06);">⚡ <strong style="color: #fff;">Presale Access</strong> — Get tickets before they go public</li>
      <li style="padding: 8px 0; color: rgba(255,255,255,0.7); font-size: 14px; border-bottom: 1px solid rgba(255,255,255,0.06);">🎁 <strong style="color: #fff;">Exclusive Offers</strong> — Special deals just for subscribers</li>
      <li style="padding: 8px 0; color: rgba(255,255,255,0.7); font-size: 14px; border-bottom: 1px solid rgba(255,255,255,0.06);">📰 <strong style="color: #fff;">Breaking News</strong> — Be the first to know about new shows</li>
      <li style="padding: 8px 0; color: rgba(255,255,255,0.7); font-size: 14px;">🔔 <strong style="color: #fff;">Early Announcements</strong> — Artist lineups and venue updates</li>
    </ul>
  </div>

  <div style="text-align: center; margin-bottom: 32px;">
    <a href="https://venuecore.live/events" style="display: inline-block; background: linear-gradient(135deg, #d0c290, #b8a66e); color: #0b0d1d; font-weight: 700; font-size: 14px; padding: 14px 32px; border-radius: 8px; text-decoration: none;">Browse Upcoming Events</a>
  </div>

  <hr style="border: none; border-top: 1px solid rgba(255,255,255,0.06); margin: 24px 0;" />
  <p style="text-align: center; font-size: 11px; color: rgba(255,255,255,0.25); margin: 0;">
    You're receiving this because you signed up for Friends with Benefits.<br />
    <a href="https://venuecore.live/privacy" style="color: rgba(208,194,144,0.6); text-decoration: underline;">Privacy Policy</a>
  </p>
</div>`,
    },
    {
      venue_id: venueId,
      name: "Post-Show Experience Survey",
      subject: "Hey {{first_name}}, how was the show?",
      category: "post_show_survey",
      is_system: true,
      body_html: `<div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #0b0d1d; color: #ffffff; padding: 40px 32px; border-radius: 12px;">
  <div style="text-align: center; margin-bottom: 32px;">
    <img src="https://venuecore.live/VenueCore_VenueCore-FullLogo.png" alt="VenueCore" width="100" style="margin-bottom: 12px;" />
  </div>

  <h1 style="font-size: 26px; color: #d0c290; text-align: center; margin: 0 0 8px;">How Was the Show, {{first_name}}?</h1>
  <p style="text-align: center; color: rgba(255,255,255,0.5); font-size: 14px; margin: 0 0 28px;">We'd love to hear your thoughts. It takes less than 60 seconds.</p>

  <div style="background: rgba(208,194,144,0.08); border: 1px solid rgba(208,194,144,0.15); border-radius: 10px; padding: 24px; margin-bottom: 24px; text-align: center;">
    <p style="color: rgba(255,255,255,0.6); font-size: 14px; margin: 0 0 8px;">Your feedback helps us bring you better shows.</p>
    <p style="color: rgba(255,255,255,0.4); font-size: 12px; margin: 0;">Just 3 quick questions — rate, feedback, done.</p>
  </div>

  <div style="text-align: center; margin-bottom: 32px;">
    <a href="https://venuecore.live/survey/{{event_id}}" style="display: inline-block; background: linear-gradient(135deg, #d0c290, #b8a66e); color: #0b0d1d; font-weight: 700; font-size: 14px; padding: 14px 36px; border-radius: 8px; text-decoration: none;">Take the Quick Survey</a>
  </div>

  <div style="background: rgba(255,255,255,0.03); border-radius: 8px; padding: 16px; margin-bottom: 24px;">
    <p style="color: rgba(255,255,255,0.4); font-size: 13px; margin: 0; text-align: center;">
      <strong style="color: rgba(255,255,255,0.6);">What you'll answer:</strong><br/>
      1. Rate your experience (1-5)<br/>
      2. Would you come back?<br/>
      3. Any feedback? (optional)
    </p>
  </div>

  <p style="text-align: center; color: rgba(255,255,255,0.3); font-size: 12px; margin: 0 0 8px;">
    Thanks for supporting live music, {{first_name}}. See you at the next one!
  </p>

  <hr style="border: none; border-top: 1px solid rgba(255,255,255,0.06); margin: 24px 0;" />
  <p style="text-align: center; font-size: 11px; color: rgba(255,255,255,0.25); margin: 0;">
    You're receiving this because you purchased tickets through VenueCore.<br />
    <a href="https://venuecore.live/privacy" style="color: rgba(208,194,144,0.6); text-decoration: underline;">Privacy Policy</a>
  </p>
</div>`,
    },
    {
      venue_id: venueId,
      name: "Event Announcement",
      subject: "{{first_name}}, a new show just dropped!",
      category: "event_announcement",
      is_system: true,
      body_html: `<div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #0b0d1d; color: #ffffff; padding: 40px 32px; border-radius: 12px;">
  <div style="text-align: center; margin-bottom: 32px;">
    <img src="https://venuecore.live/VenueCore_VenueCore-FullLogo.png" alt="VenueCore" width="100" style="margin-bottom: 12px;" />
  </div>

  <h1 style="font-size: 26px; color: #d0c290; text-align: center; margin: 0 0 8px;">New Show Alert!</h1>
  <p style="text-align: center; color: rgba(255,255,255,0.5); font-size: 14px; margin: 0 0 28px;">Hey {{first_name}}, we've got something special for you.</p>

  <div style="background: rgba(208,194,144,0.08); border: 1px solid rgba(208,194,144,0.15); border-radius: 12px; padding: 28px; margin-bottom: 24px; text-align: center;">
    <h2 style="font-size: 22px; color: #d0c290; margin: 0 0 8px;">{{event_title}}</h2>
    <p style="color: rgba(255,255,255,0.6); font-size: 15px; margin: 0 0 4px;">{{event_date}}</p>
    <p style="color: rgba(255,255,255,0.4); font-size: 13px; margin: 0;">{{venue_name}}</p>
  </div>

  <p style="text-align: center; color: rgba(255,255,255,0.6); font-size: 14px; margin: 0 0 24px; line-height: 1.6;">
    As a Friend with Benefits, you get <strong style="color: #d0c290;">early access</strong> before tickets go on sale to the public. Don't miss this one.
  </p>

  <div style="text-align: center; margin-bottom: 32px;">
    <a href="https://venuecore.live/events/{{event_id}}" style="display: inline-block; background: linear-gradient(135deg, #d0c290, #b8a66e); color: #0b0d1d; font-weight: 700; font-size: 14px; padding: 14px 36px; border-radius: 8px; text-decoration: none;">Get Tickets Now</a>
  </div>

  <p style="text-align: center; color: rgba(255,255,255,0.3); font-size: 12px; margin: 0 0 8px;">
    See you there, {{first_name}}!
  </p>

  <hr style="border: none; border-top: 1px solid rgba(255,255,255,0.06); margin: 24px 0;" />
  <p style="text-align: center; font-size: 11px; color: rgba(255,255,255,0.25); margin: 0;">
    You're receiving this as a Friends with Benefits member.<br />
    <a href="https://venuecore.live/privacy" style="color: rgba(208,194,144,0.6); text-decoration: underline;">Privacy Policy</a> · <a href="https://venuecore.live/do-not-sell" style="color: rgba(208,194,144,0.6); text-decoration: underline;">Unsubscribe</a>
  </p>
</div>`,
    },
    {
      venue_id: venueId,
      name: "Know Before the Show",
      subject: "Hey {{first_name}}, here's what you need to know!",
      category: "know_before_show",
      is_system: true,
      body_html: `<div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #0b0d1d; color: #ffffff; padding: 40px 32px; border-radius: 12px;">
  <div style="text-align: center; margin-bottom: 32px;">
    <img src="https://venuecore.live/VenueCore_VenueCore-FullLogo.png" alt="VenueCore" width="100" style="margin-bottom: 12px;" />
  </div>

  <h1 style="font-size: 26px; color: #d0c290; text-align: center; margin: 0 0 8px;">Know Before You Go</h1>
  <p style="text-align: center; color: rgba(255,255,255,0.5); font-size: 14px; margin: 0 0 28px;">Hey {{first_name}}, the show is almost here! Here's everything you need.</p>

  <div style="background: rgba(208,194,144,0.08); border: 1px solid rgba(208,194,144,0.15); border-radius: 10px; padding: 24px; margin-bottom: 16px;">
    <h3 style="color: #d0c290; font-size: 14px; margin: 0 0 8px; text-transform: uppercase; letter-spacing: 1px;">📍 Parking</h3>
    <p style="color: rgba(255,255,255,0.6); font-size: 13px; margin: 0; line-height: 1.5;">[Add parking information here — available lots, pricing, ride-share drop-off points]</p>
  </div>

  <div style="background: rgba(208,194,144,0.08); border: 1px solid rgba(208,194,144,0.15); border-radius: 10px; padding: 24px; margin-bottom: 16px;">
    <h3 style="color: #d0c290; font-size: 14px; margin: 0 0 8px; text-transform: uppercase; letter-spacing: 1px;">🎒 Bag Policy</h3>
    <p style="color: rgba(255,255,255,0.6); font-size: 13px; margin: 0; line-height: 1.5;">[Add bag policy — clear bags only, size restrictions, prohibited items]</p>
  </div>

  <div style="background: rgba(208,194,144,0.08); border: 1px solid rgba(208,194,144,0.15); border-radius: 10px; padding: 24px; margin-bottom: 16px;">
    <h3 style="color: #d0c290; font-size: 14px; margin: 0 0 8px; text-transform: uppercase; letter-spacing: 1px;">🚪 Doors & Set Times</h3>
    <p style="color: rgba(255,255,255,0.6); font-size: 13px; margin: 0; line-height: 1.5;">[Add doors open time, opener set time, headliner set time, curfew]</p>
  </div>

  <div style="background: rgba(208,194,144,0.08); border: 1px solid rgba(208,194,144,0.15); border-radius: 10px; padding: 24px; margin-bottom: 24px;">
    <h3 style="color: #d0c290; font-size: 14px; margin: 0 0 8px; text-transform: uppercase; letter-spacing: 1px;">📱 Your Ticket</h3>
    <p style="color: rgba(255,255,255,0.6); font-size: 13px; margin: 0; line-height: 1.5;">Have your QR code ready on your phone. Screenshots work too. Each ticket has a unique QR that can only be scanned once.</p>
  </div>

  <div style="text-align: center; margin-bottom: 32px;">
    <a href="https://venuecore.live/events/{{event_id}}" style="display: inline-block; background: linear-gradient(135deg, #d0c290, #b8a66e); color: #0b0d1d; font-weight: 700; font-size: 14px; padding: 14px 32px; border-radius: 8px; text-decoration: none;">View Event Details</a>
  </div>

  <p style="text-align: center; color: rgba(255,255,255,0.3); font-size: 12px;">See you soon, {{first_name}}!</p>

  <hr style="border: none; border-top: 1px solid rgba(255,255,255,0.06); margin: 24px 0;" />
  <p style="text-align: center; font-size: 11px; color: rgba(255,255,255,0.25); margin: 0;">
    You're receiving this because you purchased tickets through VenueCore.<br />
    <a href="https://venuecore.live/privacy" style="color: rgba(208,194,144,0.6); text-decoration: underline;">Privacy Policy</a>
  </p>
</div>`,
    },
    {
      venue_id: venueId,
      name: "We Hope You Enjoyed the Show",
      subject: "Thanks for coming, {{first_name}}!",
      category: "we_hope_you_enjoyed",
      is_system: true,
      body_html: `<div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #0b0d1d; color: #ffffff; padding: 40px 32px; border-radius: 12px;">
  <div style="text-align: center; margin-bottom: 32px;">
    <img src="https://venuecore.live/VenueCore_VenueCore-FullLogo.png" alt="VenueCore" width="100" style="margin-bottom: 12px;" />
  </div>

  <h1 style="font-size: 26px; color: #d0c290; text-align: center; margin: 0 0 8px;">Thanks for Coming!</h1>
  <p style="text-align: center; color: rgba(255,255,255,0.5); font-size: 14px; margin: 0 0 28px;">Hey {{first_name}}, we hope you had an incredible time.</p>

  <div style="background: rgba(208,194,144,0.08); border: 1px solid rgba(208,194,144,0.15); border-radius: 10px; padding: 24px; margin-bottom: 24px; text-align: center;">
    <p style="color: rgba(255,255,255,0.6); font-size: 15px; margin: 0 0 12px; line-height: 1.6;">
      We love putting on great shows and your support makes it all possible. Thank you for being part of the experience.
    </p>
    <p style="color: rgba(255,255,255,0.4); font-size: 13px; margin: 0;">
      Want to catch the next one? Check out what's coming up.
    </p>
  </div>

  <div style="text-align: center; margin-bottom: 24px;">
    <a href="https://venuecore.live/events" style="display: inline-block; background: linear-gradient(135deg, #d0c290, #b8a66e); color: #0b0d1d; font-weight: 700; font-size: 14px; padding: 14px 36px; border-radius: 8px; text-decoration: none;">See Upcoming Shows</a>
  </div>

  <div style="background: rgba(255,255,255,0.03); border-radius: 8px; padding: 16px; margin-bottom: 24px; text-align: center;">
    <p style="color: rgba(255,255,255,0.4); font-size: 13px; margin: 0;">
      <strong style="color: rgba(208,194,144,0.8);">Share the love!</strong> Tag us on social media and let us know about your experience. Your photos and stories mean the world to us.
    </p>
  </div>

  <p style="text-align: center; color: rgba(255,255,255,0.3); font-size: 12px;">Until next time, {{first_name}} 🤘</p>

  <hr style="border: none; border-top: 1px solid rgba(255,255,255,0.06); margin: 24px 0;" />
  <p style="text-align: center; font-size: 11px; color: rgba(255,255,255,0.25); margin: 0;">
    You're receiving this because you attended a show through VenueCore.<br />
    <a href="https://venuecore.live/privacy" style="color: rgba(208,194,144,0.6); text-decoration: underline;">Privacy Policy</a>
  </p>
</div>`,
    },
    {
      venue_id: venueId,
      name: "Last Chance Tickets",
      subject: "{{first_name}}, tickets are almost gone!",
      category: "last_chance",
      is_system: true,
      body_html: `<div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #0b0d1d; color: #ffffff; padding: 40px 32px; border-radius: 12px;">
  <div style="text-align: center; margin-bottom: 32px;">
    <img src="https://venuecore.live/VenueCore_VenueCore-FullLogo.png" alt="VenueCore" width="100" style="margin-bottom: 12px;" />
  </div>

  <h1 style="font-size: 26px; color: #d0c290; text-align: center; margin: 0 0 8px;">Last Call, {{first_name}}!</h1>
  <p style="text-align: center; color: rgba(255,255,255,0.5); font-size: 14px; margin: 0 0 28px;">Tickets are almost sold out — don't miss your chance.</p>

  <div style="background: rgba(208,194,144,0.08); border: 1px solid rgba(208,194,144,0.15); border-radius: 12px; padding: 28px; margin-bottom: 24px; text-align: center;">
    <h2 style="font-size: 22px; color: #d0c290; margin: 0 0 8px;">{{event_title}}</h2>
    <p style="color: rgba(255,255,255,0.6); font-size: 15px; margin: 0 0 4px;">{{event_date}}</p>
    <p style="color: rgba(255,255,255,0.4); font-size: 13px; margin: 0 0 16px;">{{venue_name}}</p>
    <div style="background: rgba(255,80,80,0.1); border: 1px solid rgba(255,80,80,0.2); border-radius: 8px; padding: 10px; display: inline-block;">
      <span style="color: rgba(255,80,80,0.9); font-weight: 700; font-size: 13px; text-transform: uppercase; letter-spacing: 1px;">⚠ Almost Sold Out</span>
    </div>
  </div>

  <div style="text-align: center; margin-bottom: 32px;">
    <a href="https://venuecore.live/events/{{event_id}}" style="display: inline-block; background: linear-gradient(135deg, #d0c290, #b8a66e); color: #0b0d1d; font-weight: 700; font-size: 15px; padding: 16px 40px; border-radius: 8px; text-decoration: none;">Grab Your Tickets</a>
  </div>

  <p style="text-align: center; color: rgba(255,255,255,0.3); font-size: 12px;">Don't wait, {{first_name}} — once they're gone, they're gone.</p>

  <hr style="border: none; border-top: 1px solid rgba(255,255,255,0.06); margin: 24px 0;" />
  <p style="text-align: center; font-size: 11px; color: rgba(255,255,255,0.25); margin: 0;">
    You're receiving this as a Friends with Benefits member.<br />
    <a href="https://venuecore.live/privacy" style="color: rgba(208,194,144,0.6); text-decoration: underline;">Privacy Policy</a> · <a href="https://venuecore.live/do-not-sell" style="color: rgba(208,194,144,0.6); text-decoration: underline;">Unsubscribe</a>
  </p>
</div>`,
    },
  ];

  // Check if templates already exist for this venue
  const { data: existing } = await admin
    .from("email_templates")
    .select("id")
    .eq("is_system", true)
    .eq("venue_id", venueId)
    .limit(1);

  if (existing && existing.length > 0) {
    return NextResponse.json({ message: "Templates already seeded", count: 0 });
  }

  const { data, error } = await admin
    .from("email_templates")
    .insert(templates)
    .select();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ message: "Templates seeded", count: data?.length ?? 0 });
}

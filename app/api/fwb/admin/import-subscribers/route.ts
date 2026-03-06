import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

/* ------------------------------------------------------------------ */
/*  GET — Preview: which subscribers are eligible for import           */
/* ------------------------------------------------------------------ */

export async function GET() {
  const supabase = createAdminClient();

  // 1. Get all newsletter subscribers
  let subscribers: Array<Record<string, unknown>> = [];
  try {
    const { data, error } = await supabase
      .from("newsletter_subscribers")
      .select("id,email,first_name,last_name,created_at");

    if (error) {
      if (
        error.message.includes("does not exist") ||
        error.code === "42P01"
      ) {
        return NextResponse.json({
          error: "newsletter_subscribers table does not exist",
          instructions:
            "Run the newsletter migration first to create the newsletter_subscribers table.",
        });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    subscribers = data || [];
  } catch {
    return NextResponse.json({
      error: "newsletter_subscribers table not accessible",
    });
  }

  // 2. Get existing FWB members by email
  let existingEmails = new Set<string>();
  try {
    const { data: fwbMembers } = await supabase
      .from("fwb_wallets")
      .select("email");

    existingEmails = new Set(
      ((fwbMembers || []) as Array<{ email: string }>).map((m) =>
        m.email?.toLowerCase()
      )
    );
  } catch {
    // fwb_wallets table may not exist — treat as zero existing
  }

  // 3. Partition: already in FWB vs eligible
  const eligible = subscribers.filter(
    (s) => !existingEmails.has((s.email as string)?.toLowerCase())
  );

  return NextResponse.json({
    total_subscribers: subscribers.length,
    already_in_fwb: subscribers.length - eligible.length,
    eligible_for_import: eligible.length,
    subscribers: eligible.map((s) => ({
      email: s.email,
      first_name: s.first_name || null,
      last_name: s.last_name || null,
      subscribed_at: s.created_at,
    })),
  });
}

/* ------------------------------------------------------------------ */
/*  POST — Execute import                                              */
/* ------------------------------------------------------------------ */

export async function POST(request: Request) {
  const supabase = createAdminClient();

  let dryRun = false;
  let welcomePoints = 50;

  try {
    const body = await request.json();
    if (body.dry_run === true) dryRun = true;
    if (typeof body.welcome_points === "number") {
      welcomePoints = body.welcome_points;
    }
  } catch {
    // No body or invalid JSON — use defaults
  }

  // 1. Get eligible subscribers (same logic as GET)
  let subscribers: Array<Record<string, unknown>> = [];
  try {
    const { data, error } = await supabase
      .from("newsletter_subscribers")
      .select("id,email,first_name,last_name");

    if (error) {
      if (
        error.message.includes("does not exist") ||
        error.code === "42P01"
      ) {
        return NextResponse.json({
          error: "newsletter_subscribers table does not exist",
        });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    subscribers = data || [];
  } catch {
    return NextResponse.json({
      error: "newsletter_subscribers table not accessible",
    });
  }

  // Get existing FWB members
  let existingEmails = new Set<string>();
  try {
    const { data: fwbMembers } = await supabase
      .from("fwb_wallets")
      .select("email");

    existingEmails = new Set(
      ((fwbMembers || []) as Array<{ email: string }>).map((m) =>
        m.email?.toLowerCase()
      )
    );
  } catch {
    // fwb_wallets may not exist
    if (!dryRun) {
      return NextResponse.json({
        error: "fwb_wallets table does not exist. Run the FWB migration first.",
      });
    }
  }

  const eligible = subscribers.filter(
    (s) => !existingEmails.has((s.email as string)?.toLowerCase())
  );

  // Dry run — just report what would happen
  if (dryRun) {
    return NextResponse.json({
      dry_run: true,
      would_import: eligible.length,
      would_skip: subscribers.length - eligible.length,
      welcome_points: welcomePoints,
      errors: [],
    });
  }

  // 2. Import each eligible subscriber
  let imported = 0;
  let skipped = subscribers.length - eligible.length;
  const errors: string[] = [];
  const importedSubscribers: Array<{ email: string; first_name: string | null }> = [];

  for (const sub of eligible) {
    const email = (sub.email as string)?.toLowerCase();
    if (!email) {
      skipped++;
      continue;
    }

    try {
      // Create FWB wallet
      const { data: newWallet, error: walletError } = await supabase
        .from("fwb_wallets")
        .insert({
          email,
          first_name: sub.first_name || null,
          last_name: sub.last_name || null,
          current_benefits_balance: welcomePoints,
          lifetime_benefits_earned: welcomePoints,
          current_tier: "casual_friend",
          current_streak_count: 0,
        })
        .select("id")
        .single();

      if (walletError) {
        // Might be a duplicate race condition
        if (walletError.message.includes("duplicate")) {
          skipped++;
          continue;
        }
        errors.push(`${email}: ${walletError.message}`);
        continue;
      }

      // Create welcome bonus transaction
      try {
        await supabase.from("fwb_transactions").insert({
          wallet_id: newWallet.id,
          transaction_type: "earn",
          amount: welcomePoints,
          description: "Welcome bonus — imported from newsletter",
          balance_after: welcomePoints,
          multiplier_applied: 1,
        });
      } catch {
        // Transaction logging is non-critical
      }

      imported++;
      importedSubscribers.push({
        email,
        first_name: (sub.first_name as string) || null,
      });
    } catch (err) {
      errors.push(
        `${email}: ${err instanceof Error ? err.message : "Unknown error"}`
      );
    }
  }

  // Send welcome emails to imported subscribers
  let emailsSent = 0;
  let emailsFailed = 0;
  if (importedSubscribers.length > 0 && process.env.RESEND_API_KEY) {
    for (const sub of importedSubscribers) {
      try {
        const firstName = sub.first_name || "there";
        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: "VenueCore <hello@venuecore.live>",
            to: sub.email,
            subject: "\uD83C\uDF89 Welcome to Friends with Benefits!",
            html: buildFwbWelcomeHtml(firstName, welcomePoints),
          }),
        });
        emailsSent++;
      } catch (e) {
        console.error(`Welcome email failed for ${sub.email}:`, e);
        emailsFailed++;
      }
      // 200ms delay between emails to avoid Resend rate limits
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  return NextResponse.json({
    imported,
    skipped,
    errors,
    welcome_points: welcomePoints,
    emails_sent: emailsSent,
    emails_failed: emailsFailed,
  });
}

/* ------------------------------------------------------------------ */
/*  FWB Welcome Email HTML Builder                                     */
/* ------------------------------------------------------------------ */

function buildFwbWelcomeHtml(firstName: string, points: number): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#0f0f0f;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:600px;margin:0 auto;background:#1a1a1a;border-radius:12px;overflow:hidden;border:1px solid rgba(208,194,144,0.15);">
    <!-- Header -->
    <div style="background:linear-gradient(135deg,#1a1a1a 0%,#2a2520 100%);padding:40px 32px 24px;text-align:center;">
      <div style="font-size:40px;margin-bottom:8px;">\uD83C\uDF89</div>
      <h1 style="margin:0;color:#d0c290;font-size:26px;font-weight:700;letter-spacing:-0.5px;">Welcome to Friends with Benefits</h1>
      <p style="margin:8px 0 0;color:rgba(255,255,255,0.5);font-size:14px;">VenueCore Loyalty Program</p>
    </div>

    <!-- Body -->
    <div style="padding:32px;">
      <p style="color:rgba(255,255,255,0.85);font-size:16px;line-height:1.6;margin:0 0 20px;">
        Hey ${firstName}! \uD83D\uDC4B
      </p>
      <p style="color:rgba(255,255,255,0.75);font-size:15px;line-height:1.6;margin:0 0 24px;">
        You've been enrolled in our <strong style="color:#d0c290;">Friends with Benefits</strong> loyalty program! We're thrilled to have you as part of our community.
      </p>

      <!-- Points Card -->
      <div style="background:rgba(208,194,144,0.08);border:1px solid rgba(208,194,144,0.2);border-radius:10px;padding:24px;text-align:center;margin-bottom:24px;">
        <div style="font-size:13px;color:rgba(255,255,255,0.5);text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">Your Welcome Balance</div>
        <div style="font-size:42px;font-weight:800;color:#d0c290;margin-bottom:4px;">${points}</div>
        <div style="font-size:14px;color:rgba(255,255,255,0.6);">points to get you started!</div>
        <div style="margin-top:12px;display:inline-block;background:rgba(208,194,144,0.15);border-radius:20px;padding:4px 16px;">
          <span style="font-size:12px;color:#d0c290;font-weight:600;">\u2B50 Tier: Casual Friend</span>
        </div>
      </div>

      <!-- Benefits -->
      <h2 style="color:rgba(255,255,255,0.9);font-size:18px;font-weight:600;margin:0 0 16px;">Your Benefits</h2>
      <div style="margin-bottom:24px;">
        <div style="display:flex;align-items:flex-start;margin-bottom:12px;">
          <span style="color:#d0c290;font-size:18px;margin-right:12px;line-height:1.4;">\uD83C\uDFAB</span>
          <div>
            <div style="color:rgba(255,255,255,0.85);font-size:14px;font-weight:600;">Early Access</div>
            <div style="color:rgba(255,255,255,0.5);font-size:13px;">Get first dibs on tickets before they go on sale to the public</div>
          </div>
        </div>
        <div style="display:flex;align-items:flex-start;margin-bottom:12px;">
          <span style="color:#d0c290;font-size:18px;margin-right:12px;line-height:1.4;">\uD83C\uDF81</span>
          <div>
            <div style="color:rgba(255,255,255,0.85);font-size:14px;font-weight:600;">Exclusive Offers</div>
            <div style="color:rgba(255,255,255,0.5);font-size:13px;">Members-only discounts and special promotions</div>
          </div>
        </div>
        <div style="display:flex;align-items:flex-start;margin-bottom:12px;">
          <span style="color:#d0c290;font-size:18px;margin-right:12px;line-height:1.4;">\uD83C\uDF82</span>
          <div>
            <div style="color:rgba(255,255,255,0.85);font-size:14px;font-weight:600;">Birthday Perks</div>
            <div style="color:rgba(255,255,255,0.5);font-size:13px;">Special surprise on your birthday — because you deserve it</div>
          </div>
        </div>
        <div style="display:flex;align-items:flex-start;">
          <span style="color:#d0c290;font-size:18px;margin-right:12px;line-height:1.4;">\uD83D\uDE80</span>
          <div>
            <div style="color:rgba(255,255,255,0.85);font-size:14px;font-weight:600;">Earn & Level Up</div>
            <div style="color:rgba(255,255,255,0.5);font-size:13px;">Earn points on purchases and unlock higher tiers with more rewards</div>
          </div>
        </div>
      </div>

      <!-- CTA -->
      <div style="text-align:center;margin:32px 0;">
        <a href="https://venuecore.live/portal" style="display:inline-block;background:linear-gradient(135deg,#d0c290 0%,#b8a870 100%);color:#1a1a1a;text-decoration:none;font-weight:700;font-size:15px;padding:14px 40px;border-radius:8px;letter-spacing:0.3px;">
          View Your Rewards \u2192
        </a>
      </div>
    </div>

    <!-- Footer -->
    <div style="padding:20px 32px;background:rgba(0,0,0,0.3);border-top:1px solid rgba(255,255,255,0.06);">
      <p style="margin:0;color:rgba(255,255,255,0.3);font-size:11px;text-align:center;line-height:1.6;">
        You're receiving this because you were enrolled in the Friends with Benefits loyalty program.<br/>
        If you'd like to opt out, reply to this email or visit your portal settings.
      </p>
    </div>
  </div>
</body>
</html>`;
}

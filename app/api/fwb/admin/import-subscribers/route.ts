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

  for (const sub of eligible) {
    const email = (sub.email as string)?.toLowerCase();
    if (!email) {
      skipped++;
      continue;
    }

    try {
      // Create FWB wallet
      const { error: walletError } = await supabase
        .from("fwb_wallets")
        .insert({
          email,
          first_name: sub.first_name || null,
          last_name: sub.last_name || null,
          balance: welcomePoints,
          tier: "casual_friend",
        });

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
          email,
          type: "earn",
          points: welcomePoints,
          description: "Welcome bonus — imported from newsletter",
          balance_after: welcomePoints,
        });
      } catch {
        // Transaction logging is non-critical
      }

      imported++;
    } catch (err) {
      errors.push(
        `${email}: ${err instanceof Error ? err.message : "Unknown error"}`
      );
    }
  }

  return NextResponse.json({
    imported,
    skipped,
    errors,
    welcome_points: welcomePoints,
  });
}

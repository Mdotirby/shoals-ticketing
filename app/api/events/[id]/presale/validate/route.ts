import { createAdminClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Simple in-memory rate limiter — resets per cold start, good enough for this
// low-security use case.
const attempts = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 60_000;
const MAX_ATTEMPTS = 10;

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = attempts.get(ip);
  if (!entry || now > entry.resetAt) {
    attempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  entry.count += 1;
  if (entry.count > MAX_ATTEMPTS) return true;
  return false;
}

// ── POST /api/events/[id]/presale/validate ───────────────────────────────────
// Public endpoint — validates a presale code for a given event.
// Returns { valid: true, type: "artist"|"venue" } or { valid: false }.
// Never returns the stored code.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // Rate limit by IP
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";

  if (isRateLimited(ip)) {
    return NextResponse.json(
      { valid: false, message: "Too many attempts. Please wait a moment." },
      { status: 429 }
    );
  }

  let body: { code?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ valid: false, message: "Invalid request" }, { status: 400 });
  }

  const code = (body.code ?? "").trim().toUpperCase();
  if (!code || code.length > 15) {
    return NextResponse.json({ valid: false, message: "Invalid code" }, { status: 400 });
  }

  const admin = createAdminClient();

  try {
    const { data, error } = await admin
      .from("event_presales")
      .select("type, enabled, code, starts_at, ends_at, capacity")
      .eq("event_id", id)
      .eq("enabled", true);

    if (error || !data || data.length === 0) {
      return NextResponse.json({ valid: false, message: "No presale available" }, { status: 200 });
    }

    const now = new Date();

    for (const row of data) {
      if (!row.code) continue;
      if (row.code.toUpperCase() !== code) continue;

      // Check presale window if dates are set
      if (row.starts_at && new Date(row.starts_at) > now) {
        return NextResponse.json(
          { valid: false, message: "Presale hasn't opened yet" },
          { status: 200 }
        );
      }
      if (row.ends_at && new Date(row.ends_at) < now) {
        return NextResponse.json(
          { valid: false, message: "This presale has ended" },
          { status: 200 }
        );
      }

      // Valid
      return NextResponse.json({ valid: true, type: row.type }, { status: 200 });
    }

    return NextResponse.json(
      { valid: false, message: "That code isn't valid or the presale window isn't open yet" },
      { status: 200 }
    );
  } catch {
    return NextResponse.json({ valid: false, message: "Unable to validate code" }, { status: 200 });
  }
}

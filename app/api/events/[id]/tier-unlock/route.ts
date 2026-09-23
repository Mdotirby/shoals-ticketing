import { createAdminClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";
import { normalizeUnlockCode } from "@/lib/fees/tierFees";

/**
 * POST /api/events/[id]/tier-unlock  { code }  →  { tierIds: string[] }
 *
 * Which tiers on this show does this code open?
 *
 * The tier list endpoint deliberately never sends `unlock_code` to the
 * browser — it sends `locked: true` — so the comparison has to happen here.
 * The answer is only ever a list of ids the caller already knows about, so a
 * correct guess reveals nothing beyond the fact that it was correct.
 *
 * This is a convenience for the UI, NOT the enforcement point. Checkout
 * re-checks the code against the tier on every purchase
 * (create-intent and checkout/free both call unlocksTier), so a client that
 * lies about being unlocked still cannot buy.
 *
 * PUBLIC by design — a buyer with a code is not signed in.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const code = normalizeUnlockCode(body?.code);

  if (!code) {
    return NextResponse.json({ error: "Enter a code." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("ticket_tiers")
    .select("id, unlock_code")
    .eq("event_id", id)
    .not("unlock_code", "is", null);

  // No column yet (migration not run) means no tier can be locked.
  if (error) {
    return NextResponse.json({ tierIds: [] }, { status: 200 });
  }

  const tierIds = (data ?? [])
    .filter((t: { unlock_code: string | null }) => normalizeUnlockCode(t.unlock_code) === code)
    .map((t: { id: string }) => t.id);

  if (tierIds.length === 0) {
    return NextResponse.json({ error: "That code doesn't match anything on this show.", tierIds: [] }, { status: 404 });
  }

  return NextResponse.json({ tierIds }, { status: 200 });
}

import { createAdminClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth/can";
import { GLOBAL_FAQS } from "@/lib/faqs/defaults";

/**
 * POST /api/faqs/seed   { venue_id }
 *
 * Write the six shipped defaults into venue_faqs as real, editable rows.
 *
 * ── Why this exists ──────────────────────────────────────────────────────
 * The storefront reads: `if (rows.length > 0) use rows; else use GLOBAL_FAQS`.
 * That is all-or-nothing. Customising ONE answer used to replace all six on
 * the public site — the other five silently disappeared, with nothing in the
 * admin saying so. The defaults could be read but never edited, because they
 * only existed in TypeScript.
 *
 * Seeding turns them into rows. After that the fallback never fires for this
 * venue, so editing one question cannot delete the other five.
 *
 * Idempotent: a venue that already has FAQs is left alone and told so, rather
 * than ending up with two copies of every question.
 */
export async function POST(request: Request) {
  const guard = await requireStaff();
  if (!guard.ok) return guard.response;

  const body = await request.json().catch(() => ({}));
  const venueId = body?.venue_id;
  if (!venueId) {
    return NextResponse.json({ error: "venue_id required" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: existing, error: readError } = await admin
    .from("venue_faqs")
    .select("id")
    .eq("venue_id", venueId)
    .limit(1);

  if (readError) {
    return NextResponse.json({ error: readError.message }, { status: 500 });
  }
  if (existing && existing.length > 0) {
    return NextResponse.json(
      { seeded: 0, reason: "This venue already has its own FAQs — nothing was added." },
      { status: 200 },
    );
  }

  const rows = GLOBAL_FAQS.map((f, i) => ({
    venue_id: venueId,
    question: f.question,
    answer: f.answer,
    sort_order: i,
  }));

  const { data, error } = await admin.from("venue_faqs").insert(rows).select();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ seeded: data?.length ?? 0, faqs: data ?? [] }, { status: 201 });
}

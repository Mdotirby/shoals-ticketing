/**
 * Event Close-Out API
 *
 * POST   /api/events/[id]/closeout    → close out a show (lock from public sales)
 * DELETE /api/events/[id]/closeout    → reopen a closed-out show
 *
 * Once closed out, the event:
 *   • is hidden from upcoming/customer-facing event lists
 *   • cannot accept new ticket purchases (checkout endpoints reject it)
 *   • is shown on the public /events/past archive
 *   • remains "confirmed" in admin views — booking_status is NOT mutated
 *
 * Body (POST, optional): { note?: string }
 */
import { createAdminClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const admin = createAdminClient();

  // Optional note on close-out (e.g. weather cancellation summary)
  let note: string | null = null;
  try {
    const body = await request.json().catch(() => ({}));
    if (body && typeof body.note === "string" && body.note.trim()) {
      note = body.note.trim().slice(0, 1000);
    }
  } catch {
    // no body — fine, just stamp closed_out_at
  }

  // Build update payload — try with all closeout columns first, fall back if
  // the migration hasn't been run yet.
  const fullPayload: Record<string, unknown> = {
    closed_out_at: new Date().toISOString(),
    closed_out_note: note,
  };

  let { data, error } = await admin
    .from("events")
    .update(fullPayload)
    .eq("id", id)
    .select()
    .single();

  // If the column doesn't exist yet (migration not run), retry with just
  // closed_out_at, and finally with nothing (informative error).
  if (error && /closed_out_note|column .* does not exist/i.test(error.message)) {
    const retry = await admin
      .from("events")
      .update({ closed_out_at: fullPayload.closed_out_at })
      .eq("id", id)
      .select()
      .single();
    data = retry.data;
    error = retry.error;
  }

  if (error) {
    return NextResponse.json(
      {
        error:
          /closed_out_at|column .* does not exist/i.test(error.message)
            ? "Close-out column missing. Run plans/event-closeout-migration.sql."
            : error.message,
      },
      { status: 500 }
    );
  }

  return NextResponse.json(data, { status: 200 });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("events")
    .update({
      closed_out_at: null,
      closed_out_by: null,
      closed_out_note: null,
    })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    // Tolerate missing columns if migration hasn't been run yet.
    if (/closed_out_by|closed_out_note/i.test(error.message)) {
      const retry = await admin
        .from("events")
        .update({ closed_out_at: null })
        .eq("id", id)
        .select()
        .single();
      if (retry.error) {
        return NextResponse.json({ error: retry.error.message }, { status: 500 });
      }
      return NextResponse.json(retry.data, { status: 200 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 200 });
}

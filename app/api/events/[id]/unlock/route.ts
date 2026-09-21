import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth/can";
import { writeAudit } from "@/lib/auth/audit";
import { createAdminClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

/**
 * POST /api/events/[id]/unlock — the edit form's "Edit event" button on a
 * show that is published and selling.
 *
 * PHASE1-EDIT-PAGES § 1: unlocking writes an audit entry before the first
 * keystroke. The unlock itself changes nothing in the database — the save
 * that follows records its own before/after (PUT /api/events/[id]) — so this
 * is the record that someone opened a live show's locked fields, even if
 * they then discard.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireStaff();
  if (!guard.ok) return guard.response;
  const { id } = await params;

  const { data: event } = await createAdminClient().from("events").select("venue_id").eq("id", id).single();
  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  await writeAudit(guard.actor, {
    action: "event.unlocked_for_edit",
    targetType: "event",
    targetId: id,
    venueId: event.venue_id ?? null,
  });
  return NextResponse.json({ ok: true });
}

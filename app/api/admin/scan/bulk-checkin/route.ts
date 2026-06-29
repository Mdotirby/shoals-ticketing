import { createAdminClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";

// POST /api/admin/scan/bulk-checkin
// Body: { ticket_ids: string[] }
export async function POST(request: Request) {
  const body = await request.json();
  const ticketIds: string[] = body.ticket_ids ?? [];

  if (!Array.isArray(ticketIds) || ticketIds.length === 0) {
    return NextResponse.json({ error: "ticket_ids required" }, { status: 400 });
  }

  const admin = createAdminClient();
  const now = new Date().toISOString();

  // Fetch current scan status so we don't double-count already-scanned tickets
  const { data: existing, error: fetchError } = await admin
    .from("tickets")
    .select("id, is_scanned")
    .in("id", ticketIds);

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  const unscanned = (existing ?? [])
    .filter((t) => !t.is_scanned)
    .map((t) => t.id);

  const alreadyScanned = ticketIds.length - unscanned.length;

  if (unscanned.length === 0) {
    return NextResponse.json({ checked_in: 0, already_scanned: alreadyScanned }, { status: 200 });
  }

  const { error: updateError } = await admin
    .from("tickets")
    .update({ is_scanned: true, scanned_at: now })
    .in("id", unscanned);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json(
    { checked_in: unscanned.length, already_scanned: alreadyScanned },
    { status: 200 }
  );
}

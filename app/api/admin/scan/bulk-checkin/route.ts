import { requireCapability } from "@/lib/auth/can";
import { createAdminClient } from "@/lib/supabase-server";
import { refusalReason } from "@/lib/tickets/void";
import { NextResponse } from "next/server";

/**
 * POST /api/admin/scan/bulk-checkin   { ticket_ids: string[] }
 *
 * This route checked only `is_scanned`. The handheld scanner
 * (/api/tickets/[id]/validate) also refuses a refunded order — this one did
 * not, so the two disagreed about what a valid ticket is, and the looser one
 * won: on 2026-08-15 six tickets from a fully refunded VIP table were admitted
 * here in a single batch at 23:36:57, for a table nobody paid for.
 *
 * Both routes now ask the same question, in lib/tickets/void.ts. Anything
 * refused is reported back per ticket with the reason, rather than silently
 * counted as "already scanned".
 */
export async function POST(request: Request) {
  const guard = await requireCapability("scan_checkin", { write: true });
  if (!guard.ok) return guard.response;

  const body = await request.json();
  const ticketIds: string[] = body.ticket_ids ?? [];

  if (!Array.isArray(ticketIds) || ticketIds.length === 0) {
    return NextResponse.json({ error: "ticket_ids required" }, { status: 400 });
  }

  const admin = createAdminClient();
  const now = new Date().toISOString();

  const columns = "id, is_scanned, scanned_at, voided_at, void_reason, customer_name, orders(status)";
  let { data: existing, error: fetchError } = await admin
    .from("tickets")
    .select(columns)
    .in("id", ticketIds);

  // A database without plans/ticket-void-migration.sql must still be able to
  // check people in — it simply cannot honour voids until the migration runs.
  if (fetchError && /voided_at|void_reason|column .* does not exist/i.test(fetchError.message)) {
    const retry = await admin
      .from("tickets")
      .select("id, is_scanned, scanned_at, customer_name, orders(status)")
      .in("id", ticketIds);
    existing = (retry.data ?? []).map((t) => ({ ...t, voided_at: null, void_reason: null }));
    fetchError = retry.error;
  }

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  const admit: string[] = [];
  const refused: { id: string; name: string | null; reason: string }[] = [];
  let alreadyScanned = 0;

  for (const t of existing ?? []) {
    const orderStatus = (t.orders as unknown as { status: string } | null)?.status;
    const reason = refusalReason({
      voided_at: t.voided_at,
      void_reason: t.void_reason,
      is_scanned: t.is_scanned,
      scanned_at: t.scanned_at,
      orderStatus,
    });
    if (!reason) {
      admit.push(t.id);
    } else if (t.is_scanned && !t.voided_at && orderStatus !== "refunded") {
      // An ordinary double-scan, which is routine and not worth flagging.
      alreadyScanned++;
    } else {
      refused.push({ id: t.id, name: t.customer_name ?? null, reason });
    }
  }

  if (admit.length > 0) {
    const { error: updateError } = await admin
      .from("tickets")
      .update({ is_scanned: true, scanned_at: now })
      .in("id", admit);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }
  }

  return NextResponse.json(
    {
      checked_in: admit.length,
      already_scanned: alreadyScanned,
      // Void or refunded — these people were NOT checked in, and the door
      // needs to be told why rather than left to assume it worked.
      refused,
    },
    { status: 200 },
  );
}

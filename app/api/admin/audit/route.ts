import { createAdminClient } from "@/lib/supabase-server";
import { requireCapability } from "@/lib/auth/can";
import { NextResponse } from "next/server";

/**
 * GET /api/admin/audit — the accountability trail.
 *
 * Gated on `read_audit`, which the design gives to Owner and Venue Admin at
 * full and Finance at read. The table is insert-only by trigger
 * (plans/audit-log-migration.sql), so this is the only way to look at it.
 */
export async function GET(request: Request) {
  const guard = await requireCapability("read_audit");
  if (!guard.ok) return guard.response;

  const params = new URL(request.url).searchParams;
  const limit = Math.min(Number(params.get("limit")) || 25, 200);
  // Optional: one record's trail — the event edit form's "Recent changes".
  const targetId = params.get("target_id");
  const admin = createAdminClient();

  let query = admin
    .from("audit_log")
    .select("id, action, target_type, target_id, detail, created_at, venue_id")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (targetId) query = query.eq("target_id", targetId);

  const { data, error } = await query;

  if (error) {
    if (/does not exist|schema cache|Could not find the table/i.test(error.message)) {
      return NextResponse.json({ entries: [], tableMissing: true });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ entries: data ?? [], tableMissing: false });
}

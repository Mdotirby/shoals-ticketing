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

  const limit = Math.min(Number(new URL(request.url).searchParams.get("limit")) || 25, 200);
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("audit_log")
    .select("id, action, target_type, target_id, detail, created_at, venue_id")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    if (/does not exist|schema cache|Could not find the table/i.test(error.message)) {
      return NextResponse.json({ entries: [], tableMissing: true });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ entries: data ?? [], tableMissing: false });
}

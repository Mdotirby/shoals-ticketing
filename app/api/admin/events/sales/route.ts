import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth/can";
import { createAdminClient } from "@/lib/supabase-server";
import { eventSales } from "@/lib/admin/eventSales";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/events/sales?ids=a,b,c
 *
 * Sold (paid, comps excluded), tier capacity and ledger gross per event —
 * lib/admin/eventSales.ts, the same figures the Command Center shows. For the
 * calendar's utilization and the show list's Sold / Gross columns.
 */
export async function GET(request: Request) {
  const guard = await requireStaff();
  if (!guard.ok) return guard.response;
  if (guard.actor.role === "artist") return NextResponse.json({ error: "Not available" }, { status: 403 });

  const ids = (new URL(request.url).searchParams.get("ids") || "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => /^[0-9a-f-]{36}$/i.test(s))
    .slice(0, 300);
  const admin = createAdminClient();
  const [sales, { data: settlements }] = await Promise.all([
    eventSales(admin, ids),
    // The events list's "Settled" status — a finalized settlement, nothing else.
    ids.length
      ? admin.from("settlements").select("event_id, status").in("event_id", ids)
      : Promise.resolve({ data: [] as Array<{ event_id: string; status: string }> }),
  ]);
  const settled = new Set((settlements ?? []).filter((s) => s.status === "finalized").map((s) => s.event_id));
  return NextResponse.json(
    Object.fromEntries([...sales].map(([id, s]) => [id, { ...s, settled: settled.has(id) }])),
  );
}

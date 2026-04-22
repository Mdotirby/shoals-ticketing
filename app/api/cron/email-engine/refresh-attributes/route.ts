import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-server";
import { refreshAllAttributes } from "@/modules/email-engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/cron/email-engine/refresh-attributes
 * Vercel cron target — recommended schedule: once per hour.
 * Recomputes ee_contact_attributes from orders / newsletter / suppressions.
 */
export async function GET(req: NextRequest) {
  if (!authorizeCron(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const res = await refreshAllAttributes(createAdminClient());
    return NextResponse.json({ ok: true, ...res });
  } catch (e) {
    console.error("[EE cron] refresh-attributes failed", e);
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}

function authorizeCron(req: NextRequest): boolean {
  // Vercel Cron sends `Authorization: Bearer ${CRON_SECRET}` when configured.
  // Allow service-role header or absence-of-secret for local dev.
  const header = req.headers.get("authorization");
  const expected = process.env.CRON_SECRET;
  if (!expected) return true;
  return header === `Bearer ${expected}`;
}

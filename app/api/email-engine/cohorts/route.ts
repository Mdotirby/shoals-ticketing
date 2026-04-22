import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-server";
import {
  STANDARD_COHORTS,
  buildCohort,
  buildAllStandardCohorts,
} from "@/modules/email-engine";

/**
 * GET /api/email-engine/cohorts
 *   → Returns the list of canonical cohort specs (no data yet).
 *
 * GET /api/email-engine/cohorts?build=all[&venue_id=...]
 *   → Builds every cohort and returns hashed-email arrays (Meta/Snap format).
 *
 * GET /api/email-engine/cohorts?key=engaged_last_30d[&venue_id=...]
 *   → Builds just that cohort.
 *
 * Data flows out of ee_contact_full only; never mutates anything.
 */
export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key");
  const build = req.nextUrl.searchParams.get("build");
  const venue_id = req.nextUrl.searchParams.get("venue_id") || null;
  const admin = createAdminClient();

  if (build === "all") {
    const all = await buildAllStandardCohorts(admin, { venue_id });
    return NextResponse.json(all.map(stripHashesIfLarge));
  }
  if (key) {
    const spec = STANDARD_COHORTS.find((c) => c.key === key);
    if (!spec) return NextResponse.json({ error: "unknown cohort key" }, { status: 404 });
    const cohort = await buildCohort(admin, spec, { venue_id });
    return NextResponse.json(cohort);
  }

  // Default: the catalog
  return NextResponse.json(STANDARD_COHORTS);
}

/**
 * For the bulk endpoint we avoid shipping 250k hashes over the wire by
 * replacing the array with a size-only preview. Callers that need the
 * hashes themselves should request one cohort at a time.
 */
function stripHashesIfLarge(c: { key: string; label: string; size: number; hashed_emails: string[] }) {
  if (c.hashed_emails.length > 1000) {
    return { key: c.key, label: c.label, size: c.size, hashed_emails: null as null };
  }
  return c;
}

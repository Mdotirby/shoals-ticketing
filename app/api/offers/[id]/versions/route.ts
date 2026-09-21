import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth/can";
import { createAdminClient } from "@/lib/supabase-server";
import { revisionsMissing } from "@/lib/offers/revisions";

export const dynamic = "force-dynamic";

const COLUMNS = "id, version, status, revision_of, superseded_at, created_at, updated_at, created_by, guarantee, backend_percentage, deal_type";

/**
 * GET /api/offers/[id]/versions — every version of the deal this offer
 * belongs to, oldest first: the chain's root and every revision under it.
 * Before the revisions migration runs, an offer is a chain of one.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireStaff();
  if (!guard.ok) return guard.response;
  const { id } = await params;
  const admin = createAdminClient();

  const { data: start, error } = await admin.from("artist_offers").select(COLUMNS).eq("id", id).single();
  if (error && revisionsMissing(error.message)) {
    const { data: solo } = await admin
      .from("artist_offers")
      .select("id, status, created_at, updated_at, created_by, guarantee, backend_percentage, deal_type")
      .eq("id", id)
      .single();
    return NextResponse.json({
      versions: solo ? [{ ...solo, version: 1, revision_of: null, superseded_at: null }] : [],
      migrationNeeded: true,
    });
  }
  if (!start) return NextResponse.json({ error: "Offer not found" }, { status: 404 });

  // Up to the root…
  let root = start;
  for (let hops = 0; root.revision_of && hops < 50; hops++) {
    const { data: parent } = await admin.from("artist_offers").select(COLUMNS).eq("id", root.revision_of).single();
    if (!parent) break;
    root = parent;
  }
  // …then down every branch, breadth first.
  const versions = [root];
  let frontier = [root.id];
  for (let depth = 0; frontier.length > 0 && depth < 50; depth++) {
    const { data: children } = await admin.from("artist_offers").select(COLUMNS).in("revision_of", frontier);
    const next = children ?? [];
    versions.push(...next);
    frontier = next.map((c) => c.id);
  }
  versions.sort((a, b) => (a.version ?? 1) - (b.version ?? 1) || a.created_at.localeCompare(b.created_at));
  return NextResponse.json({ versions, migrationNeeded: false });
}

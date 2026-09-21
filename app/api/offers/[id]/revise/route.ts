import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth/can";
import { writeAudit } from "@/lib/auth/audit";
import { createAdminClient } from "@/lib/supabase-server";
import { revisionsMissing } from "@/lib/offers/revisions";
import { ALLOWED_COLUMNS } from "@/lib/offers/columns";

export const dynamic = "force-dynamic";

/**
 * POST /api/offers/[id]/revise — "Create revision" on a countersigned offer.
 *
 * Copies the signed offer into a new draft row (revision_of → it, version
 * + 1) and returns the draft, which then opens in the offer builder like any
 * draft. The signed offer is untouched and stays operative until the draft
 * is itself countersigned (PUT /api/offers/[id] then marks it superseded).
 * The event, its tickets and its orders are never touched.
 *
 * One open revision per signed offer: asking again returns the existing
 * draft rather than forking the deal.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireStaff();
  if (!guard.ok) return guard.response;
  const { id } = await params;
  const admin = createAdminClient();

  const { data: source, error: srcErr } = await admin.from("artist_offers").select("*").eq("id", id).single();
  if (srcErr || !source) return NextResponse.json({ error: "Offer not found" }, { status: 404 });
  if (source.status !== "accepted") {
    return NextResponse.json(
      { error: "Only a countersigned offer is revised. A draft or sent offer is edited directly in the builder." },
      { status: 409 }
    );
  }
  if (!("revision_of" in source)) {
    return NextResponse.json(
      { error: "Revisions need plans/offer-revisions-migration.sql run in Supabase first.", migration: "plans/offer-revisions-migration.sql" },
      { status: 409 }
    );
  }

  const { data: existing } = await admin
    .from("artist_offers")
    .select("id, version, status")
    .eq("revision_of", id)
    .not("status", "in", "(accepted,declined)")
    .limit(1);
  if (existing && existing.length > 0) {
    return NextResponse.json({ offer: existing[0], existing: true });
  }

  const draft: Record<string, unknown> = {};
  for (const key of ALLOWED_COLUMNS) {
    if (key in source) draft[key] = source[key];
  }
  draft.status = "draft";
  draft.created_by = guard.actor.email ?? source.created_by ?? null;
  draft.revision_of = id;
  draft.version = (Number(source.version) || 1) + 1;

  const { data: created, error } = await admin.from("artist_offers").insert(draft).select("id, version, status").single();
  if (error) {
    if (revisionsMissing(error.message)) {
      return NextResponse.json(
        { error: "Revisions need plans/offer-revisions-migration.sql run in Supabase first.", migration: "plans/offer-revisions-migration.sql" },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await writeAudit(guard.actor, {
    action: "offer.revision_created",
    targetType: "offer",
    targetId: created.id,
    venueId: (source.venue_id as string | null) ?? null,
    detail: { revision_of: id, version: created.version, artist: source.artist_name },
  });

  return NextResponse.json({ offer: created, existing: false });
}

import { createAdminClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth/can";
import { changedTerms, revisionsMissing } from "@/lib/offers/revisions";
import { ALLOWED_COLUMNS } from "@/lib/offers/columns";

// GET: single offer
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  // Offers carry guarantees and splits, and every caller is an admin page.
  // This route answered anyone.
  const guard = await requireStaff();
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("artist_offers")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: error.code === "PGRST116" ? 404 : 500 }
    );
  }

  return NextResponse.json(data);
}

// PUT: update offer
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  // Anyone could rewrite a signed deal. Staff only now.
  const guard = await requireStaff();
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const admin = createAdminClient();
  const body = (await request.json()) as Record<string, unknown>;

  // Only keep keys that exist on the artist_offers table. This protects
  // against form state containing derived/unknown fields (e.g. client-only
  // cached fees that aren't columns) that would otherwise cause the whole
  // update to fail with a "column not found" error.
  const updates: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body)) {
    if (ALLOWED_COLUMNS.has(key)) {
      updates[key] = value;
    }
  }

  // A countersigned offer is a contract (lib/offers/revisions.ts): its terms
  // are never edited in place. Notes and status may still move; anything
  // else is refused with a pointer to the revision flow.
  const { data: current } = await admin.from("artist_offers").select("*").eq("id", id).single();
  if (current?.status === "accepted") {
    const changed = changedTerms(current, updates);
    if (changed.length > 0) {
      return NextResponse.json(
        {
          error: "This offer is countersigned, so its terms can't be edited in place. Create a revision instead — the signed version stays in force until the revision is signed.",
          locked: changed,
        },
        { status: 409 }
      );
    }
  }

  const { data, error } = await admin
    .from("artist_offers")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  // A revision just got countersigned: the version it revised stops being
  // the operative deal. Walk back up the chain and mark every signed
  // ancestor superseded. Both stay on file.
  if (!error && updates.status === "accepted" && current?.status !== "accepted" && current?.revision_of) {
    let parentId: string | null = current.revision_of as string;
    const now = new Date().toISOString();
    for (let hops = 0; parentId && hops < 50; hops++) {
      const { data: parent }: { data: { id: string; status: string; revision_of: string | null; superseded_at: string | null } | null } = await admin
        .from("artist_offers")
        .select("id, status, revision_of, superseded_at")
        .eq("id", parentId)
        .single();
      if (!parent) break;
      if (parent.status === "accepted" && !parent.superseded_at) {
        const { error: supErr } = await admin.from("artist_offers").update({ superseded_at: now }).eq("id", parent.id);
        if (supErr && revisionsMissing(supErr.message)) break;
      }
      parentId = parent.revision_of;
    }
  }

  if (error) {
    console.error(`PUT /api/offers/${id} failed:`, error.message, error.code, error.details);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

// DELETE: delete offer
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireStaff();
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const admin = createAdminClient();

  const { error } = await admin
    .from("artist_offers")
    .delete()
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ deleted: true });
}

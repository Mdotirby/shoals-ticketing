import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth/can";
import { tenantScope, DENY } from "@/lib/auth/tenant";
import { createAdminClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

/** Never carried to the copy: identity, the night's outcome, and anything unique. */
const DROP = new Set([
  "id", "created_at", "closed_out_at", "closed_out_by", "closed_out_note", "landing_page_slug",
  "external_settlement_amount", "external_marketing_spend", "on_sale_at",
]);

const EDITOR_ROLES = ["owner", "super_admin", "venue_admin", "full_admin"];

/**
 * POST /api/events/[id]/duplicate — eventhub.dc.html's "Duplicate".
 *
 * Copies the show's details and its ticket tiers into a new draft titled
 * "(copy)". Orders, holds, guests, scans and the settlement stay with the
 * original. The on-sale time is cleared so a copy never goes on sale by
 * itself. The linked offer is not copied — an offer is a negotiation with one
 * artist for one date, and a copy of it would be a second, unsigned deal.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireStaff();
  if (!guard.ok) return guard.response;
  if (!EDITOR_ROLES.includes(guard.actor.role)) {
    return NextResponse.json({ error: "Your role can't duplicate shows." }, { status: 403 });
  }

  const { id } = await params;
  const admin = createAdminClient();
  const { data: src, error } = await admin.from("events").select("*").eq("id", id).maybeSingle();
  if (error || !src) return NextResponse.json({ error: "Show not found" }, { status: 404 });

  // Only a show in the actor's own tenant can be copied.
  const scope = tenantScope(guard.actor, src.venue_id);
  if (scope === DENY || (scope !== null && scope !== src.venue_id)) {
    return NextResponse.json({ error: "Show not found" }, { status: 404 });
  }

  const row: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(src)) if (!DROP.has(k)) row[k] = v;
  row.title = `${src.title} (copy)`;
  row.status = "draft";

  const { data: copy, error: insErr } = await admin.from("events").insert(row).select("id, title").single();
  if (insErr || !copy) return NextResponse.json({ error: insErr?.message || "Could not copy the show" }, { status: 500 });

  const { data: tiers } = await admin.from("ticket_tiers").select("*").eq("event_id", id).order("sort_order");
  if (tiers && tiers.length) {
    const rows = tiers.map((t) => {
      const r: Record<string, unknown> = { ...t, event_id: copy.id };
      delete r.id;
      delete r.created_at;
      return r;
    });
    const { error: tierErr } = await admin.from("ticket_tiers").insert(rows);
    if (tierErr) {
      // Half a copy is worse than none — take the event back out.
      await admin.from("events").delete().eq("id", copy.id);
      return NextResponse.json({ error: `Could not copy the tiers: ${tierErr.message}` }, { status: 500 });
    }
  }

  return NextResponse.json({ id: copy.id, title: copy.title });
}

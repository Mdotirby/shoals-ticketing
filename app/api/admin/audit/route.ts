import { createAdminClient } from "@/lib/supabase-server";
import { requireCapability } from "@/lib/auth/can";
import { tenantScope, DENY } from "@/lib/auth/tenant";
import { NextResponse } from "next/server";

/**
 * GET /api/admin/audit — the accountability trail.
 *
 * Gated on `read_audit`, which the design gives to Owner and Venue Admin at
 * full and Finance at read. The table is insert-only by trigger
 * (plans/audit-log-migration.sql), so this is the only way to look at it.
 *
 *   ?target_id=…  one record's trail (the event edit form's "Recent changes")
 *   ?event_id=…   everything about one show: entries on the show itself, and
 *                 entries on its orders, offer or settlement that carry the
 *                 show in detail.event_id (the event hub's Activity)
 *
 * Every answer is limited to the actor's own tenant — a venue admin sees
 * their venue's trail, never another's.
 */
export async function GET(request: Request) {
  const guard = await requireCapability("read_audit");
  if (!guard.ok) return guard.response;

  const params = new URL(request.url).searchParams;
  const limit = Math.min(Number(params.get("limit")) || 25, 200);
  const targetId = params.get("target_id");
  const eventId = params.get("event_id");
  const admin = createAdminClient();

  const scope = tenantScope(guard.actor, null);
  if (scope === DENY) return NextResponse.json({ entries: [], tableMissing: false });

  let query = admin
    .from("audit_log")
    .select("id, action, target_type, target_id, detail, created_at, venue_id, actor_id")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (scope !== null) query = query.eq("venue_id", scope);
  if (targetId) query = query.eq("target_id", targetId);
  if (eventId && /^[0-9a-f-]{36}$/i.test(eventId)) query = query.or(`target_id.eq.${eventId},detail->>event_id.eq.${eventId}`);

  const { data, error } = await query;

  if (error) {
    if (/does not exist|schema cache|Could not find the table/i.test(error.message)) {
      return NextResponse.json({ entries: [], tableMissing: true });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Who did it, by name — the trail is for people, not ids.
  const ids = [...new Set((data ?? []).map((e) => e.actor_id).filter(Boolean))] as string[];
  const { data: people } = ids.length
    ? await admin.from("admin_users").select("id, first_name, last_name, email, role").in("id", ids)
    : { data: [] as Array<{ id: string; first_name: string | null; last_name: string | null; email: string | null; role: string | null }> };
  const byId = new Map((people ?? []).map((p) => [p.id, p]));

  return NextResponse.json({
    entries: (data ?? []).map((e) => {
      const p = e.actor_id ? byId.get(e.actor_id) : undefined;
      return {
        ...e,
        actor_name: p ? [p.first_name, p.last_name].filter(Boolean).join(" ") || p.email : null,
        actor_role: p?.role ?? null,
      };
    }),
    tableMissing: false,
  });
}

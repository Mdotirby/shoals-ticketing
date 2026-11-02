import { requireCapability, requireStaff } from "@/lib/auth/can";
import { createAdminClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";
import { tenantScope, venueInTenant, DENY } from "@/lib/auth/tenant";
import { levelRank, normalizeRole } from "@/lib/auth/roles";

// GET /api/admin/sidebar-permissions?venue_id=xxx&role=artist
// Returns sidebar permissions for a given venue + role (server-side, bypasses RLS)
// For roles without a venue (like artist), searches across all venues for that role
export async function GET(request: Request) {
  const guard = await requireStaff();
  if (!guard.ok) return guard.response;

  const { searchParams } = new URL(request.url);
  // Staff read their own venue's tabs; the request's venue is only the owner's to choose.
  const scope = tenantScope(guard.actor, searchParams.get("venue_id"));
  if (scope === DENY) return NextResponse.json([]);
  const venueId = scope;
  const role = searchParams.get("role");

  if (!role) {
    return NextResponse.json({ error: "role is required" }, { status: 400 });
  }

  const admin = createAdminClient();

  if (venueId) {
    // Standard: fetch permissions for specific venue + role
    const { data, error } = await admin
      .from("sidebar_permissions")
      .select("tab_key, visible")
      .eq("venue_id", venueId)
      .eq("role", role);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json(data ?? []);
  }

  // No venue_id: search across ALL venues for this role (for artists, etc.)
  const { data, error } = await admin
    .from("sidebar_permissions")
    .select("tab_key, visible, venue_id")
    .eq("role", role);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // If multiple venues have settings for this role, use the first venue's settings
  if (data && data.length > 0) {
    const firstVenueId = data[0].venue_id;
    const filtered = data
      .filter((d: { venue_id: string }) => d.venue_id === firstVenueId)
      .map((d: { tab_key: string; visible: boolean }) => ({ tab_key: d.tab_key, visible: d.visible }));
    return NextResponse.json(filtered);
  }

  return NextResponse.json([]);
}

// POST: save sidebar permissions (bypasses RLS)
export async function POST(request: Request) {
  const guard = await requireCapability("assign_roles", { write: true });
  if (!guard.ok) return guard.response;

  const body = await request.json();
  const { rows } = body;

  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: "rows array is required" }, { status: 400 });
  }

  // Your own venue only, and only for levels below yours.
  const actorLevel = guard.actor.resolved.level;
  const allowed = rows.every((r: { venue_id?: string | null; role?: string }) => {
    if (!venueInTenant(guard.actor, r.venue_id)) return false;
    const target = normalizeRole(r.role).level;
    return !target || (!!actorLevel && levelRank(actorLevel) < levelRank(target));
  });
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const admin = createAdminClient();
  const { error } = await admin
    .from("sidebar_permissions")
    .upsert(rows, { onConflict: "venue_id,role,tab_key" });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ saved: true });
}

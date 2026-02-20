import { createAdminClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";

// GET /api/admin/sidebar-permissions?venue_id=xxx&role=artist
// Returns sidebar permissions for a given venue + role (server-side, bypasses RLS)
// For roles without a venue (like artist), searches across all venues for that role
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const venueId = searchParams.get("venue_id");
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

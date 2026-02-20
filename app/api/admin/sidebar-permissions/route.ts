import { createAdminClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";

// GET /api/admin/sidebar-permissions?venue_id=xxx&role=artist
// Returns sidebar permissions for a given venue + role (server-side, bypasses RLS)
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const venueId = searchParams.get("venue_id");
  const role = searchParams.get("role");

  if (!venueId || !role) {
    return NextResponse.json({ error: "venue_id and role are required" }, { status: 400 });
  }

  const admin = createAdminClient();
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

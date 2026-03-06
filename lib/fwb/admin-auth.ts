// ============================================================================
// FWB Admin Auth Helper
// Verifies the caller has admin or super_admin role for the given venue.
// ============================================================================

import { createClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase-server";

interface AdminAuthResult {
  authorized: boolean;
  userId: string | null;
  role: string | null;
  venueId: string | null;
  error: string | null;
  status: number;
}

/**
 * Verify that the request comes from an authenticated admin user.
 * Checks authorization header → Supabase auth → admin_users table.
 * Returns the user's ID, role, and venue_id if authorized.
 *
 * venue_id resolution order:
 *  1. x-venue-id header (if provided and non-empty)
 *  2. admin_users.venue_id from the database
 *  3. If neither exists, returns 400
 */
export async function verifyAdminAuth(request: Request): Promise<AdminAuthResult> {
  const headerVenueId = request.headers.get("x-venue-id");

  const authHeader = request.headers.get("authorization");
  if (!authHeader) {
    return { authorized: false, userId: null, role: null, venueId: null, error: "Authorization required", status: 401 };
  }

  const token = authHeader.replace("Bearer ", "");
  const authClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const { data: { user }, error: userError } = await authClient.auth.getUser(token);

  if (userError || !user) {
    return { authorized: false, userId: null, role: null, venueId: null, error: "Invalid or expired token", status: 401 };
  }

  const adminClient = createAdminClient();

  const { data: adminRecord, error: adminError } = await adminClient
    .from("admin_users")
    .select("role, venue_id")
    .eq("id", user.id)
    .single();

  if (adminError || !adminRecord) {
    return { authorized: false, userId: user.id, role: null, venueId: headerVenueId, error: "No admin role assigned for this account", status: 403 };
  }

  const allowedRoles = ["admin", "super_admin"];
  if (!allowedRoles.includes(adminRecord.role)) {
    return { authorized: false, userId: user.id, role: adminRecord.role, venueId: headerVenueId, error: "Insufficient permissions", status: 403 };
  }

  // Resolve venue_id: prefer header, fall back to admin_users record
  const resolvedVenueId = (headerVenueId && headerVenueId.trim()) || adminRecord.venue_id || null;

  if (!resolvedVenueId) {
    return { authorized: false, userId: user.id, role: adminRecord.role, venueId: null, error: "No venue_id found. Set venue_id in admin_users or pass x-venue-id header.", status: 400 };
  }

  // If not super_admin, verify they belong to the requested venue
  if (adminRecord.role !== "super_admin" && adminRecord.venue_id && adminRecord.venue_id !== resolvedVenueId) {
    return { authorized: false, userId: user.id, role: adminRecord.role, venueId: resolvedVenueId, error: "Not authorized for this venue", status: 403 };
  }

  return { authorized: true, userId: user.id, role: adminRecord.role, venueId: resolvedVenueId, error: null, status: 200 };
}

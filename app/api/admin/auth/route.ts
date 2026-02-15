// POST: look up the authenticated user's admin role
// Accepts { access_token } in the body, verifies with Supabase Auth,
// then uses the service-role key to bypass RLS on admin_users.
// Returns: { role } or 403 if user has no admin record.

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { access_token } = body;

    if (!access_token) {
      return NextResponse.json(
        { error: "access_token is required" },
        { status: 400 }
      );
    }

    // 1. Verify the access token with Supabase Auth using a temporary client
    const authClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    const {
      data: { user },
      error: userError,
    } = await authClient.auth.getUser(access_token);

    if (userError || !user) {
      return NextResponse.json(
        { error: "Invalid or expired token" },
        { status: 401 }
      );
    }

    // 2. Use service-role client to bypass RLS
    const adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // 3. Look up admin_users record
    const { data: adminRecord, error: adminError } = await adminClient
      .from("admin_users")
      .select("role, venue_id, first_name, last_name")
      .eq("id", user.id)
      .single();

    if (adminError || !adminRecord) {
      return NextResponse.json(
        { error: "No admin role assigned for this account." },
        { status: 403 }
      );
    }

    return NextResponse.json({
      role: adminRecord.role,
      venue_id: adminRecord.venue_id || null,
      first_name: adminRecord.first_name || null,
      last_name: adminRecord.last_name || null,
    });
  } catch (err) {
    console.error("Admin auth error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

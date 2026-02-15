// POST /api/admin/bootstrap
// Auto-promotes the authenticated user to "owner" if admin_users table is empty.
// Accepts { access_token } in the body.
// Uses the service-role key so RLS is bypassed.

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

    // 1. Verify the access token with Supabase Auth
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
        { error: "Not authenticated" },
        { status: 401 }
      );
    }

    // 2. Use service-role client to bypass RLS
    const adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // 3. Check if admin_users table has any rows
    const { count, error: countError } = await adminClient
      .from("admin_users")
      .select("id", { count: "exact", head: true });

    if (countError) {
      return NextResponse.json(
        { error: "Failed to query admin_users: " + countError.message },
        { status: 500 }
      );
    }

    if ((count ?? 0) > 0) {
      // Admin users already exist — don't auto-promote
      return NextResponse.json(
        { error: "Admin users already exist. Ask an existing owner to add you." },
        { status: 403 }
      );
    }

    // 4. Table is empty — promote this user to owner
    const { error: insertError } = await adminClient
      .from("admin_users")
      .insert({
        id: user.id,
        email: user.email,
        role: "owner",
      });

    if (insertError) {
      return NextResponse.json(
        { error: "Failed to create admin record: " + insertError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ role: "owner", bootstrapped: true });
  } catch (err) {
    console.error("Bootstrap error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

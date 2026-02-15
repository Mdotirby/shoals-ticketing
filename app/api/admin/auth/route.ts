// POST: look up the authenticated user's admin role
// Uses the service-role key to bypass RLS on admin_users.
// Returns: { role } or 403 if user has no admin record.

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function POST() {
  try {
    // 1. Get the authenticated user from request cookies
    const cookieStore = await cookies();
    const supabaseAuth = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll() {
            // read-only in route handlers
          },
        },
      }
    );

    const {
      data: { user },
      error: userError,
    } = await supabaseAuth.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // 2. Use service-role client to bypass RLS
    const adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // 3. Look up admin_users record
    const { data: adminRecord, error: adminError } = await adminClient
      .from("admin_users")
      .select("role")
      .eq("id", user.id)
      .single();

    if (adminError || !adminRecord) {
      return NextResponse.json(
        { error: "No admin role assigned for this account." },
        { status: 403 }
      );
    }

    return NextResponse.json({ role: adminRecord.role });
  } catch (err) {
    console.error("Admin auth error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

import { createAdminClient } from "@/lib/supabase-server";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

// GET: list all admin users
export async function GET() {
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("admin_users")
    .select("id, email, role, venue_id, first_name, last_name, buyer_name, contract_signatory, buyer_phone, buyer_email, promoter_address, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}

// POST: create a new admin user (creates auth user + admin_users row)
export async function POST(request: Request) {
  const body = await request.json();
  const { email, password, role, venue_id, first_name, last_name } = body;

  if (!email || !password || !role) {
    return NextResponse.json(
      { error: "email, password, and role are required" },
      { status: 400 }
    );
  }

  // Use service role to create auth user
  const authAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  // 1. Create the auth user
  const { data: authData, error: authError } =
    await authAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

  if (authError) {
    return NextResponse.json({ error: authError.message }, { status: 500 });
  }

  // 2. Insert admin_users row
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("admin_users")
    .insert({
      id: authData.user.id,
      email,
      role,
      venue_id: venue_id || null,
      first_name: first_name || null,
      last_name: last_name || null,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}

// PUT: update an admin user's role or venue assignment
export async function PUT(request: Request) {
  const admin = createAdminClient();
  const body = await request.json();
  const { id, role, venue_id } = body;

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  if (role !== undefined) updates.role = role;
  if (venue_id !== undefined) updates.venue_id = venue_id || null;

  const { data, error } = await admin
    .from("admin_users")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

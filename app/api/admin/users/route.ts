import { createAdminClient } from "@/lib/supabase-server";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

// GET: list all admin users
export async function GET() {
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("admin_users")
    .select("id, email, role, venue_id, first_name, last_name, avatar_url, website_url, buyer_name, contract_signatory, buyer_phone, buyer_email, promoter_address, created_at")
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

  if (!role) {
    return NextResponse.json(
      { error: "role is required" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  // Use service role to create auth user
  const authAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  // If no email/password provided, generate placeholder credentials
  // so the auth user exists (FK constraint) but can't actually log in
  const hasCredentials = !!(email && password);
  const authEmail = email || `artist-${crypto.randomUUID()}@placeholder.venuecore.local`;
  const authPassword = password || crypto.randomUUID();

  // 1. Create the auth user
  const { data: authData, error: authError } =
    await authAdmin.auth.admin.createUser({
      email: authEmail,
      password: authPassword,
      email_confirm: true,
    });

  if (authError) {
    const isAlreadyExists =
      authError.message?.toLowerCase().includes("already exists") ||
      authError.message?.toLowerCase().includes("already registered") ||
      authError.status === 422;

    if (isAlreadyExists && email) {
      // Look up existing admin_users row by email first
      const { data: existingAdminUser } = await admin
        .from("admin_users")
        .select("id, role, email, first_name, last_name, venue_id")
        .eq("email", email)
        .maybeSingle();

      if (existingAdminUser) {
        if (existingAdminUser.role !== role) {
          return NextResponse.json(
            { error: `This email is already registered with role "${existingAdminUser.role}"` },
            { status: 409 }
          );
        }
        // Existing user with matching role — return their record so the caller can proceed
        return NextResponse.json(existingAdminUser, { status: 200 });
      }

      // admin_users row missing but auth user exists — find auth user ID then create the row
      const { data: { users: authUsers } } = await authAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      const existingAuthUser = authUsers?.find((u) => u.email === email);

      if (existingAuthUser) {
        const { data: newAdminUser, error: insertError } = await admin
          .from("admin_users")
          .insert({
            id: existingAuthUser.id,
            email,
            role,
            venue_id: venue_id || null,
            first_name: first_name || null,
            last_name: last_name || null,
          })
          .select()
          .single();

        if (insertError) {
          return NextResponse.json({ error: insertError.message }, { status: 500 });
        }
        return NextResponse.json(newAdminUser, { status: 200 });
      }
    }

    return NextResponse.json({ error: authError.message }, { status: 500 });
  }

  // 2. Insert admin_users row
  const { data, error } = await admin
    .from("admin_users")
    .insert({
      id: authData.user.id,
      email: hasCredentials ? email : null,
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

  // Send welcome email only if real credentials were provided
  const resendKey = process.env.RESEND_API_KEY;
  if (resendKey && hasCredentials && email) {
    const ROLE_LABELS: Record<string, string> = {
      owner: "Owner",
      super_admin: "Super Admin",
      venue_admin: "Venue Admin",
      read_only: "Read Only",
      box_office: "Box Office",
      door_greeter: "Door Greeter",
      artist: "Artist",
      partner: "Partner",
      agent: "Agent",
    };
    const roleLabel = ROLE_LABELS[role] || role;
    const displayName = first_name || "there";
    // Deep-links the email/temp password into the login form so there's
    // nothing to copy/retype — the login page reads these params, prefills,
    // then immediately scrubs them from the URL/history (see app/login/page.tsx).
    const loginParams = new URLSearchParams({
      email,
      temp_password: authPassword,
    });
    if (role === "agent") loginParams.set("redirect", "/agent");
    const loginUrl = `https://venuecore.live/login?${loginParams.toString()}`;
    const ctaLabel = role === "agent" ? "Sign In to Agent Portal →" : "Sign In to VenueCore →";
    const CC_EMAIL = "matt.irby@west72ent.com";

    const { sendOnboardingEmail } = await import("@/lib/email/onboarding-email");
    sendOnboardingEmail({
      to: email,
      ccEmail: CC_EMAIL,
      displayName,
      roleLabel,
      tempPassword: authPassword,
      loginUrl,
      ctaLabel,
    }).catch(() => {});
  }

  return NextResponse.json(data, { status: 201 });
}

// DELETE: remove a team member (admin_users row + auth user)
export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const admin = createAdminClient();

  // 1. Delete admin_users row
  const { error: dbError } = await admin
    .from("admin_users")
    .delete()
    .eq("id", id);

  if (dbError) {
    // 23503 = foreign_key_violation. This user has created records elsewhere
    // (a settlement they finalized, an email campaign/template, an ad-engine
    // or deal-lab row, an agent profile — several tables reference
    // admin_users(id) with no ON DELETE action, i.e. RESTRICT) and Postgres
    // is refusing to delete them out from under those rows. Surface that
    // plainly instead of the raw constraint-name error.
    if (dbError.code === "23503") {
      return NextResponse.json(
        {
          error:
            "This user can't be deleted — they're referenced by other records " +
            "(a finalized settlement, an email campaign or template, an ad/deal-lab " +
            "entry, or an agent profile). Remove or reassign those first, or ask an " +
            "engineer to update the reference instead of deleting the account.",
        },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }

  // 2. Delete auth user via service role
  const authAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { error: authError } = await authAdmin.auth.admin.deleteUser(id);
  if (authError) {
    // admin_users row already deleted — log but don't fail
    console.error("Failed to delete auth user:", authError.message);
  }

  return NextResponse.json({ deleted: true });
}

// PUT: update an admin user's role or venue assignment
export async function PUT(request: Request) {
  const admin = createAdminClient();
  const body = await request.json();
  const { id, ...fields } = body;

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  // Handle email + password updates on the auth user
  const newEmail = fields.email;
  const newPassword = fields.new_password;
  delete fields.new_password;
  delete fields.created_at;

  if (newEmail || newPassword) {
    const authAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );
    const authUpdates: Record<string, string> = {};
    if (newEmail) authUpdates.email = newEmail;
    if (newPassword) authUpdates.password = newPassword;
    const { error: authErr } = await authAdmin.auth.admin.updateUserById(id, authUpdates);
    if (authErr) {
      return NextResponse.json({ error: `Auth update failed: ${authErr.message}` }, { status: 500 });
    }
  }

  // Normalize null values
  const updates: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    updates[key] = value === "" ? null : value;
  }

  // Include email in admin_users update if provided
  if (newEmail) updates.email = newEmail;

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

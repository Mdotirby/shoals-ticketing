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
    return NextResponse.json({ error: authError.message }, { status: 500 });
  }

  // 2. Insert admin_users row
  const admin = createAdminClient();
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

    // Role-specific login URL — agents go to the agent portal
    const loginUrl = role === "agent"
      ? "https://venuecore.live/login?redirect=/agent"
      : "https://venuecore.live/login";
    const ctaLabel = role === "agent" ? "Sign In to Agent Portal →" : "Sign In to VenueCore →";

    const welcomeHtml = `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#0b0d1d;font-family:'Helvetica Neue',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0b0d1d;padding:32px 0;">
<tr><td align="center">
<table width="520" style="max-width:520px;width:100%;background:#131629;border-radius:12px;overflow:hidden;border:1px solid rgba(208,194,144,0.15);">
<tr><td style="background:#d0c290;padding:20px 28px;">
<h1 style="margin:0;font-size:22px;color:#0b0d1d;">Welcome to VenueCore</h1>
</td></tr>
<tr><td style="padding:28px;">
<p style="color:rgba(255,255,255,0.7);font-size:15px;line-height:1.6;margin:0 0 16px;">
Hey ${displayName},</p>
<p style="color:rgba(255,255,255,0.7);font-size:15px;line-height:1.6;margin:0 0 16px;">
You've been added to VenueCore as a <strong style="color:#d0c290;">${roleLabel}</strong>. Use the credentials below to sign in and get started.</p>

<!-- Credentials box -->
<table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(208,194,144,0.08);border:1px solid rgba(208,194,144,0.2);border-radius:10px;margin-bottom:24px;">
<tr><td style="padding:18px 20px;">
<p style="margin:0 0 8px;font-size:13px;color:rgba(255,255,255,0.5);text-transform:uppercase;letter-spacing:1px;">Your Login Credentials</p>
<p style="margin:0 0 4px;font-size:15px;color:rgba(255,255,255,0.7);">Email: <strong style="color:#fff;">${email}</strong></p>
<p style="margin:0;font-size:15px;color:rgba(255,255,255,0.7);">Temporary Password: <strong style="color:#d0c290;font-size:16px;">${authPassword}</strong></p>
</td></tr>
</table>

<p style="color:rgba(255,255,255,0.5);font-size:13px;line-height:1.6;margin:0 0 20px;">
We recommend changing your password after your first login.</p>

<table width="100%" style="margin-bottom:20px;"><tr><td align="center">
<a href="${loginUrl}" style="display:inline-block;background:#d0c290;color:#0b0d1d;font-weight:700;padding:14px 36px;border-radius:8px;text-decoration:none;font-size:15px;">${ctaLabel}</a>
</td></tr></table>
<p style="color:rgba(255,255,255,0.3);font-size:12px;line-height:1.6;margin:0;border-top:1px solid rgba(255,255,255,0.06);padding-top:16px;">
If you didn't expect this invitation, you can safely ignore this email. Questions? Contact <a href="mailto:support@venuecore.live" style="color:rgba(208,194,144,0.6);">support@venuecore.live</a></p>
</td></tr>
</table></td></tr></table></body></html>`;

    // Look up owner email for CC so owner gets a copy of every onboarding email
    let ownerEmail: string | null = null;
    try {
      const { data: ownerRecord } = await admin
        .from("admin_users")
        .select("email")
        .eq("role", "owner")
        .limit(1)
        .single();
      if (ownerRecord?.email && ownerRecord.email !== email) {
        ownerEmail = ownerRecord.email;
      }
    } catch { /* ignore — CC is best-effort */ }

    fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "VenueCore <tickets@venuecore.live>",
        to: [email],
        ...(ownerEmail ? { cc: [ownerEmail] } : {}),
        subject: `Welcome to VenueCore — You're a ${roleLabel}`,
        html: welcomeHtml,
      }),
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

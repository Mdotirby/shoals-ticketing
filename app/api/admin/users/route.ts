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
    const loginUrl = role === "agent"
      ? "https://venuecore.live/login?redirect=/agent"
      : "https://venuecore.live/login";
    const ctaLabel = role === "agent" ? "Sign In to Agent Portal →" : "Sign In to VenueCore →";
    const CC_EMAIL = "matt.irby@west72ent.com";

    // Build HTML — try custom template first, fall back to legacy inline HTML
    let welcomeHtml: string;
    try {
      const { loadTransactionalTemplate, replaceVars } = await import("@/lib/email/transactional-templates");
      const { renderDocument } = await import("@/emails/render");
      const doc = await loadTransactionalTemplate(admin, "user_onboarding");
      const rawHtml = await renderDocument(doc);
      welcomeHtml = replaceVars(rawHtml, {
        display_name: displayName,
        email: email,
        role_label: roleLabel,
        temp_password: authPassword,
        login_url: loginUrl,
        cta_label: ctaLabel,
      });
    } catch {
      // Outlook/Apple Mail-safe fallback — mirrors the block-based design
      welcomeHtml = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="x-apple-disable-message-reformatting"><title>Welcome to VenueCore</title></head>
<body style="margin:0;padding:0;background-color:#000000;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#000000;">
<tr><td align="center" style="padding:0;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:#000000;">

  <!-- Logo bar -->
  <tr><td align="center" style="padding:24px 28px 0;background-color:#000000;">
    <a href="https://venuecore.live" style="display:block;text-decoration:none;">
      <img src="https://venuecore.live/West72_Logos/W72_tech_lockup_white.png" alt="West 72 Entertainment" width="260" style="display:block;width:260px;max-width:260px;height:auto;border:0;outline:none;">
    </a>
  </td></tr>

  <!-- Gold accent rule -->
  <tr><td style="padding:16px 0 0;background-color:#000000;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="height:1px;background-color:#d0c290;font-size:0;line-height:0;">&nbsp;</td></tr></table>
  </td></tr>

  <!-- Hero image -->
  <tr><td style="padding:0;background-color:#000000;">
    <img src="https://venuecore.live/hero-images/west72/hero.jpg" alt="West 72 Entertainment" width="600" style="display:block;width:100%;max-width:600px;height:auto;border:0;outline:none;">
  </td></tr>

  <!-- Heading -->
  <tr><td align="center" style="padding:28px 28px 8px;background-color:#000000;">
    <h1 style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:36px;font-weight:800;line-height:1.1;letter-spacing:-0.02em;color:#ffffff;text-align:center;">Welcome to VenueCore</h1>
  </td></tr>

  <!-- Sub-heading -->
  <tr><td align="center" style="padding:8px 28px 4px;background-color:#000000;">
    <p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:rgba(255,255,255,0.75);text-align:center;">
      Hey ${displayName}, you&rsquo;ve been added as a <span style="color:#d0c290;font-weight:700;">${roleLabel}</span>.
    </p>
  </td></tr>

  <!-- Instructions -->
  <tr><td align="center" style="padding:8px 28px 20px;background-color:#000000;">
    <p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:rgba(255,255,255,0.75);text-align:center;">
      Use the credentials below to sign in and get started. We recommend changing your password after your first login.
    </p>
  </td></tr>

  <!-- Credentials card -->
  <tr><td style="padding:0 28px 16px;background-color:#000000;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
           style="background-color:rgba(255,255,255,0.04);border:1px solid rgba(208,194,144,0.2);border-radius:12px;">
      <tr><td style="padding:18px 20px;">
        <p style="margin:0 0 12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#d0c290;">Your Login Credentials</p>
        <p style="margin:0 0 6px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:15px;line-height:1.5;color:rgba(255,255,255,0.8);">Email: ${email}</p>
        <p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:15px;line-height:1.5;color:rgba(255,255,255,0.8);">Temporary Password: <strong style="color:#d0c290;">${authPassword}</strong></p>
      </td></tr>
    </table>
  </td></tr>

  <!-- CTA button — bg on <td> for Outlook -->
  <tr><td align="center" style="padding:8px 24px 24px;background-color:#000000;">
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;">
      <tr>
        <td align="center" style="background-color:#d0c290;border-radius:10px;">
          <a href="${loginUrl}" style="display:inline-block;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:15px;font-weight:700;color:#000000;text-decoration:none;padding-top:14px;padding-bottom:14px;padding-left:36px;padding-right:36px;letter-spacing:0.2px;">
            ${ctaLabel}
          </a>
        </td>
      </tr>
    </table>
  </td></tr>

  <!-- Fine print -->
  <tr><td align="center" style="padding:4px 28px 20px;background-color:#000000;">
    <p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:13px;line-height:1.6;color:rgba(255,255,255,0.4);text-align:center;">
      If you didn&rsquo;t expect this invitation, you can safely ignore this email.<br>
      Questions? Contact <a href="mailto:support@venuecore.live" style="color:rgba(208,194,144,0.6);text-decoration:none;">support@venuecore.live</a>
    </p>
  </td></tr>

  <!-- Gold divider + footer -->
  <tr><td style="padding:0 28px;background-color:#000000;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="height:1px;background-color:rgba(208,194,144,0.25);font-size:0;line-height:0;">&nbsp;</td></tr></table>
  </td></tr>
  <tr><td align="center" style="padding:18px 28px 26px;background-color:#000000;">
    <p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:12px;line-height:1.6;color:rgba(255,255,255,0.3);text-align:center;">
      Sent by <strong style="color:rgba(255,255,255,0.6);">VenueCore</strong> because you were invited to join the platform.
    </p>
  </td></tr>

</table>
</td></tr>
</table>
</body></html>`;
    }

    fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "VenueCore <onboarding@west72ent.com>",
        to: [email],
        cc: email !== CC_EMAIL ? [CC_EMAIL] : [],
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

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

  // Send welcome email
  const resendKey = process.env.RESEND_API_KEY;
  if (resendKey && email) {
    const welcomeHtml = `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#0b0d1d;font-family:'Helvetica Neue',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0b0d1d;padding:32px 0;">
<tr><td align="center">
<table width="520" style="max-width:520px;width:100%;background:#131629;border-radius:12px;overflow:hidden;border:1px solid rgba(208,194,144,0.15);">
<tr><td style="background:#d0c290;padding:20px 28px;">
<h1 style="margin:0;font-size:22px;color:#0b0d1d;">Welcome to VenueCore 🎶</h1>
</td></tr>
<tr><td style="padding:28px;">
<p style="color:rgba(255,255,255,0.7);font-size:15px;line-height:1.6;margin:0 0 16px;">
Hi${first_name ? ' ' + first_name : ''},</p>
<p style="color:rgba(255,255,255,0.7);font-size:15px;line-height:1.6;margin:0 0 16px;">
You've been invited to join VenueCore — the all-in-one platform for live event ticketing, settlements, and venue management.</p>
<p style="color:rgba(255,255,255,0.7);font-size:15px;line-height:1.6;margin:0 0 16px;">
Your account has been created with the role: <strong style="color:#d0c290;">${role}</strong></p>
<p style="color:rgba(255,255,255,0.7);font-size:15px;line-height:1.6;margin:0 0 20px;">
You can sign in using your email and the temporary password provided by your administrator. You'll be prompted to set a new password on first login.</p>
<table width="100%" style="margin-bottom:20px;"><tr><td align="center">
<a href="https://venuecore.live/login" style="display:inline-block;background:#d0c290;color:#0b0d1d;font-weight:700;padding:12px 32px;border-radius:8px;text-decoration:none;font-size:14px;">Sign In to VenueCore</a>
</td></tr></table>
<p style="color:rgba(255,255,255,0.3);font-size:12px;line-height:1.6;margin:0;border-top:1px solid rgba(255,255,255,0.06);padding-top:16px;">
If you didn't expect this invitation, you can safely ignore this email. Questions? Contact <a href="mailto:support@venuecore.live" style="color:rgba(208,194,144,0.6);">support@venuecore.live</a></p>
</td></tr>
</table></td></tr></table></body></html>`;

    fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "VenueCore <tickets@venuecore.live>",
        to: [email],
        subject: "Welcome to VenueCore 🎶",
        html: welcomeHtml,
      }),
    }).catch(() => {});
  }

  return NextResponse.json(data, { status: 201 });
}

// PUT: update an admin user's role or venue assignment
export async function PUT(request: Request) {
  const admin = createAdminClient();
  const body = await request.json();
  const { id, ...fields } = body;

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  // Remove fields that shouldn't be updated
  delete fields.email;
  delete fields.created_at;

  // Normalize null values
  const updates: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    updates[key] = value === "" ? null : value;
  }

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

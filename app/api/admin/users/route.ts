import { requireCapability } from "@/lib/auth/can";
import { createAdminClient } from "@/lib/supabase-server";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { roleLabel, canSetRole, normalizeRole, EXTERNAL_IDENTITIES } from "@/lib/auth/roles";
import { tenantScope, venueInTenant, DENY } from "@/lib/auth/tenant";
import { staffHomeUrl } from "@/lib/auth/hostTenant";
import { writeAudit } from "@/lib/auth/audit";

// GET: list all admin users
export async function GET() {
  const guard = await requireCapability("assign_roles");
  if (!guard.ok) return guard.response;

  const admin = createAdminClient();

  // Only the owner sees every tenant's staff. Artists and agents with no venue
  // stay listed, because shows at any venue assign them from this list.
  const scope = tenantScope(guard.actor);
  const unassignedExternal = `and(venue_id.is.null,role.in.(${EXTERNAL_IDENTITIES.join(",")}))`;

  let query = admin
    .from("admin_users")
    // The default_* columns are the owner's offer defaults, edited in Venue
    // settings and read by /admin/offers/new. They were never returned here,
    // so the editor could not show what was already set.
    .select("id, email, role, venue_id, first_name, last_name, avatar_url, website_url, buyer_name, contract_signatory, buyer_phone, buyer_email, promoter_address, default_radius_distance, default_radius_days_prior, default_radius_days_after, default_ticketing_fee, created_at")
    .order("created_at", { ascending: false });

  if (scope === DENY) query = query.or(unassignedExternal);
  else if (scope !== null) query = query.or(`venue_id.eq.${scope},${unassignedExternal}`);

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}

// POST: create a new admin user (creates auth user + admin_users row)
export async function POST(request: Request) {
  const guard = await requireCapability("assign_roles", { write: true });
  if (!guard.ok) return guard.response;

  const body = await request.json();
  const { email, password, role, venue_id, first_name, last_name } = body;

  if (!role) {
    return NextResponse.json(
      { error: "role is required" },
      { status: 400 }
    );
  }

  if (typeof role !== "string" || !canSetRole(guard.actor, role)) {
    return NextResponse.json(
      { error: "You cannot give someone that access level." },
      { status: 403 }
    );
  }

  // The new person lands in the actor's own venue, whatever the request said.
  const scope = tenantScope(guard.actor, venue_id);
  if (scope === DENY) {
    return NextResponse.json({ error: "Your account isn't assigned to a venue." }, { status: 403 });
  }
  const level = normalizeRole(role).level;
  const assignedVenue = scope ?? (level && level !== "owner" ? guard.actor.venueId : null);
  // Staff with no venue can't sign in anywhere (lib/auth/hostTenant.ts).
  if (level && level !== "owner" && !assignedVenue) {
    return NextResponse.json({ error: "Choose a venue for this person." }, { status: 400 });
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
        // Someone at another venue: say no more than that the address is taken.
        if (!venueInTenant(guard.actor, existingAdminUser.venue_id)) {
          return NextResponse.json({ error: "This email is already registered." }, { status: 409 });
        }
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
            venue_id: assignedVenue,
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
      venue_id: assignedVenue,
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
    // Was a fourth copy of the role taxonomy, and one that had drifted — it
    // listed super_admin and door_greeter as their own labels and omitted
    // full_admin and promoter entirely. roleLabel() in lib/auth/roles is the
    // single source now, and it resolves legacy strings to their canonical
    // label rather than echoing them back.
    const roleLabelText = roleLabel(role);
    const displayName = first_name || "there";
    // Deep-links the email/temp password into the login form so there's
    // nothing to copy/retype — the login page reads these params, prefills,
    // then immediately scrubs them from the URL/history (see app/login/page.tsx).
    const loginParams = new URLSearchParams({
      email,
      temp_password: authPassword,
    });
    if (role === "agent") loginParams.set("redirect", "/agent");
    // Staff sign in on their own venue's site; a link elsewhere would redirect
    // them and lose these params. Owners, agents and artists have no such site.
    let loginOrigin = "https://venuecore.live";
    if (level && level !== "owner" && assignedVenue) {
      const { data: venue } = await admin
        .from("venues")
        .select("id, slug, custom_domain")
        .eq("id", assignedVenue)
        .maybeSingle();
      loginOrigin = staffHomeUrl(venue) ?? loginOrigin;
    }
    const loginUrl = `${loginOrigin}/login?${loginParams.toString()}`;
    const ctaLabel = role === "agent" ? "Sign In to Agent Portal →" : "Sign In to VenueCore →";
    const CC_EMAIL = "matt.irby@west72ent.com";

    const { sendOnboardingEmail } = await import("@/lib/email/onboarding-email");
    sendOnboardingEmail({
      to: email,
      ccEmail: CC_EMAIL,
      displayName,
      roleLabel: roleLabelText,
      tempPassword: authPassword,
      loginUrl,
      ctaLabel,
    }).catch(() => {});
  }

  return NextResponse.json(data, { status: 201 });
}

// DELETE: remove a team member (admin_users row + auth user)
export async function DELETE(request: Request) {
  const guard = await requireCapability("assign_roles", { write: true });
  if (!guard.ok) return guard.response;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  if (id === guard.actor.id) {
    return NextResponse.json({ error: "You can't remove your own account." }, { status: 403 });
  }

  const admin = createAdminClient();

  const { data: target } = await admin
    .from("admin_users")
    .select("role, venue_id")
    .eq("id", id)
    .maybeSingle();

  if (!target || !venueInTenant(guard.actor, target.venue_id)) {
    return NextResponse.json({ error: "No such user at your venue." }, { status: 404 });
  }
  if (!canSetRole(guard.actor, target.role)) {
    return NextResponse.json(
      { error: "That account is at or above your access level." },
      { status: 403 }
    );
  }

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
  const guard = await requireCapability("assign_roles", { write: true });
  if (!guard.ok) return guard.response;

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

  const { data: target } = await admin
    .from("admin_users")
    .select("role, venue_id")
    .eq("id", id)
    .maybeSingle();

  if (!target) {
    return NextResponse.json({ error: "No such user." }, { status: 404 });
  }

  // Your own row: profile, defaults and password, but never your own access.
  const isSelf = id === guard.actor.id;
  if (isSelf) {
    if (typeof fields.role === "string" && fields.role !== target.role) {
      return NextResponse.json({ error: "You cannot change your own access level." }, { status: 403 });
    }
  } else {
    if (!venueInTenant(guard.actor, target.venue_id)) {
      return NextResponse.json({ error: "No such user at your venue." }, { status: 404 });
    }
    // Seniority, not just capability. Holding `assign_roles` is not the same as
    // outranking the person you are editing: without this any venue admin could
    // set an owner's password and take the account.
    if (!canSetRole(guard.actor, target.role)) {
      return NextResponse.json(
        { error: "That account is at or above your access level." },
        { status: 403 }
      );
    }
  }

  // Assigning a level you may not set is the same problem from the other side:
  // promoting someone to your own level is promoting yourself by proxy.
  if (!isSelf && fields.role !== undefined && fields.role !== target.role && (typeof fields.role !== "string" || !canSetRole(guard.actor, fields.role))) {
    return NextResponse.json(
      { error: "You cannot give someone that access level." },
      { status: 403 }
    );
  }

  // Moving someone between venues is the owner's call. An empty value would
  // orphan them, so it counts as a move.
  if (fields.venue_id !== undefined && (fields.venue_id || null) !== target.venue_id && tenantScope(guard.actor) !== null) {
    return NextResponse.json({ error: "You cannot move someone to that venue." }, { status: 403 });
  }

  // A password set here is set. It is NOT emailed to anyone — the onboarding
  // mail is sent on CREATE, with credentials the admin chose to send. An
  // override is a support action, usually with the person already on the
  // phone, and a surprise credential email reads as a phishing attempt.
  const overrodePassword = !!newPassword;

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

  await writeAudit(guard.actor, {
    action: overrodePassword ? "user.password_overridden" : "user.updated",
    targetType: "admin_user",
    targetId: id,
    detail: {
      fields: Object.keys(updates),
      email_changed: !!newEmail,
      password_overridden: overrodePassword,
    },
  });

  return NextResponse.json(data);
}

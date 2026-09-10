import { createClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase-server";
import { requireCapability } from "@/lib/auth/can";
import { canEditRole } from "@/lib/auth/roles";
import { writeAudit } from "@/lib/auth/audit";
import { NextResponse } from "next/server";

/**
 * POST /api/admin/users/[id]/recovery-link
 *
 * Mints a one-time password-recovery link and RETURNS it. It does not send it.
 *
 * ── WHY IT RETURNS RATHER THAN EMAILS ──────────────────────────────────────
 * Matt's rule for this screen: an admin acting on someone's credentials does
 * not silently email them. A reset link that arrives unannounced reads as a
 * phishing attempt to the person receiving it, and the admin doing the reset
 * is usually standing next to them or already on the phone. Handing the link
 * back lets it go by whatever channel the two of them are already using.
 *
 * It also does not pretend: Resend is configured for ticket and onboarding
 * mail, but nothing here can promise a reset mail landed. Returning the link
 * cannot fail silently.
 *
 * The link is Supabase's own recovery link and expires on their schedule.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireCapability("assign_roles", { write: true });
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const admin = createAdminClient();

  const { data: target } = await admin
    .from("admin_users")
    .select("id, email, role, first_name, last_name")
    .eq("id", id)
    .maybeSingle();

  if (!target?.email) {
    return NextResponse.json({ error: "No user, or no email on file" }, { status: 404 });
  }

  // Seniority: you may not mint a recovery link for a peer or a senior. Holding
  // `assign_roles` is not the same as outranking the person you are acting on —
  // without this, any venue admin could take over an owner account.
  if (!canEditRole(guard.actor.role, target.role)) {
    return NextResponse.json(
      { error: "That account is at or above your access level." },
      { status: 403 }
    );
  }

  const authAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { data, error } = await authAdmin.auth.admin.generateLink({
    type: "recovery",
    email: target.email,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await writeAudit(guard.actor, {
    action: "user.recovery_link_generated",
    targetType: "admin_user",
    targetId: id,
    detail: { target_email: target.email, target_role: target.role },
  });

  return NextResponse.json({
    link: data.properties?.action_link ?? null,
    email: target.email,
  });
}

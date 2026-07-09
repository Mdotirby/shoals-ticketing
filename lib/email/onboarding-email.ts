// Staff/agent/venue-admin welcome email — sent by app/api/admin/users/route.ts
// when a new admin_users row is created with real login credentials.
//
// Renders lib/email/OnboardingEmail.tsx directly (a bespoke React Email
// component matching "onboarding email.psd"). Previously routed through the
// DB-backed block composer (transactional-templates.ts) — same limitation
// as ticket_delivery before it: that system's block components can't pixel-
// match a specific design. That composer/DB row still exists (the
// transactional editor UI is still reachable at /admin/broadcasts/transactional)
// but is no longer read here.
import { render } from "@react-email/components";
import { OnboardingEmail, articleFor } from "./OnboardingEmail";

export async function sendOnboardingEmail({
  to,
  ccEmail,
  displayName,
  roleLabel,
  tempPassword,
  loginUrl,
  ctaLabel,
}: {
  to: string;
  ccEmail?: string;
  displayName: string;
  roleLabel: string;
  tempPassword: string;
  loginUrl: string;
  ctaLabel: string;
}): Promise<{ success: boolean; error?: string }> {
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    console.warn("RESEND_API_KEY not set — skipping onboarding email");
    return { success: false, error: "RESEND_API_KEY not configured" };
  }

  const html = await render(
    OnboardingEmail({
      displayName,
      roleLabel,
      email: to,
      tempPassword,
      loginUrl,
      ctaLabel,
      previewText: `Hey ${displayName}, you've been added as ${articleFor(roleLabel)} ${roleLabel}!`,
    }),
  );

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "VenueCore <onboarding@west72ent.com>",
      to: [to],
      cc: ccEmail && ccEmail !== to ? [ccEmail] : [],
      subject: `Welcome to VenueCore — You're ${articleFor(roleLabel)} ${roleLabel}`,
      html,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error("Resend onboarding email failed:", err);
    return { success: false, error: err };
  }

  return { success: true };
}

/**
 * Default EmailDocument block layouts for transactional emails.
 *
 * These pre-seed the editor when no custom template has been saved yet.
 * Once the user saves a custom version, it takes over and these are ignored.
 *
 * Also exports:
 *   TRANSACTIONAL_TEMPLATE_META  — labels/descriptions for the index UI
 *   SAMPLE_DATA                  — fake context used for editor preview
 *   replaceVars                  — simple {{key}} → value substitution
 *   loadTransactionalTemplate    — DB lookup with fallback
 */

import type { EmailDocument } from "@/emails/email-document";
import type { SupabaseClient } from "@supabase/supabase-js";

// ── Registry ───────────────────────────────────────────────────────

// ticket_delivery removed — that email is now a bespoke React Email
// component (lib/email/TicketDeliveryEmail.tsx) rendered directly by
// lib/email/ticket-email.ts, not this DB-backed block composer. See
// lib/email/ticket-email.ts's header comment for why.
export type TransactionalTemplateKey = "user_onboarding";

export const TRANSACTIONAL_TEMPLATE_META: Record<
  TransactionalTemplateKey,
  { label: string; description: string; variables: string[] }
> = {
  user_onboarding: {
    label: "User Onboarding",
    description: "Sent to any new user receiving login credentials — agents, artists, venue admins, partners.",
    variables: [
      "{{display_name}}",
      "{{email}}",
      "{{role_label}}",
      "{{temp_password}}",
      "{{login_url}}",
      "{{cta_label}}",
    ],
  },
};

// ── Sample data (editor preview only) ─────────────────────────────

export const SAMPLE_DATA: Record<TransactionalTemplateKey, Record<string, string>> = {
  user_onboarding: {
    display_name: "Sarah",
    email: "sarah@agency.com",
    role_label: "Agent",
    temp_password: "yourpassword123",
    login_url: "https://venuecore.live/login?redirect=/agent",
    cta_label: "Sign In to Your Portal →",
  },
};

// ── Default block layouts ──────────────────────────────────────────

const USER_ONBOARDING_DEFAULT: EmailDocument = {
  version: "block-v1",
  bg_color: "#000000",
  blocks: [
    // ── Logo bar ───────────────────────────────────────────────────
    {
      id: "uo-logo",
      type: "image",
      props: {
        src: "https://venuecore.live/West72_Logos/W72_tech_lockup_white.png",
        alt: "West 72 Entertainment",
        width: 260,
        link_url: "https://venuecore.live",
        bg_color: "#000000",
        align: "center",
      },
    },
    // Thin gold accent line below logo
    {
      id: "uo-logo-rule",
      type: "divider",
      props: { color: "#d0c290", margin_top: 0, margin_bottom: 0 },
    },
    // ── Hero concert photo ─────────────────────────────────────────
    {
      id: "uo-hero",
      type: "image",
      props: {
        // Supabase storage URL — swap to your bucket path in the editor
        src: "https://venuecore.live/hero-images/west72/hero.jpg",
        alt: "West 72 Entertainment",
        width: 640,
        link_url: "",
        bg_color: "#000000",
        align: "center",
      },
    },
    // ── Heading ────────────────────────────────────────────────────
    {
      id: "uo-heading",
      type: "heading",
      props: {
        text: "Welcome to VenueCore",
        level: "h1",
        color: "#ffffff",
        align: "center",
        size: 36,
      },
    },
    // Sub-heading as text block — uses gold for the role label via variable
    {
      id: "uo-subheading",
      type: "text",
      props: {
        content: "Hey {{display_name}}, you've been added as a {{role_label}}.",
      },
    },
    {
      id: "uo-instructions",
      type: "text",
      props: {
        content: "Use the credentials below to sign in and get started. We recommend changing your password after your first login.",
      },
    },
    // ── Credentials card ───────────────────────────────────────────
    {
      id: "uo-credentials",
      type: "info_card",
      props: {
        heading: "Your Login Credentials",
        accent_color: "#d0c290",
        lines: "Email: {{email}}\nTemporary Password: {{temp_password}}",
      },
    },
    {
      id: "uo-spacer-1",
      type: "spacer",
      props: { height: 8 },
    },
    // ── CTA button — gold fill, black text, Outlook-safe ──────────
    {
      id: "uo-cta",
      type: "button",
      props: {
        label: "{{cta_label}}",
        url: "{{login_url}}",
        bg_color: "#d0c290",
        text_color: "#000000",
        align: "center",
      },
    },
    // ── Fine print ─────────────────────────────────────────────────
    {
      id: "uo-disclaimer",
      type: "text",
      props: {
        content: "If you didn't expect this invitation, you can safely ignore this email. Questions? Contact support@venuecore.live",
      },
    },
    // Gold divider before footer
    {
      id: "uo-footer-rule",
      type: "divider",
      props: { color: "rgba(208,194,144,0.25)", margin_top: 8, margin_bottom: 0 },
    },
    {
      id: "uo-footer",
      type: "footer",
      props: {
        venue_name: "West 72 Entertainment",
        reason: "because you were invited to join the platform.",
        unsubscribe_url: "",
      },
    },
  ],
};

export const DEFAULT_DOCUMENTS: Record<TransactionalTemplateKey, EmailDocument> = {
  user_onboarding: USER_ONBOARDING_DEFAULT,
};

// ── DB loader with fallback ────────────────────────────────────────

export async function loadTransactionalTemplate(
  client: SupabaseClient,
  key: TransactionalTemplateKey,
): Promise<EmailDocument> {
  const { data } = await client
    .from("transactional_email_templates")
    .select("body_json")
    .eq("key", key)
    .maybeSingle();

  return (data?.body_json as EmailDocument) ?? DEFAULT_DOCUMENTS[key];
}

// ── Variable substitution ──────────────────────────────────────────

export function replaceVars(html: string, vars: Record<string, string>): string {
  let result = html;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replaceAll(`{{${key}}}`, value ?? "");
  }
  return result;
}

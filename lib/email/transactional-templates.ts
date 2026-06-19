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

export type TransactionalTemplateKey = "ticket_delivery" | "user_onboarding";

export const TRANSACTIONAL_TEMPLATE_META: Record<
  TransactionalTemplateKey,
  { label: string; description: string; variables: string[] }
> = {
  ticket_delivery: {
    label: "Ticket Delivery",
    description: "Sent automatically when a ticket purchase completes.",
    variables: [
      "{{first_name}}",
      "{{event_title}}",
      "{{event_date}}",
      "{{event_venue}}",
      "{{ticket_count}}",
      "{{total_amount}}",
      "{{ticket_url}}",
      "{{event_image}}",
    ],
  },
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
  ticket_delivery: {
    first_name: "Alex",
    event_title: "Friday Night at the Venue",
    event_date: "Friday, July 4, 2026 · 8:00 PM",
    event_venue: "Shoals Theatre",
    ticket_count: "2",
    total_amount: "$58.00",
    ticket_url: "https://venuecore.live/tickets/preview",
    event_image: "",
  },
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

const TICKET_DELIVERY_DEFAULT: EmailDocument = {
  version: "block-v1",
  bg_color: "#0b0d1d",
  blocks: [
    {
      id: "td-hero",
      type: "hero",
      props: {
        image_url: "{{event_image}}",
        kicker: "🎟 Your Ticket is Ready",
        title: "{{event_title}}",
        show_meta: false,
        date: "",
        time: "",
        venue: "",
      },
    },
    {
      id: "td-greeting",
      type: "text",
      props: {
        content: "Hey {{first_name}},\n\nYou're all set! Here's everything you need for the show.",
      },
    },
    {
      id: "td-event-card",
      type: "event_card",
      props: {
        title: "{{event_title}}",
        date: "{{event_date}}",
        venue: "{{event_venue}}",
        ticket_count: "{{ticket_count}}",
        total: "{{total_amount}}",
      },
    },
    {
      id: "td-qr-notice",
      type: "info_card",
      props: {
        heading: "Your QR Code Is Your Ticket",
        accent_color: "#d0c290",
        lines: "Present your QR code at the door for entry. Screenshot it, save it to your photos, or print a copy — just have it ready when you arrive.",
      },
    },
    {
      id: "td-cta",
      type: "button",
      props: {
        label: "View My Ticket & QR Code",
        url: "{{ticket_url}}",
        bg_color: "#d0c290",
        text_color: "#0b0d1d",
        align: "center",
      },
    },
    {
      id: "td-divider",
      type: "divider",
      props: { color: "rgba(255,255,255,0.06)", margin_top: 8, margin_bottom: 8 },
    },
    {
      id: "td-fine-print",
      type: "text",
      props: {
        content: "All sales are final. Refunds are only issued if the event is cancelled by the organizer. Questions? Contact support@west72ent.com",
      },
    },
    {
      id: "td-footer",
      type: "footer",
      props: {
        venue_name: "West 72 Entertainment",
        reason: "because you purchased tickets through VenueCore.",
        unsubscribe_url: "",
      },
    },
  ],
};

const USER_ONBOARDING_DEFAULT: EmailDocument = {
  version: "block-v1",
  bg_color: "#0b0d1d",
  blocks: [
    {
      id: "uo-header",
      type: "info_card",
      props: {
        heading: "Welcome to VenueCore",
        accent_color: "#d0c290",
        lines: "Hey {{display_name}}, you've been added as a {{role_label}}.",
      },
    },
    {
      id: "uo-body",
      type: "text",
      props: {
        content: "Use the credentials below to sign in and get started. We recommend changing your password after your first login.",
      },
    },
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
      id: "uo-cta",
      type: "button",
      props: {
        label: "{{cta_label}}",
        url: "{{login_url}}",
        bg_color: "#d0c290",
        text_color: "#0b0d1d",
        align: "center",
      },
    },
    {
      id: "uo-disclaimer",
      type: "text",
      props: {
        content: "If you didn't expect this invitation, you can safely ignore this email. Questions? Contact support@venuecore.live",
      },
    },
    {
      id: "uo-footer",
      type: "footer",
      props: {
        venue_name: "VenueCore",
        reason: "because you were invited to join the platform.",
        unsubscribe_url: "",
      },
    },
  ],
};

export const DEFAULT_DOCUMENTS: Record<TransactionalTemplateKey, EmailDocument> = {
  ticket_delivery: TICKET_DELIVERY_DEFAULT,
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

/**
 * Email Engine — starter template library.
 *
 * These are inline-styled, mobile-safe email layouts that cover the most
 * common venue-marketing use cases. Operators pick one in the new-campaign
 * page, tweak copy, and send. Variables follow the standard renderer syntax.
 *
 * Every template uses:
 *   • 600px max width, centered
 *   • Inline CSS only (no <style> blocks — many clients strip them)
 *   • System font stack
 *   • Dark-mode tolerant neutral colors
 *   • Single primary CTA button
 *   • {{variables}} that the renderer already supports
 */

export type EmailTemplate = {
  key: string;
  name: string;
  category:
    | "event_announcement"
    | "cart_recovery"
    | "post_event"
    | "presale"
    | "welcome"
    | "reengagement";
  description: string;
  /** Default subject line */
  subject: string;
  /** Inbox preview text (preheader) */
  preview_text: string;
  content_html: string;
  content_text: string;
  /** Automation trigger key this template was designed for, if any */
  suggested_trigger?:
    | "new_event_announcement" | "cart_abandonment" | "post_event_followup"
    | "repeat_buyer_nurture" | "welcome_series" | "reengagement";
};

// ───── Reusable partials (kept here so tweaks stay in one place) ────────
const WRAP_OPEN = `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#f7f6f2;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1b1b1b;line-height:1.55">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f6f2;padding:24px 12px">
  <tr><td align="center">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.05)">`;
const WRAP_CLOSE = `    </table>
  </td></tr>
</table>
</body></html>`;

function hero(image: string): string {
  return `<tr><td>
    <img src="${image}" alt="" width="600" style="display:block;width:100%;max-width:600px;height:auto;border:0">
  </td></tr>`;
}

function heroConditional(): string {
  // Only renders if {{event_image}} is a non-empty string (our renderer
  // leaves it empty otherwise, and our dispatcher strips empty <img> tags
  // — see campaignBuilder/renderer logic).
  return `<tr><td>
    <img src="{{event_image}}" alt="" width="600" style="display:block;width:100%;max-width:600px;height:auto;border:0">
  </td></tr>`;
}

function ctaButton(label: string, href: string): string {
  return `<tr><td align="center" style="padding:8px 24px 32px">
    <a href="${href}" style="display:inline-block;background:#111;color:#fff;
       text-decoration:none;padding:14px 28px;border-radius:8px;font-weight:600;
       font-size:15px;letter-spacing:0.2px">${label}</a>
  </td></tr>`;
}

function bodySection(inner: string): string {
  return `<tr><td style="padding:28px 28px 4px;color:#1b1b1b;font-size:15px">
    ${inner}
  </td></tr>`;
}

function heading(text: string): string {
  return `<tr><td style="padding:28px 28px 0;color:#111;font-size:22px;font-weight:700;line-height:1.25">
    ${text}
  </td></tr>`;
}

function meta(text: string): string {
  return `<tr><td style="padding:4px 28px 0;color:#666;font-size:13px">
    ${text}
  </td></tr>`;
}

// ───── Templates ────────────────────────────────────────────────────────
export const EMAIL_TEMPLATES: EmailTemplate[] = [
  {
    key: "event_announcement_v1",
    name: "New Event Announcement",
    category: "event_announcement",
    description: "Clean hero + headline + date + CTA. Best for freshly-announced shows.",
    suggested_trigger: "new_event_announcement",
    subject: "Just announced: {{event_name}}",
    preview_text: "New show at {{venue_name}} — {{event_date}}",
    content_html:
      WRAP_OPEN +
      heroConditional() +
      heading("Just announced: {{event_name}}") +
      meta("{{event_date}} · {{venue_name}}") +
      bodySection("<p>Hi {{first_name}}, we're excited to share this one with you. Tickets on sale now — quantities tend to go quickly.</p>") +
      ctaButton("Get tickets", "https://venuecore.live/events/{{event_id}}") +
      WRAP_CLOSE,
    content_text:
      "Just announced: {{event_name}}\n{{event_date}} · {{venue_name}}\n\n" +
      "Hi {{first_name}}, we're excited to share this one with you. Tickets on sale now.\n\n" +
      "https://venuecore.live/events/{{event_id}}",
  },

  {
    key: "cart_recovery_v1",
    name: "Cart Recovery — single event",
    category: "cart_recovery",
    description: "Nudge buyers who started checkout but didn't finish. Warm, friendly tone.",
    suggested_trigger: "cart_abandonment",
    subject: "You were this close to {{event_name}}",
    preview_text: "Your tickets are still waiting — grab them before they're gone.",
    content_html:
      WRAP_OPEN +
      heroConditional() +
      heading("Still thinking it over?") +
      meta("{{event_name}} · {{event_date}}") +
      bodySection(
        "<p>Hey {{first_name}}, looks like you started checkout for <strong>{{event_name}}</strong> but didn't finish. No pressure — but these sell out.</p>" +
        "<p style='color:#666;font-size:13px'>If it's no longer a fit, you can ignore this email.</p>"
      ) +
      ctaButton("Finish checkout", "https://venuecore.live/events/{{event_id}}") +
      WRAP_CLOSE,
    content_text:
      "Still thinking it over?\n{{event_name}} · {{event_date}}\n\n" +
      "Hey {{first_name}}, looks like you started checkout for {{event_name}} but didn't finish. No pressure, but these sell out.\n\n" +
      "https://venuecore.live/events/{{event_id}}",
  },

  {
    key: "post_event_followup_v1",
    name: "Post-Event Thanks + Next Show",
    category: "post_event",
    description: "Thank the attendee and cross-promote the next show. Lifts repeat-purchase rate.",
    suggested_trigger: "post_event_followup",
    subject: "Thanks for coming to {{event_name}}",
    preview_text: "Quick thank-you, plus what's next at {{venue_name}}",
    content_html:
      WRAP_OPEN +
      heading("Thanks for coming out, {{first_name}}") +
      meta("{{event_name}} · {{venue_name}}") +
      bodySection(
        "<p>We hope you had a great night. A short survey helps us keep shows like this coming.</p>" +
        "<p style='margin:22px 0 4px;font-weight:600'>What's on next</p>" +
        "<p style='color:#666;font-size:13px'>Keep an eye on the calendar — we just added a few new dates.</p>"
      ) +
      ctaButton("See upcoming shows", "https://venuecore.live/events") +
      WRAP_CLOSE,
    content_text:
      "Thanks for coming out, {{first_name}}\n{{event_name}} · {{venue_name}}\n\n" +
      "We hope you had a great night. See what's coming up next:\n\n" +
      "https://venuecore.live/events",
  },

  {
    key: "vip_presale_v1",
    name: "VIP / Presale",
    category: "presale",
    description: "Announce exclusive presale window to repeat buyers / FWB subscribers.",
    suggested_trigger: "repeat_buyer_nurture",
    subject: "VIP presale access — {{event_name}}",
    preview_text: "You're on the list. Presale opens now.",
    content_html:
      WRAP_OPEN +
      heroConditional() +
      heading("Before anyone else.") +
      meta("{{event_name}} · {{event_date}} · Presale open now") +
      bodySection(
        "<p>{{first_name}}, you've been one of our most loyal regulars — so you get first crack at this one.</p>" +
        "<p>Presale runs for 48 hours before public on-sale.</p>"
      ) +
      ctaButton("Unlock presale", "https://venuecore.live/events/{{event_id}}?code=VIP") +
      WRAP_CLOSE,
    content_text:
      "Before anyone else — {{event_name}}\n{{event_date}}\n\n" +
      "{{first_name}}, you've been one of our most loyal regulars, so you get first crack at this one. Presale runs for 48 hours.\n\n" +
      "https://venuecore.live/events/{{event_id}}?code=VIP",
  },

  {
    key: "welcome_series_v1",
    name: "Welcome — Intro",
    category: "welcome",
    description: "First touch after newsletter signup. Sets expectations, drops one CTA to the calendar.",
    suggested_trigger: "welcome_series",
    subject: "Welcome to {{venue_name}}",
    preview_text: "Here's what to expect from us — and what's on.",
    content_html:
      WRAP_OPEN +
      heading("Welcome in, {{first_name}}.") +
      bodySection(
        "<p>Thanks for joining the list. A few things to know:</p>" +
        "<ul style='padding-left:20px;color:#333;font-size:14px;line-height:1.7'>" +
        "<li>You'll get early access to new show announcements.</li>" +
        "<li>Occasional presale windows before public on-sale.</li>" +
        "<li>We won't spam you — a few emails a month, tops.</li>" +
        "</ul>" +
        "<p>To kick things off, here's what's coming up:</p>"
      ) +
      ctaButton("Browse upcoming shows", "https://venuecore.live/events") +
      WRAP_CLOSE,
    content_text:
      "Welcome in, {{first_name}}.\n\n" +
      "Thanks for joining the list. You'll get early access to show announcements, occasional presales, and no spam. See what's coming up:\n\n" +
      "https://venuecore.live/events",
  },

  {
    key: "reengagement_v1",
    name: "Re-engagement",
    category: "reengagement",
    description: "Win back dormant buyers / non-openers. One honest line + one CTA.",
    suggested_trigger: "reengagement",
    subject: "We'd love to have you back, {{first_name}}",
    preview_text: "Been a while — here's what you've missed.",
    content_html:
      WRAP_OPEN +
      heading("It's been a minute.") +
      bodySection(
        "<p>Hey {{first_name}}, you haven't been to a show at {{venue_name}} in a bit, and we noticed. Here's a quick peek at what's on the calendar right now — no pressure, no hard sell.</p>" +
        "<p style='color:#666;font-size:13px'>If you'd rather hear from us less often, you can update your preferences at the bottom of this email.</p>"
      ) +
      ctaButton("See what's on", "https://venuecore.live/events") +
      WRAP_CLOSE,
    content_text:
      "It's been a minute.\n\n" +
      "Hey {{first_name}}, you haven't been to a show at {{venue_name}} in a bit. Here's what's on — no pressure.\n\n" +
      "https://venuecore.live/events",
  },
];

export function getTemplate(key: string): EmailTemplate | null {
  return EMAIL_TEMPLATES.find((t) => t.key === key) ?? null;
}

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
    | "reengagement"
    | "fwb";
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

/**
 * Landing-page-style New Event Announcement template.
 *
 * This template is deliberately designed to look identical to the public
 * event landing page at /e/[slug]. It mirrors:
 *
 *   • The same navy/blue-grey body (`--vc-bg` = #111827) — not the warm
 *     near-black the first draft used. That earlier choice read "brown"
 *     against the gold accent; this one matches the landing page aesthetic.
 *   • The same hero gradient from `rgba(17, 24, 39, 0.95)` fading into the
 *     body, so the event image and the email background blend cleanly.
 *   • The same countdown format as .lp-countdown — "Tickets on sale in"
 *     label above a gold, tabular-nums "Xd Yh Zm" timer (minus seconds,
 *     which would be wildly stale by the time the recipient opens the
 *     email). Uses {{venue_primary_color}} to inherit the venue's brand.
 *   • The same meta row (calendar / clock / pin) as .lp-meta.
 *   • The same gold CTA button style as .lp-cta-btn.
 *
 * All inline-styled and table-based so Gmail / Outlook / Apple Mail /
 * mobile clients render it correctly. {{event_image}} strips cleanly via
 * the renderer if no image is set on the event.
 */
function eventAnnouncementHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="x-apple-disable-message-reformatting">
  <title>{{event_name}}</title>
</head>
<body style="margin:0;padding:0;background:#111827;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#ffffff;line-height:1.55;-webkit-font-smoothing:antialiased">
<!-- Hidden preheader for inbox previews -->
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;line-height:1">
  You have first dibs. Public on-sale {{on_sale_date_short}} at {{on_sale_time}}.
</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#111827">
  <tr><td align="center" style="padding:24px 12px">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0"
           style="max-width:600px;background:#111827;border-radius:20px;overflow:hidden;border:1px solid rgba(255,255,255,0.09)">

      <!-- HERO: event image + gradient + "Just Announced" kicker + title + meta row
           Mirrors .lp-hero on the public landing page (globals.css line 8268).
           Email clients strip absolute positioning, so we stack image-then-text
           but blend with a matching gradient + navy fill so it reads as one hero. -->
      <tr><td style="padding:0;background:#111827" align="center">
        <!-- Image (stripped by the renderer if {{event_image}} is empty) -->
        <div style="line-height:0;background:#0d1220">
          <img src="{{event_image}}" alt="{{event_name}}" width="600"
               style="display:block;width:100%;max-width:600px;height:auto;border:0">
        </div>

        <!-- Narrow gradient strip that visually fades from the image into the navy body. -->
        <div style="height:40px;background:linear-gradient(180deg,rgba(17,24,39,0.0) 0%,#111827 100%);margin-top:-40px;position:relative"></div>
      </td></tr>

      <!-- HERO TEXT (navy background, gold kicker, big title, meta row) -->
      <tr><td style="padding:4px 28px 24px;background:#111827">
        <!-- Gold "Just Announced · Early Access" kicker (mirrors .lp-subheadline) -->
        <div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:{{venue_primary_color}};font-weight:700;margin-bottom:12px">
          ★ Just Announced · Early Access
        </div>

        <!-- Main headline — mirrors .lp-headline (letter-spacing:-0.02em, weight 800) -->
        <h1 style="margin:0 0 16px;color:#ffffff;font-size:32px;line-height:1.1;font-weight:800;letter-spacing:-0.02em">
          {{event_name}}
        </h1>

        <!-- Meta row (calendar · clock · pin) — mirrors .lp-meta -->
        <table role="presentation" cellpadding="0" cellspacing="0">
          <tr>
            <td style="padding-right:16px;color:rgba(255,255,255,0.7);font-size:14px" valign="middle">
              <span style="color:rgba(255,255,255,0.5)">📅</span>&nbsp;{{event_date_short}}
            </td>
            <td style="padding-right:16px;color:rgba(255,255,255,0.7);font-size:14px" valign="middle">
              <span style="color:rgba(255,255,255,0.5)">⏰</span>&nbsp;{{event_time}}
            </td>
            <td style="color:rgba(255,255,255,0.7);font-size:14px" valign="middle">
              <span style="color:rgba(255,255,255,0.5)">📍</span>&nbsp;{{venue_name}}
            </td>
          </tr>
        </table>
      </td></tr>

      <!-- PRESALE GREETING -->
      <tr><td style="padding:8px 28px 0">
        <p style="margin:0;color:rgba(255,255,255,0.85);font-size:15px;line-height:1.6">
          Hey {{first_name}} — you're on the list, so you're seeing this before the public.
        </p>
      </td></tr>

      <!-- COUNTDOWN CARD (mirrors .lp-countdown exactly: glass background,
           uppercase label, gold tabular-nums timer) -->
      <tr><td style="padding:18px 28px 6px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
               style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.09);border-radius:14px">
          <tr><td style="padding:22px 20px 20px" align="center">
            <div style="font-size:13px;letter-spacing:0.05em;text-transform:uppercase;color:rgba(255,255,255,0.5);font-weight:500;margin-bottom:10px">
              Tickets on sale in
            </div>
            <div style="font-size:30px;font-weight:800;color:{{venue_primary_color}};line-height:1;font-variant-numeric:tabular-nums;letter-spacing:-0.01em">
              {{days_until_onsale}}d&nbsp; {{hours_until_onsale}}h&nbsp; {{minutes_until_onsale}}m
            </div>
            <div style="color:rgba(255,255,255,0.55);font-size:12px;margin-top:14px;line-height:1.55;padding:0 8px">
              Public on-sale opens <span style="color:#ffffff;font-weight:600">{{on_sale_date}}</span> at <span style="color:#ffffff;font-weight:600">{{on_sale_time}}</span>.
            </div>
          </td></tr>
        </table>
      </td></tr>

      <!-- CTA — mirrors .lp-cta-btn (gold, #111827 text, rounded) -->
      <tr><td align="center" style="padding:24px 24px 10px">
        <!--[if mso]>
        <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="{{event_url}}" style="height:52px;v-text-anchor:middle;width:340px;" arcsize="14%" fillcolor="{{venue_primary_color}}" stroke="f">
          <w:anchorlock/>
          <center style="color:#111827;font-family:Helvetica,Arial,sans-serif;font-size:15px;font-weight:700;">Get Early Access to Tickets</center>
        </v:roundrect>
        <![endif]-->
        <!--[if !mso]><!-- -->
        <a href="{{event_url}}"
           style="display:inline-block;background:{{venue_primary_color}};color:#111827;text-decoration:none;padding:16px 32px;border-radius:12px;font-weight:700;font-size:15px;letter-spacing:0.3px">
          Get Early Access to Tickets →
        </a>
        <!--<![endif]-->
      </td></tr>

      <!-- Trust micro-copy -->
      <tr><td align="center" style="padding:6px 28px 28px">
        <div style="color:rgba(255,255,255,0.45);font-size:12px;line-height:1.6;max-width:440px;margin:0 auto">
          Tickets are available to our subscribers now. Once public sale opens, pricing and availability are first-come, first-served.
        </div>
      </td></tr>

      <!-- Divider -->
      <tr><td style="padding:0 28px">
        <div style="height:1px;background:rgba(255,255,255,0.09);margin:8px 0"></div>
      </td></tr>

      <!-- Footer identity + unsubscribe (<!-- ee-footer --> tells renderer not to append a second footer) -->
      <!-- ee-footer -->
      <tr><td align="center" style="padding:18px 28px 26px">
        <div style="color:rgba(255,255,255,0.4);font-size:12px;line-height:1.55">
          Sent by <strong style="color:rgba(255,255,255,0.75)">{{venue_name}}</strong> because you asked to hear about new shows.<br>
          <a href="{{unsubscribe_url}}" style="color:rgba(255,255,255,0.35);text-decoration:underline;margin-top:6px;display:inline-block">Unsubscribe</a>
        </div>
      </td></tr>

    </table>
  </td></tr>
</table>
</body></html>`;
}

/**
 * FWB Late Announcement — "For Our People, You Should Know About This".
 *
 * Sent when the operator forgot to tell FWB subscribers before public on-sale.
 * Tone: honest, warm, no excuses — just "tickets are live, grab yours."
 * Design mirrors event_announcement_v1 (same navy/gold palette, hero image,
 * meta row, gold CTA) but swaps the countdown for an "ON SALE NOW" badge.
 */
function fwbLateAnnounceHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="x-apple-disable-message-reformatting">
  <title>{{event_name}}</title>
</head>
<body style="margin:0;padding:0;background:#111827;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#ffffff;line-height:1.55;-webkit-font-smoothing:antialiased">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;line-height:1">
  We should've told you about this one first — tickets are on sale now.
</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#111827">
  <tr><td align="center" style="padding:24px 12px">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0"
           style="max-width:600px;background:#111827;border-radius:20px;overflow:hidden;border:1px solid rgba(255,255,255,0.09)">

      <!-- HERO image + fade -->
      <tr><td style="padding:0;background:#111827" align="center">
        <div style="line-height:0;background:#0d1220">
          <img src="{{event_image}}" alt="{{event_name}}" width="600"
               style="display:block;width:100%;max-width:600px;height:auto;border:0">
        </div>
        <div style="height:40px;background:linear-gradient(180deg,rgba(17,24,39,0.0) 0%,#111827 100%);margin-top:-40px;position:relative"></div>
      </td></tr>

      <!-- HERO TEXT -->
      <tr><td style="padding:4px 28px 24px;background:#111827">
        <div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:{{venue_primary_color}};font-weight:700;margin-bottom:12px">
          ★ For Our People — You Should Know About This
        </div>
        <h1 style="margin:0 0 16px;color:#ffffff;font-size:32px;line-height:1.1;font-weight:800;letter-spacing:-0.02em">
          {{event_name}}
        </h1>
        <table role="presentation" cellpadding="0" cellspacing="0">
          <tr>
            <td style="padding-right:16px;color:rgba(255,255,255,0.7);font-size:14px" valign="middle">
              <span style="color:rgba(255,255,255,0.5)">📅</span>&nbsp;{{event_date_short}}
            </td>
            <td style="padding-right:16px;color:rgba(255,255,255,0.7);font-size:14px" valign="middle">
              <span style="color:rgba(255,255,255,0.5)">⏰</span>&nbsp;{{event_time}}
            </td>
            <td style="color:rgba(255,255,255,0.7);font-size:14px" valign="middle">
              <span style="color:rgba(255,255,255,0.5)">📍</span>&nbsp;{{venue_name}}
            </td>
          </tr>
        </table>
      </td></tr>

      <!-- COPY -->
      <tr><td style="padding:8px 28px 0">
        <p style="margin:0;color:rgba(255,255,255,0.85);font-size:15px;line-height:1.6">
          Hey {{first_name}} — real talk, we should've told you about this one first. You're on the FWB list for a reason, and this one deserves your attention. Tickets are live right now.
        </p>
      </td></tr>

      <!-- ON SALE NOW badge card -->
      <tr><td style="padding:18px 28px 6px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
               style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.09);border-radius:14px">
          <tr><td style="padding:22px 20px 20px" align="center">
            <div style="font-size:13px;letter-spacing:0.05em;text-transform:uppercase;color:rgba(255,255,255,0.5);font-weight:500;margin-bottom:10px">
              Tickets available now
            </div>
            <div style="font-size:28px;font-weight:800;color:{{venue_primary_color}};line-height:1;letter-spacing:0.04em;text-transform:uppercase">
              ON SALE NOW
            </div>
            <div style="color:rgba(255,255,255,0.55);font-size:12px;margin-top:14px;line-height:1.55;padding:0 8px">
              Don't sleep on this one — availability is first-come, first-served.
            </div>
          </td></tr>
        </table>
      </td></tr>

      <!-- CTA -->
      <tr><td align="center" style="padding:24px 24px 10px">
        <!--[if mso]>
        <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="{{event_url}}" style="height:52px;v-text-anchor:middle;width:340px;" arcsize="14%" fillcolor="{{venue_primary_color}}" stroke="f">
          <w:anchorlock/>
          <center style="color:#111827;font-family:Helvetica,Arial,sans-serif;font-size:15px;font-weight:700;">Get Your Tickets →</center>
        </v:roundrect>
        <![endif]-->
        <!--[if !mso]><!-- -->
        <a href="{{event_url}}"
           style="display:inline-block;background:{{venue_primary_color}};color:#111827;text-decoration:none;padding:16px 32px;border-radius:12px;font-weight:700;font-size:15px;letter-spacing:0.3px">
          Get Your Tickets →
        </a>
        <!--<![endif]-->
      </td></tr>

      <tr><td align="center" style="padding:6px 28px 28px">
        <div style="color:rgba(255,255,255,0.45);font-size:12px;line-height:1.6;max-width:440px;margin:0 auto">
          You're getting this because you're on the FWB list. We love you for it.
        </div>
      </td></tr>

      <tr><td style="padding:0 28px">
        <div style="height:1px;background:rgba(255,255,255,0.09);margin:8px 0"></div>
      </td></tr>

      <!-- ee-footer -->
      <tr><td align="center" style="padding:18px 28px 26px">
        <div style="color:rgba(255,255,255,0.4);font-size:12px;line-height:1.55">
          Sent by <strong style="color:rgba(255,255,255,0.75)">{{venue_name}}</strong> because you're on the FWB list.<br>
          <a href="{{unsubscribe_url}}" style="color:rgba(255,255,255,0.35);text-decoration:underline;margin-top:6px;display:inline-block">Unsubscribe</a>
        </div>
      </td></tr>

    </table>
  </td></tr>
</table>
</body></html>`;
}

// ───── Templates ────────────────────────────────────────────────────────
export const EMAIL_TEMPLATES: EmailTemplate[] = [
  {
    key: "event_announcement_v1",
    name: "New Event Announcement (Landing-page style)",
    category: "event_announcement",
    description:
      "Matches the public event landing page — dark hero with gradient, gold 'Just Announced' kicker, " +
      "on-sale countdown, and a 'Get early access' CTA. Subscribers get first dibs before public on-sale.",
    suggested_trigger: "new_event_announcement",
    subject: "Just announced — early access: {{event_name}}",
    preview_text:
      "You have first dibs. Public on-sale {{on_sale_date_short}} at {{on_sale_time}}.",
    content_html: eventAnnouncementHtml(),
    content_text:
      "JUST ANNOUNCED — EARLY ACCESS\n\n" +
      "{{event_name}}\n" +
      "{{event_date}} · {{event_time}} · {{venue_name}}\n\n" +
      "You're seeing this before the public. Tickets open to the list now; public on-sale " +
      "{{on_sale_date}} at {{on_sale_time}}.\n\n" +
      "Get early access: {{event_url}}",
  },

  {
    key: "fwb_late_announce_v1",
    name: "FWB Late Announcement — On Sale Now",
    category: "fwb",
    description:
      "For when you forgot to tell FWB subscribers before public on-sale. Honest, warm tone — " +
      "dark navy/gold design mirrors the event landing page. Swaps countdown for an 'ON SALE NOW' badge.",
    suggested_trigger: "new_event_announcement",
    subject: "{{event_name}} — on sale now (for our people)",
    preview_text:
      "We should've told you about this one first — tickets are live right now.",
    content_html: fwbLateAnnounceHtml(),
    content_text:
      "FOR OUR PEOPLE — YOU SHOULD KNOW ABOUT THIS\n\n" +
      "{{event_name}}\n" +
      "{{event_date}} · {{event_time}} · {{venue_name}}\n\n" +
      "Hey {{first_name}} — real talk, we should've told you about this one first. " +
      "You're on the FWB list for a reason, and this one deserves your attention. " +
      "Tickets are live right now.\n\n" +
      "ON SALE NOW — get yours: {{event_url}}",
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

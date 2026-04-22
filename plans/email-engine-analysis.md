# Email Engine — Phase 1 System Analysis

> **Status:** Complete
> **Date:** 2026-04-22
> **Scope:** VenueCore email / marketing infrastructure audit prior to building the `/modules/email-engine` Mailchimp-style module.

---

## Executive summary

VenueCore already ships a **meaningful but incomplete** first-generation email-marketing layer:

* A transactional-email path built on **Resend** (REST + SDK) that handles ticket confirmations, auction notifications, comps, contract deliveries, admin welcome, and post-purchase follow-ups.
* A persisted marketing layer (`email_templates`, `email_campaigns`, `email_sends`, `automated_email_rules`) with a working Resend → `email_sends` webhook at [`app/api/webhooks/resend/route.ts`](app/api/webhooks/resend/route.ts:1) that updates per-recipient status (`sent → delivered → opened → clicked`).
* A rough admin UI at `/admin/venue-marketing/{campaigns,automations,templates}` plus redirect stubs at `/admin/marketing/*`.
* A `customer_profiles` table with pre-computed LFV segmentation (`one_timer`, `repeat`, `loyalist`, `whale`), lifetime spend, events_attended, zip, and enrichment fields.
* A lightweight subscriber list in `newsletter_subscribers` (email + source + venue_id + `is_fwb_subscriber`) fed by the homepage, exit-intent popup, checkout opt-in, and `/fwb` landing page.
* A `cart_abandonment` table already populated by [`app/api/cart-abandonment/route.ts`](app/api/cart-abandonment/route.ts:1).
* A `post_show_surveys` table capturing ratings, demographics, and NPS-style signals.

However, the campaign engine has hard-coded audiences, no rule-based segmentation, no batch/queue, no conversion attribution back to ticket purchases, no A/B, no `campaign_metrics` rollup, and no integration with `ad-engine` or `deal-lab`. It is not yet a marketing platform — it is a broadcaster.

The Email Engine must therefore be built as an **additive orchestration + segmentation + analytics layer** on top of the existing tables, **not a replacement**, with every new object namespaced `ee_*` and isolated in [`modules/email-engine/`](modules/email-engine:1).

---

## Structured report

```json
{
  "current_capabilities": [
    "Transactional email via Resend (REST fetch + resend SDK)",
    "Confirmation email on Stripe-paid ticket (app/api/webhooks/stripe/route.ts)",
    "Free-checkout confirmation email (app/api/checkout/free/route.ts)",
    "Comp ticket email (app/api/admin/comps/route.ts)",
    "Admin order resend-email (app/api/admin/orders/[orderId]/resend-email/route.ts)",
    "Auction outbid email (app/api/auctions/[id]/bid/route.ts)",
    "Contract / co-promote / settlement PDF email delivery (multiple admin routes)",
    "Admin user welcome email (app/api/admin/users/route.ts)",
    "Public contact-form relay (app/api/contact/route.ts)",
    "Newsletter signup + welcome email (app/api/newsletter/route.ts, send-welcome/route.ts)",
    "FWB admin subscriber import with throttled batch send (app/api/fwb/admin/import-subscribers/route.ts)",
    "Market-radar scanner email alerts (modules/market-radar/notifications/emailAlerts.ts)",
    "Broadcast campaigns with three fixed audiences: event_buyers / fwb_subscribers / all_customers (app/api/email-campaigns/[id]/send/route.ts)",
    "Template library with category-tagged HTML bodies and body_json (email_templates table)",
    "Automated rules for before_event / after_event emails (email_automations + automated_email_rules table)",
    "Resend webhook → email_sends status upgrade with strict priority ordering",
    "Template variable replacement for {{first_name}}, {{email}}, {{event_title}}, {{event_date}}, {{venue_name}}, {{event_id}}, {{event_image}}",
    "Cart-abandonment capture (no recovery send yet)",
    "Post-show survey capture with demographics",
    "Customer profile roll-up with LFV segmentation (customer_profiles.lfv_segment)",
    "UTM attribution persisted on orders (utm_source / utm_medium / utm_campaign) and event_views"
  ],
  "data_sources": [
    "orders: customer_email, customer_name, customer_phone, customer_zip, event_id, status='paid', total_amount, created_at, utm_source, utm_medium, utm_campaign, fwb_opt_in",
    "events: id, title, date, venue, venue_id, image_url, event_type, landing_page_slug",
    "tickets: (referenced by ticket-email template)",
    "newsletter_subscribers: email, first_name, last_name, phone, venue_id, source, is_fwb_subscriber, unsubscribed_at, created_at",
    "fwb_wallets: user_id, venue_id, current_tier, benefits balance, lifetime spend, streak",
    "customer_profiles: email, first_name, last_name, phone, zip_code, age_range, gender, total_orders, total_spend, first_order_at, last_order_at, events_attended, lfv_segment",
    "cart_abandonment: event_id, customer_email, customer_name, quantity, ticket_type, recovered, recovery_email_sent, recovery_sent_at",
    "post_show_surveys: event_id, order_id, customer_email, overall_rating, would_return, age_range, gender, feedback",
    "email_sends: campaign_id, resend_message_id, recipient_email, status (queued|sent|delivered|opened|clicked|bounced|complained|failed), opened_at, clicked_at, bounced_at",
    "email_campaigns: venue_id, template_id, event_id, audience_type, audience_filter (unused JSONB), status, scheduled_at, sent_at, total_recipients",
    "email_templates: venue_id, name, subject, body_html, body_json, category, is_system",
    "automated_email_rules: venue_id, template_id, trigger_type (before_event|after_event), days_offset, send_time, is_active, applies_to, event_id",
    "ad_campaigns: venue_id, event_id, platform, spend, impressions, clicks, start_date, end_date",
    "ad_engine_* (Ad Engine module): assets, hooks, copy_variants, creatives, daily_metrics, decision_log — available for cross-module targeting",
    "event_views: referrer_url, utm_source, utm_medium, utm_campaign (engagement signal)",
    "venues: meta_pixel_id, google_ads_tag_id, exit_intent_* (branding + ad IDs)"
  ],
  "limitations": [
    "email_campaigns.audience_type is a fixed enum — no rule-based segmentation; audience_filter JSONB exists but is never read",
    "Campaign send loop is synchronous inside a single serverless request — will time out on lists > ~200 recipients and has no retry on failure beyond insert",
    "No batching, queueing, or scheduled dispatcher — scheduled_at is stored but nothing processes it",
    "No conversion / revenue attribution back to ticket purchases (email_sends has no link to orders created after the click)",
    "No per-campaign rollup — reading metrics requires full scan of email_sends",
    "Automations only support before_event and after_event; no cart-abandonment recovery, no new-event-announcement, no post-purchase drip, no repeat-buyer nurture, no re-engagement",
    "No unsubscribe-per-email handling; only newsletter_subscribers.unsubscribed_at globally",
    "No preview / test-send endpoint; operators can only send-to-all-or-nothing",
    "No A/B test or optimization feedback loop",
    "email_sends is not ingested into customer_profiles engagement scores (no last_opened_at, last_clicked_at on profile)",
    "No integration with Ad Engine — email-engaged cohorts can't be exported as a custom-audience seed",
    "No integration with Deal Lab — ticket-sales rollups and segment fit can't refine offer scenarios",
    "Resend webhook is wired, but failures downgrade silently (bounced/complained are tracked but not propagated to any suppression list)",
    "Dual subscriber models (newsletter_subscribers + fwb_wallets) are not reconciled; campaigns that pull 'all_customers' from orders miss pure subscribers",
    "newsletter_subscribers.unsubscribed_at is referenced in send logic but no API exposes /unsubscribe?token=... (compliance risk)"
  ],
  "optimization_opportunities": [
    "Materialize a read-only ee_contacts view that unifies newsletter_subscribers + orders.customer_email + customer_profiles by lower(email) — zero duplication, single source of truth for segmentation",
    "Add ee_contact_attributes table (one row per email) computed nightly by cron: total_events_attended, last_event_date, total_spent, favorite_event_type, tags, engagement scores from email_sends — enables O(1) rule evaluation",
    "Introduce ee_segments with JSON rules that compile to parameterized SQL against ee_contacts + ee_contact_attributes — dynamic, re-evaluated at send time",
    "Introduce ee_campaigns / ee_campaign_messages / ee_campaign_metrics to separate concern (draft vs. message content vs. rollup) per the spec; keep existing email_campaigns untouched during phased migration",
    "Introduce ee_send_log with FK to ee_campaigns and foreign key resend_message_id reused from existing Resend webhook — no second webhook needed",
    "Add conversion attribution: on orders INSERT, look up ee_send_log by lower(customer_email) for sends in last N days and attribute revenue (or use utm_campaign='ee:<campaign_id>') — zero heavy joins at query time thanks to a campaign_id index on orders via utm_campaign",
    "Push batch sending to a Vercel Cron job reading ee_campaign_dispatch_queue — scales beyond serverless timeout",
    "Unify Resend webhook to also update ee_send_log when resend_message_id matches — zero new infrastructure",
    "Enforce a suppression list (ee_suppressions) populated from bounced / complained / unsubscribed, consulted at build-recipient-list time — deliverability safety net",
    "Re-use customer_profiles.lfv_segment as a first-class ee_contact_attributes.tag — no duplicate LFV computation",
    "Expose email-engagement cohorts (e.g. 'opened_last_3_campaigns AND never_purchased') to the Ad Engine via modules/email-engine/services/integrations.ts — feeds custom audiences without duplicating logic",
    "Feed back segment performance (conversion_rate_by_segment) to Deal Lab as an input for demand scoring",
    "Reuse existing template variable engine from app/api/email-campaigns/[id]/send/route.ts — standardize on a shared renderTemplate() helper in modules/email-engine/services/renderer.ts",
    "Add a thin /u/[token] unsubscribe route and a one-click List-Unsubscribe header to every send — compliance (CAN-SPAM / CASL / GDPR)",
    "Index strategy: (lower(customer_email)) on orders and customer_profiles; (campaign_id, status) on ee_send_log; (email, updated_at) on ee_contact_attributes; partial index on ee_campaigns(status) WHERE status IN ('scheduled','sending')"
  ]
}
```

---

## Architectural decisions derived from the audit

1. **Do not introduce a new `contacts` table that stores email/name.** The platform already has three overlapping sources (`newsletter_subscribers`, `customer_profiles`, `orders.customer_email`). Creating a fourth would violate the "no duplication" rule and create reconciliation debt. Instead, expose a **view** `ee_contacts` that unions them by `lower(email)`.
2. **Keep the existing `email_campaigns` + `email_sends` pathway alive.** It is referenced by the `/admin/venue-marketing` UI already in production. Build the new engine at `ee_campaigns` / `ee_send_log` in parallel. Later phases can migrate the UI over once parity is reached.
3. **Reuse the existing Resend webhook.** Extend it to also upsert into `ee_send_log` when the `resend_message_id` matches — a single `OR`-style lookup, no new endpoint, no duplicated normalization logic.
4. **Conversion attribution via UTM, not joins.** Every send stamps `utm_source=email-engine&utm_campaign=<ee_campaign_id>` on every link. The orders table already captures UTMs. `ee_campaign_metrics.revenue` is computed by a cron SUM over `orders.total_amount WHERE utm_campaign = 'ee:<id>'` — indexed, O(log n), no heavy joins on request.
5. **Dispatch via cron-queue, not in-request loop.** The existing `[id]/send/route.ts` pattern times out at scale. The new `ee_dispatch_queue` is drained by `app/api/cron/email-engine/process-scheduled/route.ts` every minute, capped at N sends/invocation with backoff.
6. **Segmentation rules compile to parameterized SQL**, never string-concatenated. Whitelist of operators per field → injection-safe.
7. **Email Engine is pure rules, zero AI.** Optimization layer is threshold-driven (open-rate / click-rate / conversion-rate bands) per the spec.

---

## Files & modules inventory

**Transactional senders (leave untouched):**
* [`lib/email/ticket-email.ts`](lib/email/ticket-email.ts:1)
* [`app/api/webhooks/stripe/route.ts`](app/api/webhooks/stripe/route.ts:1)
* [`app/api/checkout/free/route.ts`](app/api/checkout/free/route.ts:1)
* [`app/api/admin/comps/route.ts`](app/api/admin/comps/route.ts:1)
* [`app/api/admin/orders/[orderId]/resend-email/route.ts`](app/api/admin/orders/[orderId]/resend-email/route.ts:1)
* [`app/api/auctions/[id]/bid/route.ts`](app/api/auctions/[id]/bid/route.ts:1)
* [`app/api/contact/route.ts`](app/api/contact/route.ts:1)

**Existing marketing layer (coexist, do not modify):**
* [`app/api/email-campaigns/route.ts`](app/api/email-campaigns/route.ts:1), [`[id]/send/route.ts`](app/api/email-campaigns/[id]/send/route.ts:1)
* [`app/api/email-automations/route.ts`](app/api/email-automations/route.ts:1)
* [`app/api/email-templates/route.ts`](app/api/email-templates/route.ts:1)
* [`app/api/webhooks/resend/route.ts`](app/api/webhooks/resend/route.ts:1) — extend to also write `ee_send_log`
* [`app/admin/venue-marketing/campaigns/page.tsx`](app/admin/venue-marketing/campaigns/page.tsx:1)
* [`plans/marketing-migration.sql`](plans/marketing-migration.sql:1) — source of truth for existing tables

**Tables consumed read-only by Email Engine:**
`orders`, `events`, `tickets`, `newsletter_subscribers`, `fwb_wallets`, `customer_profiles`, `cart_abandonment`, `post_show_surveys`, `venues`, `admin_users`, `event_views`, `email_sends` (legacy).

**New files to be added (Phases 2–8):**
* [`plans/email-engine-migration.sql`](plans/email-engine-migration.sql:1)
* [`modules/email-engine/`](modules/email-engine:1) — types, constants, services
* [`app/api/email-engine/`](app/api/email-engine:1) — REST surface
* [`app/api/cron/email-engine/`](app/api/cron/email-engine:1) — scheduled workers
* [`app/admin/email/`](app/admin/email:1) — campaign builder UI

---

## Fail-condition checks

| Condition | Status | Mitigation |
|---|---|---|
| User data duplication | **PASS** | `ee_contacts` is a view over existing tables; `ee_contact_attributes` stores derived signals only (no PII duplication beyond the email key). |
| Segmentation conflicts with existing data | **PASS** | Rules are evaluated against existing tables via the view; no writes to `orders`, `customer_profiles`, or `newsletter_subscribers`. |
| Performance risks | **PASS (with guards)** | All new tables indexed; `ee_contact_attributes` materialized nightly; dispatch batched via cron; UTM-based conversion attribution avoids heavy joins; partial indexes on active statuses. |

No fail conditions triggered. **Proceeding to Phase 2.**

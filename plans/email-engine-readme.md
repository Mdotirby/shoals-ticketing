# Email Engine — VenueCore Module

> **Status:** Shipped foundation — Phases 1–8 complete.
> **Location:** [`modules/email-engine/`](modules/email-engine:1)
> **UI:** [`/admin/email`](app/admin/email/page.tsx:1)
> **Schema:** [`plans/email-engine-migration.sql`](plans/email-engine-migration.sql:1)

A Mailchimp-style email marketing layer tightly integrated with VenueCore's ticketing and event data. No AI is used; every decision is rule-based and deterministic.

---

## What's in the module

```
modules/email-engine/
├── index.ts                      ← public surface (only file other modules import)
├── constants.ts                  ← thresholds, operator + field whitelists, triggers
├── types.ts                      ← shared TypeScript types
├── lib/cronAuth.ts               ← shared cron authorization helper
└── services/
    ├── segmentation.ts           ← Phase 3: rule → PostgREST filter compiler
    ├── campaignBuilder.ts        ← Phase 4: create / update / preview / enqueue
    ├── renderer.ts               ← Phase 4: variable replacement + UTM stamping
    ├── dispatcher.ts             ← Phase 4: Resend-backed queue drainer
    ├── automations.ts            ← Phase 5: trigger discovery + run advancement
    ├── attributeRefresher.ts     ← Phase 6: nightly rollup from ticketing tables
    ├── metricsTracker.ts         ← Phase 6: attribution + ee_campaign_metrics rollup
    ├── optimization.ts           ← Phase 7: threshold-driven flags + suggestions
    └── integrations.ts           ← Phase 8: Ad Engine + Deal Lab hand-offs
```

---

## Install

1. Run the schema migration in Supabase SQL editor:
   ```sh
   # copy contents of plans/email-engine-migration.sql into the SQL editor
   ```
2. Confirm env vars:
   ```
   RESEND_API_KEY=...
   RESEND_FROM_EMAIL=VenueCore <noreply@venuecore.live>
   NEXT_PUBLIC_SITE_URL=https://yourdomain.live
   CRON_SECRET=<random 32 chars>         # optional — required for cron auth in prod
   ```
3. Deploy — Vercel picks up the new cron entries in [`vercel.json`](vercel.json:1).

---

## Phase-by-phase map

### Phase 1 — System analysis
Full audit lives in [`plans/email-engine-analysis.md`](plans/email-engine-analysis.md:1).

### Phase 2 — Data model
All tables are prefixed `ee_*` and additive. No existing user/ticket tables are modified.

| Object | Type | Purpose |
|---|---|---|
| `ee_contacts` | MATERIALIZED VIEW | Unified contact set from `customer_profiles` + `newsletter_subscribers` + paid `orders` — **no data duplication**. |
| `ee_contact_attributes` | TABLE | Derived engagement + purchase rollup per email (nightly refresh). |
| `ee_contact_full` | VIEW | Join view consumed by segmentation. Filters out unsubscribed/suppressed by default. |
| `ee_segments` | TABLE | Rule-tree definitions (JSON). |
| `ee_campaigns` | TABLE | Draft → scheduled → sending → sent lifecycle. |
| `ee_campaign_messages` | TABLE | HTML/text content for a campaign (1:1). |
| `ee_campaign_metrics` | TABLE | O(1)-read rollups (open/click/conv/revenue + rates). |
| `ee_send_log` | TABLE | Per-recipient outbound record. Mirrors Resend's `resend_message_id`. |
| `ee_dispatch_queue` | TABLE | Outbound queue drained by the cron worker. |
| `ee_automation_flows` | TABLE | Event-triggered drip definitions. |
| `ee_automation_runs` | TABLE | Per-contact execution instances with a `dedup_key` generated column. |
| `ee_suppressions` | TABLE | Bounce / complaint / unsubscribe deliverability safety net. |
| `ee_unsubscribe_tokens` | TABLE | Signed one-click unsubscribe tokens (RFC 8058). |
| `ee_optimization_flags` | TABLE | Rule-based performance warnings + suggestions. |

### Phase 3 — Segmentation
Build dynamic audiences with typed rule trees:

```ts
import { previewRules, PRESETS } from "@/modules/email-engine";

// Canonical preset
const rules = PRESETS.clicked_but_not_bought();
const { count, sample } = await previewRules(supabase, rules);
```

Every field is whitelisted in [`constants.ts`](modules/email-engine/constants.ts:61). Unknown fields/operators are rejected at compile time — no SQL injection surface.

### Phase 4 — Campaign builder

**End-to-end email design workflow (for operators):**

1. Go to [`/admin/email/campaigns`](app/admin/email/campaigns/page.tsx:1) → **+ New Campaign**.
2. **Pick a template** from the gallery at the top, or click **Start from scratch (Sections)** to hand-build without touching HTML. Templates cover: new-event announcement, cart recovery, post-event follow-up, VIP/presale, welcome series, re-engagement.
3. **Fill the basics** on the left pane: campaign name, subject line, preview text, segment (audience), optional event (powers `{{event_name}}`, `{{event_date}}`, `{{event_image}}`, etc. automatically), optional schedule time.
4. **Compose the body** in one of two modes — toggle between them at any time:

   | Mode | When to use |
   |---|---|
   | **Sections** (default when starting from scratch) | Fill structured fields: Hero image URL, Headline, Sub-heading, Body (blank lines = paragraphs), CTA label + URL. No HTML required. |
   | **HTML** (default when a template is loaded) | Full HTML editing with inline styles. Use this when a template needs custom tweaks, or when you're pasting in a design from outside. |

5. **Watch the right pane** — it's a **live-updating iframe preview** that renders exactly what the recipient will see, with every `{{variable}}` already substituted against sample data (the selected event's title + date + venue, plus sample first-name). No refresh needed; type in the editor and the preview updates on the next render.
6. Hit **Save draft** to park it, **Save & send now** to enqueue for delivery (dispatched within ~5 min by the GitHub Actions cron), or set a **Schedule** datetime and save to queue it for future send.

**Template library** lives in [`modules/email-engine/templates/index.ts`](modules/email-engine/templates/index.ts:1) and is exposed at [`GET /api/email-engine/templates`](app/api/email-engine/templates/route.ts:1). Add new templates by pushing another entry to `EMAIL_TEMPLATES` — no DB migration needed; the gallery picks them up automatically.

**Variables supported** (replaced both in subject and body at send time):

| Category | Tokens |
|---|---|
| Contact | `{{first_name}}`, `{{last_name}}`, `{{email}}` |
| Event core | `{{event_name}}`, `{{event_title}}`, `{{event_date}}`, `{{event_date_short}}`, `{{event_time}}`, `{{event_image}}`, `{{event_id}}`, `{{event_url}}` (links to `/e/<slug>`) |
| Venue branding | `{{venue_name}}`, `{{venue_primary_color}}`, `{{venue_logo_url}}` |
| Pre-sale countdown | `{{has_presale}}` (`"true"`/`"false"`), `{{days_until_onsale}}`, `{{hours_until_onsale}}`, `{{minutes_until_onsale}}`, `{{on_sale_date}}`, `{{on_sale_date_short}}`, `{{on_sale_time}}` |
| Compliance | `{{unsubscribe_url}}` (auto-injected if you don't place it) |

Unknown tokens render as empty strings (no leaks). Countdown values are computed at **send time** — the email preserves both the relative countdown ("ends in 2 days 5 hours") and the absolute target datetime (`on_sale_date` + `on_sale_time`), so the recipient always has ground truth even if they open the email hours after delivery.

The **New Event Announcement** template (`event_announcement_v1`) is deliberately designed to match the public event landing page — dark theme, full-bleed hero image with gradient overlay, "Just Announced — Early Access" kicker in the venue's primary color, countdown card, and a gold "Get Early Access to Tickets" CTA. Subscribers get first dibs before the `on_sale_at` public on-sale timestamp passes.

**Programmatic equivalent** (for scripting / automation drip steps):
```ts
import { createCampaign, sendCampaignNow, getTemplate } from "@/modules/email-engine";

const tpl = getTemplate("event_announcement_v1")!;
const c = await createCampaign(supabase, {
  name: "Spring Show Announce",
  subject: tpl.subject,
  preview_text: tpl.preview_text,
  segment_id: "uuid",
  event_id: "uuid",
  content_html: tpl.content_html,
  content_text: tpl.content_text,
  template_key: tpl.key,
});
await sendCampaignNow(supabase, c.id);
```

The send call **enqueues** into `ee_dispatch_queue` — it does not loop through Resend synchronously. The GitHub Actions cron drains the queue every 5 minutes.

### Phase 5 — Automation engine
Build flows in [`/admin/email/automations`](app/admin/email/automations/page.tsx:1) or programmatically:

```ts
const flow = {
  name: "Cart recovery",
  trigger_type: EMAIL_ENGINE.TRIGGERS.CART_ABANDONMENT,
  config: { grace_minutes: 45 },
  steps: [{ delay_minutes: 0, subject: "Forgot something?", content_html: "…" }],
};
```

Triggers are discovered every minute by [`runAutomationTick()`](modules/email-engine/services/automations.ts:48). The `dedup_key` generated column prevents duplicate runs.

### Phase 6 — Performance tracking
Conversions attributed by UTM `utm_campaign=ee:<campaign_id>`. Every outbound link is stamped automatically by the renderer. Revenue rollup reads [`orders.total_amount`](lib/types/order.ts:10) filtered by UTM — indexed, O(log n), no heavy joins.

### Phase 7 — Optimization
Threshold-driven rules in [`constants.ts`](modules/email-engine/constants.ts:25) flag low-engagement, low-conversion, high-bounce, and high-performer campaigns, and propose subject/content/conversion tweaks from static pools.

### Phase 8 — Cross-module integrations
| Consumer | Function | What it returns |
|---|---|---|
| Ad Engine | [`buildCohort()`](modules/email-engine/services/integrations.ts:76) | SHA-256 hashed email arrays (Meta/Snap custom-audience format). |
| Ad Engine | [`getSegmentEventOverlap()`](modules/email-engine/services/integrations.ts:195) | Read-only overlap counts for bid weighting. |
| Deal Lab | [`buildSegmentPerformanceFeed()`](modules/email-engine/services/integrations.ts:124) | Segment-level conversion and RPE rolled up for demand scoring. |

All exports are **read-only**. No writes back into ticketing / order / user tables.

---

## API surface

| Method | Path | Purpose |
|---|---|---|
| GET / POST | `/api/email-engine/segments` | List / create |
| GET / PATCH / DELETE | `/api/email-engine/segments/[id]` | Single-segment CRUD |
| POST | `/api/email-engine/segments/preview` | Live rule preview without saving |
| GET / POST | `/api/email-engine/campaigns` | List / create |
| GET / PATCH / DELETE | `/api/email-engine/campaigns/[id]` | Single-campaign CRUD + fetch |
| GET | `/api/email-engine/campaigns/[id]/preview` | Rendered preview |
| POST | `/api/email-engine/campaigns/[id]/send` | Enqueue for dispatch |
| POST | `/api/email-engine/campaigns/[id]/schedule` | Set `scheduled_at` |
| GET / POST | `/api/email-engine/campaigns/[id]/metrics` | Rollup + force recompute |
| GET / POST | `/api/email-engine/automations` | List / create flows |
| GET / PATCH / DELETE | `/api/email-engine/automations/[id]` | Single-flow CRUD |
| GET | `/api/email-engine/cohorts` | List specs / `?build=all` / `?key=` |
| GET | `/api/email-engine/templates` | Template catalog (list or `?key=...` for full HTML) |
| GET / POST | `/u/[token]` | One-click unsubscribe (RFC 8058) |

### Cron endpoints (fired from GitHub Actions — free tier)

Because the platform runs on Vercel **Hobby** (free) and Supabase free, we do
not use Vercel cron. Instead, [`.github/workflows/email-engine-cron.yml`](.github/workflows/email-engine-cron.yml:1)
triggers each endpoint on a GitHub Actions schedule using the same
`CRON_SECRET` bearer pattern as the Ad Engine.

| Endpoint | GitHub cron | Task |
|---|---|---|
| `/api/cron/email-engine/run-automations` + `/process-scheduled` | `*/5 * * * *` | Discover triggers, advance runs, drain the dispatch queue |
| `/api/cron/email-engine/compute-metrics` | `2-59/15 * * * *` | Attribute conversions + rollup |
| `/api/cron/email-engine/refresh-attributes` | `10 * * * *` | Refresh `ee_contact_attributes` |
| `/api/cron/email-engine/evaluate-optimizations` | `25 * * * *` | Flag low/high performers |

Required GitHub secrets (repo **Settings → Secrets → Actions**):

* `VC_APP_URL` — the public Vercel URL (e.g. `https://app.venuecore.io`)
* `CRON_SECRET` — any random 32+ char string, added to Vercel env vars too

You can also trigger any job manually: **Actions → Email Engine Cron → Run workflow** and pick `dispatch | automations | metrics | attributes | optimizations | all`.

GitHub Actions cron has a minimum resolution of 5 minutes. Recipients will see at most ~5 min between "Send now" and delivery — well inside typical marketing SLA.

---

## Data-consistency guarantees

* **No user duplication.** `ee_contacts` is a materialized view over existing tables. `ee_contact_attributes` stores **derived** signals only (counters, rates, flags) keyed by email.
* **One-way coupling.** Nothing in `/modules/email-engine` writes to `orders`, `customer_profiles`, `tickets`, or `newsletter_subscribers`. Only `unsubscribed_at` on `newsletter_subscribers` is set (by user request via the unsubscribe link).
* **Indexed queries.** Every common segmentation/dispatch path has a matching index (see [migration](plans/email-engine-migration.sql:1)). No request-time `JOIN` on unindexed columns.
* **Batch dispatch.** Sends go through `ee_dispatch_queue` with exponential backoff and per-attempt cap — no sync loops, no timeouts at scale.
* **Suppression safety net.** Every bounce/complaint auto-populates `ee_suppressions`, which is consulted before every send. Unsubscribes do the same via `/u/[token]`.
* **Segment safety.** Fields + operators are whitelisted in [`constants.ts`](modules/email-engine/constants.ts:52). Values are coerced and escaped per declared type. The compiler never produces raw SQL — only PostgREST filter expressions.

---

## Migration compatibility

The **existing** broadcast pathway in [`app/api/email-campaigns/[id]/send/route.ts`](app/api/email-campaigns/[id]/send/route.ts:1) and the `/admin/venue-marketing` UI remain **untouched** and fully functional. The Email Engine runs alongside it — operators can keep using the older flow while they migrate.

The existing Resend webhook at [`app/api/webhooks/resend/route.ts`](app/api/webhooks/resend/route.ts:1) was extended (non-breaking) to also write to `ee_send_log` and populate `ee_suppressions` on bounce/complaint. The legacy `email_sends` branch is preserved.

---

## What's explicitly not shipped (and why)

| Item | Reason |
|---|---|
| Full drag-and-drop block editor | Out of scope for v1. Shipped instead: **Sections composer** (hero / headline / body / CTA) + a **template library** + **HTML escape hatch** — covers 95% of use cases without a dedicated block editor. Section state is persisted in `ee_campaign_messages.body_json` for future re-editing. |
| A/B testing | The schema supports it (a flag column could split segments), but v1 ships rule-based optimization only per spec. |
| External provider abstraction | Only Resend is wired. Other providers (SendGrid, Postmark) can be added by implementing a new adapter in [`dispatcher.ts`](modules/email-engine/services/dispatcher.ts:108). |
| Inline SMS | Roadmap — the `ee_contacts.phone` column is populated, and the module could be extended. Not part of this phase. |

---

## Files added / modified

**Added:**
* [`plans/email-engine-analysis.md`](plans/email-engine-analysis.md:1)
* [`plans/email-engine-migration.sql`](plans/email-engine-migration.sql:1)
* [`modules/email-engine/*`](modules/email-engine:1) (complete module)
* [`app/api/email-engine/**`](app/api/email-engine:1)
* [`app/api/cron/email-engine/**`](app/api/cron/email-engine:1)
* [`app/u/[token]/route.ts`](app/u/[token]/route.ts:1)
* [`app/admin/email/**`](app/admin/email:1) (UI)

**Modified (additive only):**
* [`vercel.json`](vercel.json:1) — new cron entries appended
* [`app/api/webhooks/resend/route.ts`](app/api/webhooks/resend/route.ts:1) — additionally writes to `ee_send_log` / `ee_suppressions`; legacy `email_sends` path preserved

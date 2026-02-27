# Marketing, Onboarding & Partner Portal — Implementation Plan

## Overview

Four major workstreams:
1. **Onboarding Page Refactor** — Dynamic dropdown for Venue/Organizer/Artist/Partner
2. **Owner Marketing Tab** — Owner-only analytics command center
3. **Partner Portal** — Limited KPI dashboard for partners
4. **Venue/Organizer Marketing Page** — Self-serve email campaigns, templates, retargeting

---

## Phase 1: Database Schema (Migration SQL)

### New Tables

#### `email_templates`
Reusable email templates scoped to venues.
```sql
CREATE TABLE IF NOT EXISTS email_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID REFERENCES venues(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  subject TEXT NOT NULL,
  body_html TEXT NOT NULL,
  body_json JSONB,              -- Unlayer editor JSON for re-editing
  category TEXT DEFAULT 'custom' CHECK (category IN (
    'welcome','know_before_show','post_show_survey',
    'we_hope_you_enjoyed','last_chance','event_announcement','custom'
  )),
  is_system BOOLEAN DEFAULT false,  -- true for platform-provided defaults
  created_by UUID REFERENCES admin_users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_email_templates_venue ON email_templates(venue_id);
```

#### `email_campaigns`
A specific send: template + audience + schedule.
```sql
CREATE TABLE IF NOT EXISTS email_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID REFERENCES venues(id) ON DELETE CASCADE,
  template_id UUID REFERENCES email_templates(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  subject_override TEXT,         -- Override template subject if needed
  event_id UUID REFERENCES events(id) ON DELETE SET NULL,
  audience_type TEXT NOT NULL CHECK (audience_type IN (
    'event_buyers','fwb_subscribers','custom_list','all_customers'
  )),
  audience_filter JSONB,         -- Additional filters (zip, repeat buyers, etc.)
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','scheduled','sending','sent','cancelled')),
  scheduled_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  total_recipients INTEGER DEFAULT 0,
  created_by UUID REFERENCES admin_users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_email_campaigns_venue ON email_campaigns(venue_id);
CREATE INDEX IF NOT EXISTS idx_email_campaigns_event ON email_campaigns(event_id);
```

#### `email_sends`
Individual email log — one row per recipient per campaign.
```sql
CREATE TABLE IF NOT EXISTS email_sends (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES email_campaigns(id) ON DELETE CASCADE,
  resend_message_id TEXT,        -- From Resend API response
  recipient_email TEXT NOT NULL,
  recipient_name TEXT,
  status TEXT DEFAULT 'queued' CHECK (status IN (
    'queued','sent','delivered','opened','clicked','bounced','complained','failed'
  )),
  opened_at TIMESTAMPTZ,
  clicked_at TIMESTAMPTZ,
  bounced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_email_sends_campaign ON email_sends(campaign_id);
CREATE INDEX IF NOT EXISTS idx_email_sends_resend ON email_sends(resend_message_id);
CREATE INDEX IF NOT EXISTS idx_email_sends_recipient ON email_sends(recipient_email);
```

#### `automated_email_rules`
Trigger rules for scheduled emails relative to events.
```sql
CREATE TABLE IF NOT EXISTS automated_email_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID REFERENCES venues(id) ON DELETE CASCADE,
  template_id UUID REFERENCES email_templates(id) ON DELETE CASCADE,
  trigger_type TEXT NOT NULL CHECK (trigger_type IN ('before_event','after_event')),
  days_offset INTEGER NOT NULL DEFAULT 1,  -- e.g. 2 = "2 days after event"
  send_time TIME NOT NULL DEFAULT '10:00', -- e.g. 10:00 AM
  is_active BOOLEAN DEFAULT true,
  applies_to TEXT DEFAULT 'all_events' CHECK (applies_to IN ('all_events','specific_event')),
  event_id UUID REFERENCES events(id) ON DELETE CASCADE,  -- NULL = all events
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_auto_email_rules_venue ON automated_email_rules(venue_id);
```

#### `ad_campaigns`
Manual digital ad spend tracking per event.
```sql
CREATE TABLE IF NOT EXISTS ad_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID REFERENCES venues(id) ON DELETE CASCADE,
  event_id UUID REFERENCES events(id) ON DELETE SET NULL,
  platform TEXT NOT NULL CHECK (platform IN ('meta','google','tiktok','snapchat','spotify','other')),
  campaign_name TEXT,
  spend NUMERIC(10,2) NOT NULL DEFAULT 0,
  impressions INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  start_date DATE,
  end_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ad_campaigns_event ON ad_campaigns(event_id);
CREATE INDEX IF NOT EXISTS idx_ad_campaigns_venue ON ad_campaigns(venue_id);
```

#### `social_metrics`
Manual social/hashtag performance per event.
```sql
CREATE TABLE IF NOT EXISTS social_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID REFERENCES events(id) ON DELETE CASCADE,
  venue_id UUID REFERENCES venues(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('instagram','tiktok','twitter','facebook','youtube','other')),
  hashtag TEXT,
  impressions INTEGER DEFAULT 0,
  engagements INTEGER DEFAULT 0,
  shares INTEGER DEFAULT 0,
  mentions INTEGER DEFAULT 0,
  recorded_date DATE DEFAULT CURRENT_DATE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_social_metrics_event ON social_metrics(event_id);
```

#### `post_show_surveys`
Survey responses linked to events.
```sql
CREATE TABLE IF NOT EXISTS post_show_surveys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  customer_email TEXT,
  overall_rating INTEGER CHECK (overall_rating BETWEEN 1 AND 5),
  would_return BOOLEAN,
  feedback TEXT,
  age_range TEXT CHECK (age_range IN ('18-24','25-34','35-44','45-54','55-64','65+')),
  gender TEXT CHECK (gender IN ('male','female','non_binary','prefer_not_to_say')),
  submitted_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_surveys_event ON post_show_surveys(event_id);
```

#### `customer_profiles`
Enriched customer data — aggregated from orders + third-party enrichment.
```sql
CREATE TABLE IF NOT EXISTS customer_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  first_name TEXT,
  last_name TEXT,
  phone TEXT,
  zip_code TEXT,
  age_range TEXT,
  gender TEXT,
  enrichment_source TEXT,        -- 'clearbit', 'pdl', 'survey', 'manual'
  enriched_at TIMESTAMPTZ,
  total_orders INTEGER DEFAULT 0,
  total_spend NUMERIC(10,2) DEFAULT 0,
  first_order_at TIMESTAMPTZ,
  last_order_at TIMESTAMPTZ,
  events_attended INTEGER DEFAULT 0,
  lfv_segment TEXT CHECK (lfv_segment IN ('one_timer','repeat','loyalist','whale')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_customer_profiles_email ON customer_profiles(email);
CREATE INDEX IF NOT EXISTS idx_customer_profiles_zip ON customer_profiles(zip_code);
CREATE INDEX IF NOT EXISTS idx_customer_profiles_segment ON customer_profiles(lfv_segment);
```

#### `partner_event_assignments`
Controls which events each partner can see data for.
```sql
CREATE TABLE IF NOT EXISTS partner_event_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (partner_id, event_id)
);
CREATE INDEX IF NOT EXISTS idx_partner_event ON partner_event_assignments(partner_id, event_id);
```

#### `cart_abandonment`
Track incomplete checkouts for retargeting.
```sql
CREATE TABLE IF NOT EXISTS cart_abandonment (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  customer_email TEXT NOT NULL,
  customer_name TEXT,
  quantity INTEGER DEFAULT 1,
  ticket_type TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  recovered BOOLEAN DEFAULT false,   -- Set true if they complete purchase
  recovery_email_sent BOOLEAN DEFAULT false,
  recovery_sent_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_cart_abandonment_email ON cart_abandonment(customer_email);
CREATE INDEX IF NOT EXISTS idx_cart_abandonment_event ON cart_abandonment(event_id);
CREATE INDEX IF NOT EXISTS idx_cart_abandonment_pending ON cart_abandonment(recovered, recovery_email_sent);
```

### Amended Tables

#### `admin_users` — Add partner role
```sql
ALTER TABLE admin_users DROP CONSTRAINT IF EXISTS admin_users_role_check;
ALTER TABLE admin_users ADD CONSTRAINT admin_users_role_check
  CHECK (role IN (
    'owner','super_admin','venue_admin','promoter',
    'full_admin','box_office','read_only','door_greeter','artist','partner'
  ));
```

#### `orders` — Add marketing attribution columns
```sql
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_zip TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS utm_source TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS utm_medium TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS utm_campaign TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS fwb_opt_in BOOLEAN DEFAULT false;
```

#### `newsletter_subscribers` — Add source + venue tracking
```sql
ALTER TABLE newsletter_subscribers ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'homepage';
ALTER TABLE newsletter_subscribers ADD COLUMN IF NOT EXISTS venue_id UUID REFERENCES venues(id) ON DELETE SET NULL;
```

#### `event_views` — Add referrer + UTM tracking
```sql
ALTER TABLE event_views ADD COLUMN IF NOT EXISTS referrer_url TEXT;
ALTER TABLE event_views ADD COLUMN IF NOT EXISTS utm_source TEXT;
ALTER TABLE event_views ADD COLUMN IF NOT EXISTS utm_medium TEXT;
ALTER TABLE event_views ADD COLUMN IF NOT EXISTS utm_campaign TEXT;
```

---

## Phase 2: Onboarding Page Refactor

### Current State
- Two-step flow: create venue, then create admin user
- Owner-only access

### Changes
- Add dropdown at top: "What are you onboarding?" — Venue, Organizer, Artist, Partner
- Each selection shows different form fields:
  - **Venue**: name, slug, capacity, address, ticketing fee, rebate, tax rate, logo (existing)
  - **Organizer**: company name, slug, contact person, email, phone, logo, associated venue(s)
  - **Artist**: name, genre, management contact email/phone, social links, bio
  - **Partner**: company name, contact name, email, phone, logo, partner tier
- After entity creation, step 2 creates the admin_user with the correct role
- Partner gets `role: 'partner'` with no `venue_id`

### Files to Edit
- `app/admin/onboarding/page.tsx` — Full refactor with dropdown + dynamic forms

---

## Phase 3: Owner Marketing Tab

### Sidebar Addition
- Add "Marketing" tab to `AdminSidebar` — visible only when `role === 'owner'`
- Route: `/admin/marketing`
- Sub-navigation tabs within the page

### Sub-tabs

#### A. Friends With Benefits (FWB Database)
- Table of all `newsletter_subscribers` with search, filter by source/venue
- Growth chart (signups over time using Chart.js or Recharts)
- Export CSV button (client-side with Papa Parse)
- Export PDF button (using jsPDF)
- Source breakdown pie chart
- Route: `/admin/marketing/fwb`

#### B. Email KPIs
- Aggregate stats: total sent, delivered, open rate, CTR, bounce rate
- Per-campaign breakdown table
- Trend chart over time
- Data from `email_sends` table
- Route: `/admin/marketing/email-kpis`

#### C. Demographics & Heatmaps
- Event selector dropdown
- Zip code heatmap using Mapbox GL JS (free tier: 50k map loads/month)
- Demographics from surveys + enrichment (age range, gender pie charts)
- Route: `/admin/marketing/demographics`

#### D. Lifetime Fan Value (LFV)
- Table of `customer_profiles` sorted by total_spend
- Segment breakdown: one-timers, repeat, loyalists, whales
- Average LFV, median, distribution chart
- Top fans leaderboard
- Route: `/admin/marketing/lfv`

#### E. Drop Count
- Per-event: tickets sold vs. scanned
- Overall drop rate trend
- Circle/donut graph per event card in sales tab
- Data from existing `tickets.is_scanned`
- Route: stays on sales tab — add donut chart to event cards

#### F. Digital Ad Spend / ROAS
- Manual input form: platform, campaign name, spend, impressions, clicks
- ROAS calculation: event ticket revenue / total ad spend
- Per-platform breakdown
- Route: `/admin/marketing/ad-spend`

#### G. Social Performance
- Manual input: platform, hashtag, impressions, engagements
- Per-event social summary
- Route: `/admin/marketing/social`

### Files to Create
- `app/admin/marketing/page.tsx` — Main marketing hub with sub-nav
- `app/admin/marketing/fwb/page.tsx`
- `app/admin/marketing/email-kpis/page.tsx`
- `app/admin/marketing/demographics/page.tsx`
- `app/admin/marketing/lfv/page.tsx`
- `app/admin/marketing/ad-spend/page.tsx`
- `app/admin/marketing/social/page.tsx`
- API routes for each data set

### Files to Edit
- `app/components/admin/AdminSidebar.tsx` — Add Marketing tab (owner-only)
- `app/admin/orders/page.tsx` — Add drop count donut charts to event cards
- `lib/types/admin.ts` — Add 'partner' to role union

---

## Phase 4: Venue/Organizer Marketing Page

### Route: `/admin/venue-marketing`
Accessible to: owner, venue_admin, full_admin

### Features

#### Email Template Builder
- "+ New Email Template" button opens Unlayer editor (react-email-editor)
- Save outputs both HTML (for sending) and JSON (for re-editing)
- Pre-built starter templates seeded on venue creation:
  1. Know Before the Show
  2. Post-Show Survey
  3. We Hope You Enjoyed the Show
  4. Friends With Benefits Welcome (editable version of current hardcoded email)
  5. Last Chance Tickets
  6. Event Announcement

#### Campaign Builder
- Select event from dropdown (shows date)
- Auto-populates recipient list from event's ticket buyers
- Choose template or write custom
- Preview with merge tags resolved
- Send now or schedule
- Personalization: `{{first_name}}`, `{{event_title}}`, `{{event_date}}`, `{{venue_name}}`

#### Automated Emails
- Create rules: "Send [template] at [time] [X days] [before/after] [event]"
- Toggle active/inactive per rule
- Example presets:
  - Know Before the Show → 1 day before, 10am
  - Post-Show Survey → 2 days after, 10am
  - We Hope You Enjoyed → 7 days after, 10am
- Requires a cron job (Supabase Edge Function or Vercel Cron) to check and fire

#### Customer Data & Analytics
- Site views for venue subdomain (from event_views grouped by venue)
- Total conversion rate
- Visits without purchase
- Offer targeting logic suggestions (based on data patterns)

#### Retargeting Tools
1. **Meta/Google Pixel Integration**
   - Settings page field for Meta Pixel ID and Google Ads Tag ID
   - Inject tracking scripts on venue subdomain pages
   - Add to `venues` table: `meta_pixel_id`, `google_ads_tag_id`

2. **Exit-Intent Popup**
   - Component that triggers on mouse-leave (desktop) or scroll-up (mobile)
   - "Join Friends With Benefits" signup capture
   - Configurable: enable/disable per venue, custom headline

3. **Cart Abandonment**
   - Modified checkout flow: email capture before Stripe redirect
   - `cart_abandonment` table tracks incomplete checkouts
   - Automated email 1 hour after abandonment: "Your tickets are waiting!"
   - Recovery tracking: mark as recovered if they complete purchase

### Files to Create
- `app/admin/venue-marketing/page.tsx` — Main page with sub-sections
- `app/admin/venue-marketing/templates/page.tsx` — Template builder
- `app/admin/venue-marketing/campaigns/page.tsx` — Campaign builder
- `app/admin/venue-marketing/campaigns/new/page.tsx` — New campaign form
- `app/admin/venue-marketing/automations/page.tsx` — Automated rules
- `app/components/ExitIntentPopup.tsx` — Exit-intent popup component
- `app/api/email-templates/route.ts` — CRUD for templates
- `app/api/email-campaigns/route.ts` — CRUD for campaigns
- `app/api/email-campaigns/[id]/send/route.ts` — Trigger campaign send
- `app/api/email-automations/route.ts` — CRUD for automation rules
- `app/api/webhooks/resend/route.ts` — Resend webhook for open/click tracking
- `app/api/cart-abandonment/route.ts` — Cart abandonment tracking + recovery

### Files to Edit
- `app/api/checkout/route.ts` — Add email-first step, UTM capture, FWB opt-in
- `app/api/webhooks/stripe/route.ts` — Update customer_profiles on purchase, mark cart recovery
- `app/api/newsletter/route.ts` — Add source tracking, venue_id
- `app/events/[id]/page.tsx` — Add exit-intent popup, pixel scripts, UTM tracking on views

### Additional Venue Table Columns
```sql
ALTER TABLE venues ADD COLUMN IF NOT EXISTS meta_pixel_id TEXT;
ALTER TABLE venues ADD COLUMN IF NOT EXISTS google_ads_tag_id TEXT;
ALTER TABLE venues ADD COLUMN IF NOT EXISTS exit_intent_enabled BOOLEAN DEFAULT false;
ALTER TABLE venues ADD COLUMN IF NOT EXISTS exit_intent_headline TEXT DEFAULT 'Get Early Access to Tickets';
```

---

## Phase 5: Partner Portal

### Route: `/admin/partner-dashboard`
Accessible to: `role === 'partner'`

### Dashboard Features
- **Event List** — All assigned events with ticket sales (quantity only, NO revenue)
- **Email KPIs** — Open/click rates for campaigns on their assigned events
- **Engagement Data** — Event page views, unique visitors, conversion rate
- **Location Heatmap** — Zip code map for their assigned events' ticket buyers
- **Landing Page Metrics** — Views and click-throughs for partner landing pages

### Files to Create
- `app/admin/partner-dashboard/page.tsx` — Main partner dashboard
- `app/api/partner/events/route.ts` — Partner-scoped event data (no financials)
- `app/api/partner/analytics/route.ts` — Partner-scoped analytics

### Files to Edit
- `app/components/admin/AdminSidebar.tsx` — Show partner-specific nav
- `middleware.ts` — Ensure partner role can access /admin/partner-dashboard

---

## Phase 6: NPM Dependencies to Add

```
react-email-editor          # Unlayer drag-and-drop email editor
recharts                    # Charts (or chart.js + react-chartjs-2)
mapbox-gl                   # Heatmap visualization
react-map-gl                # React wrapper for Mapbox
papaparse                   # CSV export
jspdf                       # PDF export
jspdf-autotable             # PDF table formatting
```

---

## Implementation Order

### Wave 1 — Foundation (do first)
1. Run migration SQL (all new tables + amended columns)
2. Onboarding page refactor (dropdown + dynamic forms)
3. Add partner role to admin_users constraint + types
4. AdminSidebar updates (marketing tab for owner, partner nav)

### Wave 2 — Owner Marketing Hub
5. FWB database view + export (CSV/PDF)
6. Drop count donut charts on sales cards
7. LFV analytics page (built from existing orders data)
8. Demographics page with heatmap (Mapbox)
9. Ad spend manual input + ROAS
10. Social metrics manual input

### Wave 3 — Email Marketing Engine
11. Resend webhook endpoint for open/click/bounce tracking
12. Email template CRUD with Unlayer editor
13. Campaign builder (event dropdown, audience auto-populate, send)
14. Email KPIs dashboard
15. Automated email rules + cron job for scheduling

### Wave 4 — Retargeting & Conversion
16. Checkout flow change: email-first capture
17. Cart abandonment tracking + recovery emails
18. Meta Pixel + Google Ads tag injection
19. Exit-intent popup component
20. UTM parameter capture on event views + orders

### Wave 5 — Partner Portal
21. Partner dashboard page
22. Partner API routes (scoped data, no financials)
23. Partner event assignments management

### Wave 6 — Enrichment & Polish
24. Third-party demographic enrichment integration
25. Customer profile auto-updating from orders
26. Seed default email templates for new venues
27. Pre-event reminder automation (1 day before)
28. Post-show survey page (public link from email)

---

## Architecture Diagram

```
                    ┌─────────────────────────────────┐
                    │         OWNER MARKETING          │
                    │  /admin/marketing/*               │
                    │  FWB | KPIs | Demo | LFV | Ads  │
                    └──────────────┬──────────────────┘
                                   │
              ┌────────────────────┼────────────────────┐
              │                    │                     │
    ┌─────────▼──────────┐  ┌─────▼──────────┐  ┌──────▼─────────┐
    │  VENUE MARKETING   │  │ PARTNER PORTAL │  │   ONBOARDING   │
    │  Templates/Camps   │  │  Read-only KPIs│  │  V/O/A/P forms │
    │  Automations       │  │  No financials │  │  Dynamic fields│
    │  Retargeting       │  │  Scoped events │  │                │
    └────────┬───────────┘  └────────────────┘  └────────────────┘
             │
    ┌────────▼───────────┐
    │    RESEND API       │
    │  Send + Webhooks    │◄──── open/click/bounce events
    └────────┬───────────┘
             │
    ┌────────▼───────────┐
    │   SUPABASE TABLES   │
    │  email_sends        │
    │  email_campaigns    │
    │  email_templates    │
    │  customer_profiles  │
    │  cart_abandonment   │
    │  ad_campaigns       │
    │  social_metrics     │
    │  post_show_surveys  │
    └─────────────────────┘
```

# Marketing Hub Consolidation Plan

> **Goal:** Merge the separate "Marketing" (owner-only analytics) and "Venue Marketing" (email tools) sidebar tabs into a single **📣 Marketing** tab with an event-first layout inspired by Ticketmaster's event analytics hub.

---

## 1. Current vs New Sidebar Structure

### Current Sidebar (from [`layout.tsx`](app/admin/layout.tsx:18))

```
Dashboard
Calendar
Events
Booking
Settlements
Contracts
Partners
Auctions
Reports
Sales
Scanner
Guest Lists
Marketing          ← owner-only, analytics hub
Venue Marketing    ← owner/venue_admin/full_admin, email tools
🎯 Market Radar   ← competitive intelligence (stays separate)
Agents
Partner Dashboard
Venue Management
Onboarding
Permissions
```

### New Sidebar

```
Dashboard
Calendar
Events
Booking
Settlements
Contracts
Partners
Auctions
Reports
Sales
Scanner
Guest Lists
📣 Marketing       ← MERGED: analytics + email tools + event performance
🎯 Market Radar   ← unchanged (competitive intelligence)
Agents
Partner Dashboard
Venue Management
Onboarding
Permissions
```

**Changes:**
- Remove `Marketing` entry (`/admin/marketing`, owner-only)
- Remove `Venue Marketing` entry (`/admin/venue-marketing`, owner/venue_admin/full_admin)
- Add `📣 Marketing` entry → `/admin/marketing` with roles `["owner","venue_admin","full_admin"]`
- Update `TAB_KEY_MAP` — remove `venue_marketing` key, keep `marketing`
- Update `sidebar_permissions` records in the database to merge both entries

---

## 2. New Page / Component Hierarchy

```
app/admin/marketing/
├── page.tsx                          ← NEW: Unified Marketing Hub landing page
├── events/
│   └── [id]/
│       └── page.tsx                  ← NEW: Event Detail analytics page
├── fwb/
│   └── page.tsx                      ← EXISTING: FWB Loyalty Hub (1660 lines, keep as-is)
├── email-kpis/
│   └── page.tsx                      ← EXISTING: Email KPIs dashboard
├── demographics/
│   └── page.tsx                      ← EXISTING: Demographics & heatmaps
├── lfv/
│   └── page.tsx                      ← EXISTING: Lifetime Fan Value
├── ad-spend/
│   └── page.tsx                      ← EXISTING: Ad Spend / ROAS
├── social/
│   └── page.tsx                      ← EXISTING: Social Performance
├── newsletters/
│   └── page.tsx                      ← NEW: Newsletter management (create/edit/send)
├── templates/
│   └── page.tsx                      ← MOVED from venue-marketing/templates
├── campaigns/
│   └── page.tsx                      ← MOVED from venue-marketing/campaigns
├── automations/
│   └── page.tsx                      ← MOVED from venue-marketing/automations
└── fwb-import/
    └── page.tsx                      ← NEW: Newsletter→FWB migration tool
```

### Component Breakdown

```
app/components/admin/marketing/
├── EventPerformanceGrid.tsx          ← Event cards grid (Section 1)
├── EventPerformanceCard.tsx          ← Individual event card with donut chart
├── DonutChart.tsx                    ← SVG donut chart for % sold
├── MarketingToolsGrid.tsx            ← Tool cards grid (Section 2)
├── FWBImportWizard.tsx               ← Step-by-step import flow (Section 3)
└── EventDetailCharts.tsx             ← Charts for event detail page
```

---

## 3. Event Performance Cards Spec (Section 1 — Top of Hub)

### Layout
- Responsive grid: `grid-template-columns: repeat(auto-fill, minmax(300px, 1fr))`
- Cards sorted: **upcoming events first** (by date ASC), then **past events** (by date DESC)
- Section header: "Event Performance" with filter toggle (Upcoming / Past / All)

### Individual Card Spec

```
┌─────────────────────────────────────┐
│  [thumbnail]  Event Name            │
│               Mar 15, 2026 · 8:00pm │
│                                     │
│   ┌───────┐   Sold: 245 / 300      │
│   │ DONUT │   Available: 55         │
│   │  82%  │   % Sold: 82%          │
│   └───────┘   Drop Count: 187      │
│                                     │
│              [View Details →]       │
└─────────────────────────────────────┘
```

### Data Sources

| Field | Source | API |
|-------|--------|-----|
| Event name, date, thumbnail | `events` table | `GET /api/events` |
| Total sold | `orders` table (status=paid), sum of quantity | `GET /api/marketing/event-performance` (NEW) |
| Available | `ticket_types` sum of `quantity` minus sold | Same new API |
| % Sold | Calculated: sold / total capacity | Client-side |
| Drop count | `tickets` table where `is_scanned=true` | Existing [`GET /api/events/[id]/drop-count`](app/api/events/[id]/drop-count/route.ts:5) |
| Thumbnail | `events.image_url` | Already in events data |

### Donut Chart
- SVG-based, no external library needed
- Gold fill (`#d0c290`) for sold percentage
- Dark fill (`rgba(255,255,255,0.08)`) for remaining
- Center text: percentage number in bold

### Click Action
- Card click → navigates to `/admin/marketing/events/[id]`

---

## 4. Marketing Tools Section Layout (Section 2 — Below Events)

### Section Header
"Marketing Tools" — grid of cards linking to sub-pages, same card style as current [`venue-marketing/page.tsx`](app/admin/venue-marketing/page.tsx:21)

### Tool Cards

| Card | Icon | Route | Description | Source |
|------|------|-------|-------------|--------|
| FWB Loyalty Hub | 🤝 | `/admin/marketing/fwb` | Manage rewards, tiers, perks, analytics | Existing [`fwb/page.tsx`](app/admin/marketing/fwb/page.tsx:1) |
| Email KPIs | 📊 | `/admin/marketing/email-kpis` | Open rates, click-through, bounce rates | Existing [`email-kpis/page.tsx`](app/admin/marketing/email-kpis/page.tsx) |
| Newsletter Management | 📰 | `/admin/marketing/newsletters` | Create/edit/send newsletters to subscribers | **NEW** |
| Email Templates | ✉️ | `/admin/marketing/templates` | Reusable email templates with rich editor | Move from [`venue-marketing/templates`](app/admin/venue-marketing/templates/page.tsx:27) |
| Campaigns | 📬 | `/admin/marketing/campaigns` | Targeted emails to buyers/FWB subscribers | Move from [`venue-marketing/campaigns`](app/admin/venue-marketing/campaigns/page.tsx:30) |
| Automations | ⚡ | `/admin/marketing/automations` | Pre/post-show automated emails | Move from [`venue-marketing/automations`](app/admin/venue-marketing/automations/page.tsx:22) |
| Ad Spend / ROAS | 💰 | `/admin/marketing/ad-spend` | Digital ad spend tracking by platform | Existing [`ad-spend/page.tsx`](app/admin/marketing/ad-spend/page.tsx) |
| Social Performance | 📱 | `/admin/marketing/social` | Hashtag performance, engagement metrics | Existing [`social/page.tsx`](app/admin/marketing/social/page.tsx) |
| Demographics | 🗺️ | `/admin/marketing/demographics` | Zip code heatmaps, age/gender breakdowns | Existing [`demographics/page.tsx`](app/admin/marketing/demographics/page.tsx) |
| Lifetime Fan Value | 💎 | `/admin/marketing/lfv` | Customer LTV, repeat buyers, fan segments | Existing [`lfv/page.tsx`](app/admin/marketing/lfv/page.tsx) |
| FWB Import | 📥 | `/admin/marketing/fwb-import` | Migrate newsletter subscribers to FWB | **NEW** |

### Role Visibility
- **Owner:** All cards visible
- **venue_admin / full_admin:** All cards visible EXCEPT "FWB Import" (owner-only operation)
- Owner-only cards get a subtle lock icon for non-owner roles

---

## 5. FWB Import Migration Plan (Section 3)

### Context
The [`NewsletterSignup`](app/components/NewsletterSignup.tsx:7) component on the homepage collects first name, last name, and email into the `newsletter_subscribers` table via [`POST /api/newsletter`](app/api/newsletter/route.ts:98). These subscribers are NOT currently FWB members — they have no `fwb_wallets` record.

### Import Flow (3-Step Wizard)

#### Step 1: Preview
- Fetch all `newsletter_subscribers` who do NOT have a corresponding `fwb_wallets` record
- Display count and scrollable list: name, email, subscribed date, venue
- Allow selecting all or individual subscribers
- Show how many are already FWB members (skip these)

#### Step 2: Configure
- Base tier assignment: `casual_friend` (lowest tier, default)
- Starting benefits balance: 0 (default) or custom amount as welcome bonus
- Send welcome notification: toggle (default: on)
- Confirm venue assignment (auto-detect from `newsletter_subscribers.venue_id`)

#### Step 3: Execute & Report
- Batch create `fwb_wallets` for each selected subscriber
- Match on email: look up `auth.users` by email, or create a "pending" wallet linked by email
- Mark `newsletter_subscribers` with `imported_to_fwb = true` and `imported_at` timestamp
- Show results: X imported, Y skipped (already FWB), Z failed
- Option to download results as CSV

### New API Route

**`POST /api/marketing/fwb-import`** — Owner-only

```typescript
// Request body
{
  subscriber_ids: string[];        // selected newsletter_subscriber IDs
  starting_balance: number;        // default 0
  send_notification: boolean;      // default true
  tier: "casual_friend";           // always base tier for imports
}

// Response
{
  imported: number;
  skipped: number;
  failed: number;
  details: Array<{ email: string; status: "imported" | "skipped" | "failed"; reason?: string }>;
}
```

### Database Changes

Add columns to `newsletter_subscribers`:
```sql
ALTER TABLE newsletter_subscribers
  ADD COLUMN IF NOT EXISTS imported_to_fwb boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS imported_at timestamptz;
```

---

## 6. Event Detail Page Spec

### Route: `/admin/marketing/events/[id]`

### Page Layout

```
┌─────────────────────────────────────────────────────────┐
│  ← Back to Marketing Hub                                │
│                                                         │
│  [Event Image]  Event Title                             │
│                 Date · Venue · Status                    │
│                                                         │
│  ┌──────────┬──────────┬──────────┬──────────┐         │
│  │ Total    │ Revenue  │ Drop     │ Page     │         │
│  │ Sold     │          │ Count    │ Views    │         │
│  │ 245      │ $12,250  │ 187      │ 1,420   │         │
│  └──────────┴──────────┴──────────┴──────────┘         │
│                                                         │
│  [Sales Timeline] ─────────────────────────── Chart     │
│  Line chart showing cumulative ticket sales over time   │
│                                                         │
│  [Revenue Breakdown] ──────────────────────── Chart     │
│  Stacked bar: ticket revenue, fees, facility fees       │
│                                                         │
│  [Ticket Type Breakdown] ──────────────────── Table     │
│  Type | Price | Sold | Available | Revenue              │
│  GA   | $35   | 180  | 20        | $6,300              │
│  VIP  | $75   | 65   | 35        | $4,875              │
│                                                         │
│  [Marketing Performance] ──────────────────── Section   │
│  Email opens/clicks for campaigns targeting this event  │
│  Ad spend ROI (if ad_campaigns linked to this event)    │
│  Social reach (if social_metrics linked to this event)  │
│                                                         │
│  [Drop Count History] ─────────────────────── Chart     │
│  Bar chart: scans per hour on event day                 │
│                                                         │
│  [Page Views Over Time] ───────────────────── Chart     │
│  Line chart from event_views table, daily aggregation   │
│  Conversion rate: views → purchases                     │
└─────────────────────────────────────────────────────────┘
```

### Data Sources

| Section | API Route | Table(s) |
|---------|-----------|----------|
| Header stats | `GET /api/marketing/event-performance/[id]` (NEW) | `events`, `orders`, `tickets`, `event_views` |
| Sales timeline | Same new API | `orders` grouped by date |
| Revenue breakdown | Same new API | `orders` with ticket type joins |
| Ticket type breakdown | Existing [`GET /api/events/[id]/ticket-types`](app/api/events/[id]/ticket-types/route.ts) | `ticket_types` |
| Email performance | `GET /api/marketing/email-kpis?event_id=X` (MODIFY) | `email_campaigns`, `email_sends` |
| Ad spend ROI | `GET /api/marketing/ad-spend?event_id=X` (MODIFY) | `ad_campaigns` |
| Social reach | `GET /api/marketing/social?event_id=X` (MODIFY) | `social_metrics` |
| Drop count history | `GET /api/marketing/event-performance/[id]/scans` (NEW) | `tickets` where `is_scanned=true`, grouped by `scanned_at` hour |
| Page views | Existing [`GET /api/events/[id]/views`](app/api/events/[id]/views/route.ts:27) | `event_views` |

---

## 7. API Routes — New & Modified

### New Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `GET /api/marketing/event-performance` | GET | All events with sales stats for the card grid |
| `GET /api/marketing/event-performance/[id]` | GET | Single event deep analytics |
| `GET /api/marketing/event-performance/[id]/scans` | GET | Hourly scan breakdown for drop count chart |
| `GET /api/marketing/event-performance/[id]/sales-timeline` | GET | Daily cumulative ticket sales |
| `POST /api/marketing/fwb-import` | POST | Batch import newsletter subscribers to FWB |
| `GET /api/marketing/fwb-import/preview` | GET | Preview importable subscribers |

### Modified Routes (add `event_id` filter support)

| Route | Change |
|-------|--------|
| [`GET /api/marketing/email-kpis`](app/api/marketing/email-kpis/route.ts:5) | Add optional `?event_id=X` query param to filter campaigns by event |
| [`GET /api/marketing/ad-spend`](app/api/marketing/ad-spend/route.ts:5) | Add optional `?event_id=X` query param |
| [`GET /api/marketing/social`](app/api/marketing/social/route.ts:5) | Add optional `?event_id=X` query param |

### Existing Routes (no changes needed)

| Route | Used By |
|-------|---------|
| [`GET /api/marketing/fwb`](app/api/marketing/fwb/route.ts:5) | FWB subscriber list |
| [`GET /api/marketing/fwb-email-kpis`](app/api/marketing/fwb-email-kpis/route.ts:5) | FWB welcome email stats |
| [`GET /api/marketing/demographics`](app/api/marketing/demographics/route.ts:5) | Demographics (already supports `?event_id`) |
| [`GET /api/marketing/lfv`](app/api/marketing/lfv/route.ts:5) | Lifetime Fan Value |
| [`GET /api/events/[id]/drop-count`](app/api/events/[id]/drop-count/route.ts:5) | Scanned ticket count |
| [`GET /api/events/[id]/views`](app/api/events/[id]/views/route.ts:27) | Page view stats |
| [`POST /api/newsletter`](app/api/newsletter/route.ts:98) | Newsletter signup |
| `GET /api/email-templates` | Templates CRUD |
| `GET /api/email-campaigns` | Campaigns CRUD |
| `GET /api/email-automations` | Automations CRUD |

---

## 8. Implementation Order

### Phase 1: Sidebar Consolidation
1. Update [`sidebarItems`](app/admin/layout.tsx:18) — remove "Venue Marketing", update "Marketing" to "📣 Marketing" with expanded roles
2. Update [`TAB_KEY_MAP`](app/admin/layout.tsx:42) — remove `venue_marketing` entry
3. Add redirect from `/admin/venue-marketing/*` → `/admin/marketing/*` for bookmarked URLs

### Phase 2: Move Venue Marketing Pages
4. Move [`venue-marketing/templates/page.tsx`](app/admin/venue-marketing/templates/page.tsx:27) → `marketing/templates/page.tsx`
5. Move [`venue-marketing/campaigns/page.tsx`](app/admin/venue-marketing/campaigns/page.tsx:30) → `marketing/campaigns/page.tsx`
6. Move [`venue-marketing/automations/page.tsx`](app/admin/venue-marketing/automations/page.tsx:22) → `marketing/automations/page.tsx`
7. Update all back-links in moved pages from `← Venue Marketing` to `← Marketing Hub`

### Phase 3: Event Performance Cards
8. Create `GET /api/marketing/event-performance` API route
9. Build `DonutChart` SVG component
10. Build `EventPerformanceCard` component
11. Build `EventPerformanceGrid` component
12. Rewrite [`marketing/page.tsx`](app/admin/marketing/page.tsx:16) — event grid on top, tool cards below

### Phase 4: Event Detail Page
13. Create `GET /api/marketing/event-performance/[id]` API route
14. Create `GET /api/marketing/event-performance/[id]/scans` API route
15. Create `GET /api/marketing/event-performance/[id]/sales-timeline` API route
16. Modify existing marketing APIs to support `?event_id` filter
17. Build `marketing/events/[id]/page.tsx` with all chart sections

### Phase 5: FWB Import
18. Add `imported_to_fwb` and `imported_at` columns to `newsletter_subscribers` (migration SQL)
19. Create `GET /api/marketing/fwb-import/preview` API route
20. Create `POST /api/marketing/fwb-import` API route
21. Build `FWBImportWizard` component
22. Build `marketing/fwb-import/page.tsx`

### Phase 6: Cleanup
23. Delete old [`venue-marketing/`](app/admin/venue-marketing/page.tsx) directory (after confirming redirects work)
24. Update any internal links across the app that reference `/admin/venue-marketing`
25. Test all role-based access (owner, venue_admin, full_admin)

---

## Architecture Diagram

```mermaid
graph TD
    subgraph Sidebar
        MKT[📣 Marketing]
        MR[🎯 Market Radar]
    end

    MKT --> HUB[Marketing Hub Page]

    subgraph Section 1 - Event Performance
        HUB --> EPG[EventPerformanceGrid]
        EPG --> EPC1[Event Card 1]
        EPG --> EPC2[Event Card 2]
        EPG --> EPCN[Event Card N]
        EPC1 --> EDP[Event Detail Page /events/id]
    end

    subgraph Section 2 - Marketing Tools
        HUB --> MTG[MarketingToolsGrid]
        MTG --> FWB[FWB Loyalty Hub]
        MTG --> EKPI[Email KPIs]
        MTG --> NL[Newsletters]
        MTG --> TMPL[Templates]
        MTG --> CAMP[Campaigns]
        MTG --> AUTO[Automations]
        MTG --> ADS[Ad Spend]
        MTG --> SOC[Social]
        MTG --> DEMO[Demographics]
        MTG --> LFV[Lifetime Fan Value]
        MTG --> IMP[FWB Import]
    end

    subgraph Event Detail Data
        EDP --> API_EP[/api/marketing/event-performance/id]
        EDP --> API_SC[/api/marketing/event-performance/id/scans]
        EDP --> API_ST[/api/marketing/event-performance/id/sales-timeline]
        EDP --> API_VW[/api/events/id/views]
        EDP --> API_TT[/api/events/id/ticket-types]
        EDP --> API_EK[/api/marketing/email-kpis?event_id]
    end

    subgraph FWB Import Flow
        IMP --> PREV[Step 1: Preview subscribers]
        PREV --> CONF[Step 2: Configure import]
        CONF --> EXEC[Step 3: Execute and report]
        EXEC --> API_FWBI[POST /api/marketing/fwb-import]
    end
```

---

## Migration SQL

```sql
-- Add FWB import tracking to newsletter_subscribers
ALTER TABLE newsletter_subscribers
  ADD COLUMN IF NOT EXISTS imported_to_fwb boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS imported_at timestamptz;

-- Index for quick preview query
CREATE INDEX IF NOT EXISTS idx_newsletter_subs_not_imported
  ON newsletter_subscribers (imported_to_fwb)
  WHERE imported_to_fwb = false;

-- Update sidebar_permissions: rename venue_marketing references to marketing
UPDATE sidebar_permissions
  SET tab_key = 'marketing'
  WHERE tab_key = 'venue_marketing';

-- Ensure no duplicate marketing entries per role/venue
-- (may need manual review after merge)
```

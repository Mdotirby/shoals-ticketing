# West 72 / Shoals Ticketing — Liquid Glass v2 Implementation Plan

**Prepared for:** a Claude Code session working directly in `/Users/mattirby/shoals-ticketing`
**Status of this document:** plan/spec only — no code was written or edited to produce it
**Branch state at time of writing:** repo is on `liquid-glass-redesign` (origin/main is still at the pre-redesign commit `6044a17`)

---

## 0. Read this first — the situation is better than the brief assumed

Before touching anything, two facts change the shape of this whole project:

1. **The customer-facing redesign is already done and committed.** `git log` on `liquid-glass-redesign` shows Home, Events, Event Detail, Checkout, Checkout Success, About, Contact, Login, Footer, and mobile nav all rewritten to the liquid-glass spec, plus a follow-up commit removing emoji site-wide. This matches `west72-all-pages-repo-drop.zip`, `west72-liquid-glass-handoff.zip`, and the two earlier interim drops (`west72-checkout-success-repo-drop.zip`, `west72-event-detail-components.zip` — both superseded by the consolidated all-pages drop; safe to ignore/archive). **There is no customer-facing rebuild work left to plan.** Section 2 covers verification only.
2. **The admin portal has not been touched at all.** Only 3 of 75 files under `app/admin/` and `app/components/admin/` mention "glass," and those are incidental. The admin portal is still on the original dark-navy/gold token system (`--vc-gold*` variables in `app/styles/globals.css`). Everything in `design/liquid-glass/ADMIN_PORTAL_DESIGN_SYSTEM.md` (the 12-page restyle) and everything in the two new mockup zips is **unbuilt**. This is where essentially all remaining work lives.

Also worth knowing before sequencing anything: the current branch is ahead of `origin/main` by the entire finished customer-facing rebuild, and `origin/main` has never seen any of it. That's a merge decision, addressed in Section 7.0.

---

## 1. Deliverable inventory — what exists, where it lives, and its status

| Package | Location | Covers | Status |
|---|---|---|---|
| `west72-liquid-glass-handoff.zip` | `~/Downloads`, also unzipped into repo at `design/liquid-glass/` | Public site full spec + admin spec for 12 core pages + approved Dashboard | Public-site portion: **built**. Admin portion: **not built**. |
| `west72-all-pages-repo-drop.zip` | `~/Downloads` | Real `.tsx` for Events, Event Detail, Checkout, Checkout Success, About, Contact, Login | **Applied** — matches commits `9476ce1`…`79a239b` |
| `west72-checkout-success-repo-drop.zip`, `west72-checkout-success-components.zip`, `west72-event-detail-components.zip` | `~/Downloads` | Earlier interim drops, superseded by the above | **Superseded** — archive, do not re-apply |
| `west72-admin-v2-research-mockups.zip` | `~/Downloads` | Competitive research + `ADMIN_V2_RESEARCH_AND_ROADMAP.md` + 5 new page mockups (Event Workspace ×2 tabs, Permissions, Venues, Dashboard v2) | **Not built** |
| `west72-admin-mobile-mockups.zip` | `~/Downloads` | Mobile-responsive mockups for all 17 admin pages (12 approved + 5 new) + `MOBILE_ADMIN_README.md` | **Not built** |

The repo's own `design/liquid-glass/` folder is just the first zip already unzipped in place (commit `92d6279`) — no need to re-stage it.

---

## 2. Customer-facing site — verification only, not a build task

Nothing here should be re-implemented. Before this branch merges, run the exact QA checklist the original handoff's `RUNBOOK.md` specifies, since it was written for this — I did not re-derive it:

- Homepage hero carousel still autoplays, still swipes on mobile, still filters to West-72-hosted events only
- Mobile hamburger menu opens/closes; "Get Tickets" CTA is inside it, not the collapsed header
- Checkout form still submits; Apple Pay button still behaves as before; **no** "Add to Apple Wallet" button was added anywhere
- No gold/amber anywhere on the public site (grep `--vc-gold` usage under `body[data-operator="west72"]` scope only — the base tokens still exist for other operators, which is correct, see Section 7.6)
- No colored emoji anywhere (the `bb9e3cb` commit claims this is done — spot check)
- Spot-check 4–5 pages against their PNGs in `design/liquid-glass/`

If this checklist passes, treat Section 2 as closed. Do not open `liquid-glass-components.tsx`, `primitives.ts`, or any customer page file unless the checklist finds a real regression.

---

## 3. Admin portal — gap analysis against the *actual* code

The research doc (`ADMIN_V2_RESEARCH_AND_ROADMAP.md`) lists six gaps. Having read the real code, four of the six are less greenfield than the doc assumed — this matters for scoping and risk, so each is corrected below.

**1. No unified per-event workspace — confirmed as stated.** `/admin/events/[id]/edit` and `/admin/events/[id]/ads` are the only two subpages; Seating, Ticket Sales, Offers, Settlements, Contracts, Guest Lists, and Live Pulse are all separate top-level `/admin/*` routes with no per-event hub tying them together. This is a real, structural gap.

**2. No holds/kills/comps as first-class objects — confirmed, and this is the biggest data-model gap in the whole plan.** What exists today: `events.hold_level` (`H1`/`H2`/`H3`, whole-show only, from `plans/calendar-holds-migration.sql`) and `artist_offers.artist_comps` / `artist_offers.marketing_comps` (plain integer counts, from `plans/offer-comps-migration.sql`). Neither is a real object — there's no row per hold with an owner, a type, a ticket-tier reference, or a release action. The mockup's Artist Hold / Promoter Hold / House Comp model requires a genuinely new table. See Section 6.3.

**3. "No Roles & Permissions at all" — not accurate; downgrade this gap.** `admin_users` already has `role` and `venue_id` columns. `/admin/settings/permissions` is a real, working, venue-scoped page-visibility matrix (7 roles × 12 tabs) that persists through `/api/admin/sidebar-permissions` (confirmed by reading the save handler — it's a genuine `POST`, not a mock). The actual gap is narrower than "nothing exists": it's *page-visibility only*, not action-level (can't separately grant "view holds" vs. "release holds," can't restrict specific buttons within a page), and the 7 roles are hardcoded into `admin/layout.tsx`'s `sidebarItems` array rather than being manageable templates. See Section 6.4 for the two ways to close this gap and why one is much lower-risk than the other.

**4. "No multi-venue account layer... implicitly single-tenant" — not accurate; downgrade this gap too.** A `venues` table already exists with a working list/create API (`/api/venues`), an edit page (`app/admin/venues/[id]/edit`), and `admin_users.venue_id` already scopes staff to a venue. There's also a substantial existing architecture plan at `plans/white-label-website-system.md` for per-venue branding that goes well beyond what's live today. The real gap is narrower: no UI concept of "your venues" vs. "client/reseller venues," no switcher, and (need to confirm) no explicit reseller/account-ownership column. See Section 6.5.

**5. Reports are static generator cards, no scheduling — confirmed as stated.** No changes needed to this framing.

**6. No teachability/onboarding layer — confirmed as stated**, though `/admin/onboarding` exists as a route already (currently role-gated to `owner` only in `sidebarItems`) — worth checking what's already there before building the Event Build Checklist pattern from scratch, in case it's a partial start.

**Also found, not in the original gap list:** the admin portal already has a working mobile nav pattern — a sticky top bar with a hamburger that opens an avatar dropdown menu (`admin-mobile-topbar` / `admin-mobile-dropdown-menu` in `app/admin/layout.tsx`). The new mobile mockups specify a different pattern — an off-canvas drawer (`.sidebar` sliding in via `transform: translateX(-100%)`, toggled by a `mobile-nav-open` class on `<body>`), matching the customer site's `MobileNavMenu`. Per the "mockup is truth" rule this is a real structural change to `admin/layout.tsx`'s markup and state, not a pure restyle — flagged in Section 6.2.

**Also found:** promo codes are further along than the roadmap doc implies. `/api/promo-codes` and `/api/promo-codes/validate` already exist with a real migration (`plans/promo-codes-migration.sql`, `plans/promo-codes-presale-migration.sql`). There is no `/admin/promo-codes` (or equivalent) page anywhere in the route tree. The Phase 2 "promo code manager" item is **admin UI only, no backend work** — smaller than it reads in the roadmap doc.

---

## 4. Decisions Matt has already made (do not re-litigate these)

- **Venue-switcher pill:** rolls out to all 12 already-approved admin pages, not just the 5 new ones. Implement as a single change in the shared `Sidebar` component.
- **Next phase after Phase 1:** Phase 2 (remaining Event Workspace tabs + Report Scheduler + promo code manager), not Phase 3 (per-venue branding / onboarding / billing tiers). Phase 3 stays unscheduled — the roadmap doc's own caveat (design against a real second client venue, not a hypothetical one) still applies.

## 5. Decisions still open — the Claude Code session should raise these with Matt before writing the affected code, not guess

1. **Does a hold reduce "Available" inventory the same way a sold ticket does?** The new `ticket_holds` table (Section 6.3) needs to interact with whatever currently computes available ticket count for checkout (`lib/checkout-helpers.ts`, `lib/events/`, and the Stripe payment-intent flow). Read that code first; if holds should block sale of held inventory, that's a checkout-path change, not just an admin-side feature, and deserves its own confirmation before implementation.
2. **Role-enum migration approach for Permissions v2** — see Section 6.4's two options. This changes how every existing role-check call site works if the aggressive option is chosen.
3. **What happens to the 7 existing top-level admin routes** (Seating, Ticket Sales, Offers, Settlements, Contracts, Guest Lists, Live Pulse) once Phase 2 turns them into Event Workspace tabs. Do they redirect into the workspace, stay as global (all-events) list views with the workspace handling only the per-event slice, or both live side by side indefinitely? This is a real product decision with URL/bookmark implications, not an implementation detail.
4. **Confirm the mobile nav pattern replacement** (Section 3, "also found") is wanted — it's a UX/behavior change to `admin/layout.tsx`, not a pure skin change, even though it's presented as part of the "additive CSS pass" mobile mockups.

---

## 6. Sequenced implementation plan

Ordered so nothing live breaks, and so low-risk/high-leverage work lands before anything touching data models. Each step names its files, its change type (**improve** = restyle/extend without touching behavior; **restructure** = reorganize existing working code/routes; **rebuild** = new subsystem with no existing equivalent), and whether it's a breaking or data-model change.

### 6.0 — Branch hygiene (do this first, before any admin work)

The customer-facing rebuild is finished and QA'd (Section 2) but has been sitting on `liquid-glass-redesign` unmerged, with `origin/main` untouched. Recommend: finish the Section 2 checklist, merge the customer-facing work to `main` on its own, then branch admin work (`admin-liquid-glass` or similar) off the updated `main`. This ships the already-done, already-verified win independently instead of letting it ride for weeks behind admin work that's about to start from zero — and keeps the eventual admin PR's diff limited to admin files.

### 6.1 — Admin design-system foundation (**improve**, no breaking changes)

- Merge `design/liquid-glass/admin-globals.css.snippet.css` into `app/styles/globals.css` (additive — new classes, doesn't touch `--vc-gold*` tokens other operators still use).
- Add the admin-only component set — `Sidebar` (with the venue-switcher pill per Matt's decision), `StatusBadge`, `ListRow`, `DataTable`, `CalendarGrid`, `ReportCard`, `ScannerPanel`, `GaugeRing` — as a new file, e.g. `app/components/admin/liquid-glass-admin.tsx`, matching the existing `app/components/admin/` convention rather than bloating the customer-only `app/components/liquid-glass-components.tsx` (216 lines, customer components only — `GlassCard`, `Button`, `Chip`, `TicketCard`, `HotelPartnerPanel`). `KpiTile` already exists (`app/components/admin/StatsCard.tsx` per the doc's own note) — extend/reskin it, don't duplicate it.
- This step ships nothing visible yet — it's the shared layer steps 6.2–6.6 consume.

### 6.2 — Restyle the 12 approved admin pages (**improve**, restyle-only per the original RUNBOOK's hard constraints)

Dashboard, Events, Calendar, Seating, Ticket Sales, Offers, Settlements, Contracts, Reports, Scanner, Guest Lists, Live Pulse (list + detail). One page at a time, each a separate commit, each checked against its PNG in `design/liquid-glass/` before moving on — same process the customer-facing pass already proved out.

Preserve exactly (do not touch the underlying logic, only the surrounding markup/classes):
- Calendar drag-to-reschedule / click-to-create, if present
- Scanner's camera access and QR-decode logic
- Live Pulse's auto-refresh polling interval and manual "Refresh Now"
- Any admin accordion or form-submit logic

Include the venue-switcher pill here (Matt's decision, Section 4) as part of the shared `Sidebar` component change — one place, all 12 pages get it for free.

**Separately, restructure the mobile nav** (**restructure**, not pure restyle — flagged per Section 5.4): replace `admin-mobile-topbar`'s dropdown-menu pattern in `app/admin/layout.tsx` with the off-canvas drawer pattern from `MOBILE_ADMIN_README.md` (`transform: translateX(-100%)` on `.sidebar`, toggled by a `mobile-nav-open` class). The existing `sidebarOpen` state can likely drive the new class toggle directly — the state model doesn't need to change, only what it controls in the DOM.

### 6.3 — Mobile-responsive CSS pass for the same 12 pages (**improve**, additive per `MOBILE_ADMIN_README.md`'s own framing — "one additive CSS pass, not a rebuild")

- KPI/tile rows: 3–4 columns → 2 below 680px
- Side-by-side panels stack to one column
- Tables and the calendar grid keep real column widths and scroll horizontally — do not crush columns to fit
- List rows: thumbnail+title on line one, badges/actions drop to their own line below

Do this after 6.2 per page, or as one pass across all 12 once 6.2 is done — either ordering is safe since it's additive CSS only.

### 6.4 — Dashboard "Attention Needed" + Quick Actions (**improve**, purely additive)

Layer the new panel (unsigned contracts, settlements ready to finalize, holds about to expire) and Quick Actions row onto the *existing* dashboard component — the mockup itself is explicit that this sits above current content, not a replacement. Low risk, no dependency on anything else in this plan except the component set from 6.1. Good candidate to pull forward if the team wants an early visible win — it doesn't block or get blocked by 6.5–6.7.

Note: "holds about to expire" in the Attention Needed panel implies the holds data model from 6.6 — if 6.4 ships before 6.6, stub that one card or launch it after 6.6 lands.

### 6.5 — Roles & Permissions v2 (**improve** with one explicit decision, not a rebuild)

Two ways to close this gap, in order of recommendation:

- **(a) Layer role templates over the existing system (recommended, non-breaking).** Keep the current `admin_users.role` enum and the existing `sidebar_permissions` table/API. Add a new action-level permissions layer (a table like `admin_permissions(role, resource, action, allowed)` or similar) that the four new "templates" (Owner, Venue Manager, Box Office Staff, Door Staff) write into, alongside the page-visibility rows that already work. Every existing role-check call site keeps working unmodified.
- **(b) Replace the role enum with the four new templates.** True to the mockup, but touches every call site that currently checks `role` — `admin/layout.tsx`'s `sidebarItems`, `settings/permissions/page.tsx`'s `TABS`/`DEFAULTS`, and any admin API route doing its own role check (grep `admin_users.role` and `.role ===` across `app/api/admin/` before starting). Needs a data migration mapping the 8 existing roles (`owner`, `venue_admin`, `full_admin`, `box_office`, `read_only`, `door_greeter`, `artist`, `partner`, plus `super_admin` seen once in broadcasts) onto the 4 new templates — a real breaking change if any external integration or seed script depends on the old role strings.

This is Decision #2 from Section 5 — get Matt's answer before writing either version.

### 6.6 — Venues v2 (**improve** for the switcher/list, **small data-model change** for the client/reseller distinction)

- Venue switcher pill: ships as part of 6.1/6.2's `Sidebar` work, reading from the existing `/api/venues`.
- "Your venues" vs. "Client venues" sectioning on the new Venues settings page needs a new column (e.g. `venues.account_type` or `venues.owner_account_id`) — write this as a new file following the existing convention (`plans/venues-account-type-migration.sql` or similar), additive and nullable so it doesn't break any existing venue row.
- Per-venue branding controls belong to Phase 3 (deferred, Section 4) — don't pull them forward into this step even though they'll live on the same page eventually. Cross-reference `plans/white-label-website-system.md` when that phase starts; it already has a schema and phased plan drafted, no need to re-derive it.

### 6.7 — Event Workspace: Overview tab (**restructure**, no data-model change)

Build the new tabbed hub shell (header strip, 7-tab bar, At-a-Glance card, Quick Actions, Event Build Checklist) as the new landing at `/admin/events/[id]`, with the Overview tab populated from data the existing `edit` page already fetches — this is UI restructuring, not new data. Leave `/admin/events/[id]/edit` and `/admin/events/[id]/ads` reachable (either as tabs inside the new shell or linked from it) until Decision #3 (Section 5) resolves how the other top-level pages fold in.

### 6.8 — Event Workspace: Inventory & Holds tab (**rebuild** — the single biggest lift in this plan, real data-model change)

Blocked on Decision #1 (Section 5). Once resolved:

- New table for individual holds (working name `ticket_holds`): event id, ticket-tier reference, type (`artist_hold` / `promoter_hold` / `house_comp`), quantity, owner/assigned-to, status, created/released timestamps.
- New migration file, `plans/` convention, additive.
- Inventory & Holds tab UI: ticket-type table (Price/Total/Sold/Held/Comp/Available) + a holds list with a Release action per row.
- If Decision #1 says holds should reduce sellable inventory, this touches the checkout availability calculation — treat that as its own sub-task with its own review, not something to fold silently into the admin-only UI work.

### 6.9 — Phase 2 (Matt's chosen next phase, sequenced after Phase 1 above)

- **Remaining Event Workspace tabs** (Orders, Settlement, Marketing, Guest List, Access) — **restructure**: re-plumb the existing Ticket Sales, Settlements, event-ads (`/admin/events/[id]/ads`), and Guest Lists pages' logic into tab content inside the shell from 6.7, rather than rewriting their internals. "Access" likely absorbs the existing promo-codes/presale system (Section 3) into a per-event view.
- **Report Scheduler** — **rebuild**, additive: a `report_schedules` table plus a cron route following the project's existing Vercel Cron convention (`app/api/cron/*` already has several examples, e.g. `update-metrics`, `release-seats`). No changes to existing report generation.
- **Promo code manager** — **new admin UI only**, no backend work (Section 3's correction) — build a page against the existing `/api/promo-codes` and `/api/promo-codes/validate` endpoints and existing migrations.

---

## 7. Cross-cutting notes for the Claude Code session

- **7.1** Work one admin page/feature at a time, commit per page/feature (mirrors how the customer-facing pass was done — it's in the git history as a model to follow), and visually check each against its PNG before moving on.
- **7.2** Every "restyle-only" step above carries the same hard constraints the original customer-facing RUNBOOK used: don't touch routing, data fetching, or business logic; if a live component's real structure doesn't line up cleanly with a mockup, stop and ask rather than guessing or restructuring it unasked.
- **7.3** Monochrome inline SVGs only, no emoji — already the house rule, already enforced site-wide on the customer side (`bb9e3cb`).
- **7.4** No gold/amber anywhere, including new severity systems (the Attention Needed panel's severity dots are explicitly red/blue/white in the mockup, not amber) — verified as a deliberate choice in the roadmap doc's own "Decisions flagged" section.
- **7.5** No fake/non-functional controls — every dropdown, toggle, and button must actually do something, per the standing correction from earlier in this project.
- **7.6** The `--vc-gold*` tokens in `globals.css` stay in place for *other* operators using this platform — only the `body[data-operator="west72"]` scope retires gold. Don't delete the base tokens.
- **7.7** Measure actual proportions and check existing CSS before adding overrides, especially in `admin-globals.css.snippet.css` vs. whatever inline styles the current admin pages already carry (several admin files use inline `style={{}}` rather than classes, per the permissions-page read — check each page's existing pattern before assuming a clean class-only swap).

---

## 8. Open items for Matt (not decided in this session)

1. Answer Decision #1 (holds vs. checkout availability) before Section 6.8 starts.
2. Answer Decision #2 (role-enum migration approach) before Section 6.5 starts.
3. Answer Decision #3 (fate of the 7 existing top-level routes) before Section 6.9's tab re-plumbing starts — doesn't block 6.7's Overview tab.
4. Confirm the mobile nav pattern replacement (Decision #4) before the `admin/layout.tsx` markup change in 6.2.
5. Check `/admin/onboarding`'s current state before building the Event Build Checklist pattern (Section 3, gap #6) — may be a partial start, not a blank page.

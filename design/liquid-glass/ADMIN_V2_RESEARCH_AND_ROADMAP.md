# West 72 Admin — Research, Gap Analysis & v2 Roadmap

You asked for a deep look at Ticketmaster's TM1, Tixr, Etix, and Eventbrite's admin/back-office tools, a gap analysis against what you've already built, and mockups of the improvements — built to be teachable to other operators, since you're planning to license this to other venues. Here's what the research actually found, where your build already stacks up, where it doesn't, and five new mockups addressing the highest-leverage gaps.

## What the research found, by functional area

**Event build.** TM1's biggest documented advantage is reusable event templates that bundle venue layout, pricing, ticket types, and holds/kills together, so a recurring show or tour date builds in minutes instead of days (business.ticketmaster.com/solutions/event-creation-management). Tixr's Studio unifies GA, timed entry, and reserved seating in one builder with "Price Books" editable live without taking an event offline (creators.tixr.com/products/platform). Eventbrite's build flow is the most transparently documented: venue designer → seat-to-tier assignment → per-tier pricing → holds/access codes (eventbrite.com/help, "how-to-set-up-a-reserved-seating-event").

**Holds, kills, comps.** TM1 explicitly separates **artist, production, and promoter holds** as distinct categories baked into templates. Tixr lists holds/comps/access codes as first-class Studio objects ("release holds, kill seats, update pricing... from any device"). Eventbrite is the most granular: separate permissions for *viewing* vs. *managing* holds, plus access-code-gated hold releases. Etix has no public documentation on this at all — a real gap in their public docs, not necessarily their product.

**Box office / day-of-show.** Ticketmaster's Event Day product does real-time entrance-by-entrance scan monitoring with color-coded alerts and a 60-second attendance refresh. Etix's Mobile Box Office (walk-up sales) is explicitly built for "rapid seller onboarding — up and running in minutes," while their separate Etix Manager app is sales-monitoring only and reviewers complain it can't validate tickets at all — a real product gap on Etix's side worth noting since it's a cautionary example, not just a benchmark to beat.

**Reporting & settlement.** Etix has the deepest public documentation here: 150+ report types, a Report Scheduler that auto-runs favorite reports on a cadence, a Sales Matrix heat map, and Sales-by-Geo clustering (hello.etix.com/clients/reporting-analytics). Eventbrite's Payout Summary and Itemized Payout Report are the closest thing to a formal settlement statement. TM1 job-posting evidence suggests settlement is a manual, staff-driven task performed per-performance, not automated.

**Roles & permissions.** This is where Eventbrite is dramatically ahead of the other three publicly: four default roles (Owner, Admin, and two check-in-only variants that **cannot** be combined with other permissions), plus a checkbox-level custom-role builder spanning events, holds, orders, marketing, reporting, and payouts (eventbrite.com/help, "permissions-definitions"). TM1's own docs suggest the opposite — historically a suite of semi-separate tools (Host, Archtics, Account Manager, Event Management) each provisioned individually rather than one unified permission model.

**Multi-venue / reseller structure.** This is the most important finding for your resale plan, and the thinnest public documentation of the whole research pass. Eventbrite's **Multi-Organization** feature — one login, multiple org profiles, each with its own team/roles, switchable from a picker — is the closest existing model to what you'd need (eventbrite.com/blog/ds00-multi-organization-is-live). Etix's whole business model implies white-label per-venue isolation, but nothing public describes a parent/reseller account layer. TM1's suite-of-separate-systems architecture doesn't map cleanly to "one owner account, many venues" either. **None of the four platforms have a publicly documented answer that's a perfect template — Eventbrite's org-switcher is the best available reference, not a proven blueprint.**

**Onboarding / teachability.** Etix has the most concrete program — Etix University (webinars, 1:1 coaching, a searchable knowledge base) plus an explicit "sellers up and running in minutes" claim for their walk-up app. Eventbrite's tightly-scoped check-in-only roles are themselves a teachability pattern: limiting what a seasonal door-staffer's login can do reduces training surface area, not just security risk.

*(Full source list with URLs is in the research pass — ask if you want the raw citations reproduced here; trimmed above for length.)*

## Gap analysis: your current 12-page admin vs. the above

What you already have is genuinely solid and, on visual polish, ahead of all four — none of these platforms' public marketing screenshots look as considered as your liquid-glass system. The functional gaps are structural, not cosmetic:

1. **No unified per-event workspace.** Seating, Sales, Offers, Settlements, Contracts, Guest Lists, and Live Pulse are all separate top-level sections. Every platform researched — TM1 and Tixr especially — treats "manage this one event" as a single hub, not six unrelated pages you have to remember to visit. This is the single biggest structural gap.
2. **No holds/kills/comps as a distinct inventory object.** You have Calendar-level holds (a whole show, gold-dashed chip) and Guest Lists (comps), but nothing between them — no artist-hold vs. promoter-hold vs. house-comp distinction at the ticket-tier level, which TM1, Tixr, and Eventbrite all treat as first-class.
3. **No Roles & Permissions at all.** It's listed as a Phase-2 Settings route but nothing exists yet. This directly blocks "teach other operators" and is a hard requirement before you can sell to a second venue with any staff beyond you.
4. **No multi-venue account layer.** The whole system is implicitly single-tenant. Reselling this platform requires an actual place for a second venue's staff, branding, and permissions to live without you rebuilding the app per client.
5. **Reports are static generator cards** — no scheduling/automation, no saved/favorite reports (Etix's Report Scheduler is the concrete pattern to steal).
6. **No teachability layer** — no contextual help, no guided "first event" checklist, nothing scoped down for a brand-new operator's first login.

## What's in this delivery

Five mockups addressing gaps #1, #3, #4, and #6 directly (same liquid-glass system, `admin_shared.py`, zero changes to any class already in use):

1. **`admin_event_workspace_overview.png`** — the new per-event hub. Header strip (thumbnail, status, Sold/Gross/Days-Out) + a 7-tab bar (Overview · Inventory & Holds · Orders · Settlement · Marketing · Guest List · Access) + an **Event Build Checklist** (directly the teachability pattern from the research — a new operator sees exactly what's done and what's left, in order) + an At-a-Glance card + Quick Actions.
2. **`admin_event_workspace_inventory.png`** — same hub, Inventory & Holds tab selected, showing the tab-switching concept concretely. A real ticket-type table (Price/Total/Sold/Held/Comp/Available) plus a Holds list using TM1's own **Artist Hold / Promoter Hold / House Comp** categories, each with an owner and a Release action — this is gap #2, closed.
3. **`admin_permissions.png`** — Roles & Permissions, closing gap #3. Four role templates (Owner, Venue Manager, Box Office Staff, Door Staff) with Door Staff explicitly locked to check-in only — directly Eventbrite's exclusivity pattern — plus a full checkbox permission editor grouped by area.
4. **`admin_venues.png`** — closes gap #4. A venue switcher pill now lives in the sidebar (see note below) and this Settings page lists every venue on the account — yours, plus a "Client Venues" section with a sample onboarding venue, making the resale architecture concrete rather than abstract.
5. **`admin_dashboard_v2.png`** — an **additive** proposal for the already-approved Command Center: an "Attention Needed" panel (unsigned contracts, settlements ready to finalize, holds about to expire) and a Quick Actions row. Explicitly marked in the mockup itself as sitting *above* your existing dashboard content, not replacing it.

## Decisions flagged, not assumed

- **The sidebar venue-switcher pill is new and appears on every page in this delivery** — it's a small, global addition (one line in `sidebar()`), not something scoped to just the Venues page. Confirm you want it everywhere before it goes into the other 12 already-approved pages; I didn't re-render those to add it without your sign-off.
- **No amber/gold reintroduced anywhere**, including the new "Attention Needed" severity dots — they use only colors already in your palette (red / soft blue / neutral white), consistent with the existing "gold retired everywhere" rule, even though a 3-tier severity system would conventionally reach for amber.
- **Role-card icons are monochrome inline SVGs, not emoji** — caught and fixed before delivery; this project already established that rule on Seating/Scanner and it would have been a real inconsistency to reintroduce it here.
- **Dashboard v2 is deliberately partial**, not a full redraw — I don't have the original approved dashboard's exact markup in this pass, and redrawing the whole thing from a verbal description would repeat the exact "reconstructed from a picture instead of the real thing" mistake from the Checkout Success work. This mockup shows only the new pieces; the actual implementation should layer them onto your real dashboard code, not replace it wholesale.

## Suggested roadmap

**Phase 1 (this delivery):** Event Workspace (Overview + Inventory tabs), Roles & Permissions, Venues, Dashboard "Attention Needed" addition.

**Phase 2:** Build out the remaining Event Workspace tabs (Orders, Settlement, Marketing, Guest List, Access) as real pages using the same hub — this is mostly re-plumbing your existing Sales/Settlements/Offers/Guestlists pages into tab content rather than new design work. A Report Scheduler on the Reports page (Etix's pattern). Promo code manager under Marketing.

**Phase 3 (resale-specific):** Per-venue branding controls (logo/colors) inside the Venues page, a client-venue onboarding checklist (mirrors the Event Build Checklist pattern), and usage-based billing/plan tiers once you have a second real client venue to design against instead of guessing at their needs in the abstract.

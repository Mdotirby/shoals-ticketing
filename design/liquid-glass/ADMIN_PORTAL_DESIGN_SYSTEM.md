# West 72 Admin Portal — Liquid Glass Redesign

This covers the **internal admin portal** (`/admin/...`), redesigned in the same black/white liquid-glass system as the public site and the already-approved Command Center dashboard (`dashboard.png`). Same rule as the public-site pass: **this is a visual-only restyle.** Every field, filter, button, table, and interactive behavior on these pages stays exactly as it works today — only color, surface, type, and spacing change. Gold/amber is retired everywhere and replaced with white or a neutral outline treatment (see Status badges below); the only non-monochrome colors left are the existing semantic green/red, plus one new soft blue for an "in-progress/sent" state that was previously indistinguishable from gold.

Fonts, tokens, and the base `.glass` treatment are identical to the public-site system — see `LIQUID_GLASS_DESIGN_SYSTEM.md` for the full token list. `admin-globals.css.snippet.css` in this package has the complete, ready-to-drop-in CSS for every class referenced below.

## Scope of this pass

The portal has **24 routes total** under the sidebar's six groups (Dashboard, Shows, Finance, Day of Show, Marketing, Contacts, Settings). This delivery covers the **12 core operational pages** — the ones tied directly to running shows and money:

| Group | Pages redesigned |
|---|---|
| — | Dashboard (`dashboard.png` — already approved, unchanged) |
| Shows | Events, Calendar, Seating |
| Finance | Ticket Sales, Booking/Offers, Settlements, Contracts, Reports |
| Day of Show | Scanner, Guest Lists, Live Pulse (list view + the per-event live analytics view) |

**Not yet redesigned — flagged as a Phase 2 candidate, not started:** Marketing (Campaigns, Broadcasts, Market Radar, Auctions, Sponsors), Contacts (Agents), and Settings (Branding, FAQ Content, Venue Portal, Procedures, Permissions, Onboarding) — 12 routes in total. These stay on the current dark/gold theme until Matt confirms whether to fold them into this pass. The sidebar component below already knows how to render them (as plain collapsed groups); nothing about the sidebar needs to change if that Phase 2 work never happens.

## Sidebar (shared shell)

One `Sidebar` component drives every admin page — logo mark, "Welcome, Matt / West 72 Entertainment LLC," the nav tree, "Sign Out" pinned to the bottom. Behavior to preserve: **only the group containing the current page expands** (its sub-links show), every other group renders as a collapsed header with a chevron. This matches how the live portal already behaves — don't build an "all expanded" or "all collapsed" state that isn't there today.

- `.nav-item` — flat top-level link (just Dashboard).
- `.nav-section` — a group header (SHOWS, FINANCE, DAY OF SHOW, MARKETING, CONTACTS, SETTINGS) with a chevron (▾ expanded / ▸ collapsed).
- `.nav-sub` — a sub-link inside an expanded group; `.nav-sub.active` for the current page.

## Status badges — the gold retirement, specifically

Gold/amber previously carried real meaning (draft, pending, hold) with no other visual cue. It's gone; each state now has its own treatment so nothing is lost:

| State | Old | New | Class |
|---|---|---|---|
| Draft / unpublished / pending | Gold fill | Neutral translucent-white outline pill | `.badge-draft` |
| Published / live | White fill (unchanged) | White fill | `.badge-live` |
| Confirmed / Accepted / Finalized / Signed | Green | Green (unchanged) | `.badge-good` |
| Cancelled | Red | Red (unchanged) | `.badge-bad` |
| Sent (contract awaiting signature) | Blue | Soft blue (unchanged hue, now part of the formal palette) | `.badge-info` |
| Calendar hold (vs. confirmed show) | Gold dashed chip | White dashed chip, still visually distinct from a solid confirmed chip | `.cal-chip.hold` |

Type/category tags that carry no status meaning (Hard Ticket, Private, All Ages, etc.) use the plain neutral `.tag` chip — these were never gold and don't change.

## Page notes

**Events** (`admin_events.png`) — filter row (event-type dropdown, status dropdown, "Show past events" toggle) above a single glass list card; each row is thumbnail + title/venue/date + type tag + status dot/text + publish badge, price right-aligned, Edit/Delete actions. `.list-row` is the reusable pattern here and on Booking/Offers.

**Calendar** (`admin_calendar.png`) — month grid (`.cal-grid`), year/month picker, legend (Confirmed/Hold/Cancelled), "+ Quick Hold" and "+ New Show" actions. Drag-to-reschedule or click-to-create behavior, if it exists today, is untouched — this is a skin over the same grid.

**Seating** (`admin_seating.png`) — sparse by design on the real site: a list of saved layouts (dimensions, created date) with Open Builder / Delete. Don't over-build this one; the seating *builder* itself wasn't crawled and isn't part of this pass.

**Ticket Sales** (`admin_sales.png`) — per-show Sold / Available stats plus a small percentage-sold ring (`.ring`). Venue filter dropdown, "Show past shows" toggle.

**Booking / Offers** (`admin_offers.png`) — same `.list-row` pattern as Events; Draft/Accepted badge, price, Edit/Delete.

**Settlements** (`admin_settlements.png`) — two sectioned lists, Drafts and Finalized, each row showing sold/comps/gross inline as meta text next to the status badge, "Open →" action. Keep the explanatory copy at the top (how a settlement gets created from Sales vs. Manual Settlement) — it's real onboarding copy, not filler.

**Contracts** (`admin_contracts.png`) — the one genuine data table in the portal (`.dtable`), with an Artist Contracts / Co-Promote Agreements tab switcher above it. Status badges inline in the table use the same badge classes as everywhere else.

**Reports** (`admin_reports.png`) — a stack of report-generator cards (Ticket Audit, Monthly Revenue, Expense, Orders), each with its own filter fields and Generate/Export actions. `.report-card` repeats cleanly for any future report type.

**Scanner** (`admin_scanner.png`) — event picker up top, camera preview frame, Start Camera / Scan from Photo, name/email search, collapsible Manual Code Entry. **Functional note:** this page requests real camera access and does live QR decoding — restyle the chrome only, don't touch the camera/permission flow or the decode logic.

**Guest Lists** (`admin_guestlists.png`) — event selector, guest-list summary card with Print action, Add Guest form, and a separate Artist Assignments card (comp limits). Two independent forms side by side on desktop, stack on mobile.

**Live Pulse** (`admin_live_list.png` list view, `admin_live_detail.png` per-event view) — the list is a simple grid of upcoming shows, each linking to its own live analytics view. **Functional note, same category as the homepage carousel:** the detail view auto-refreshes on a real interval (the page shows "Auto-refreshing every 15s") and includes a manual "Refresh Now." Restyle the gauges/cards/chart placeholders — the two circular gauges (`.gauge .ring2`, conic-gradient based) for Tickets Sold / Checked In are pure CSS, no library needed — but leave the polling/refresh logic exactly as it is.

## Components added

`Sidebar`, `StatusBadge` (draft/live/good/bad/info variants), `ListRow` (thumbnail + body + right stats/actions), `DataTable`, `CalendarGrid`, `ReportCard`, `ScannerPanel`, `GaugeRing`, `KpiTile` (already existed from the dashboard). All are plain CSS-driven — no chart or calendar library required for anything shown here.

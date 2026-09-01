# Admin Portal — Mobile Pass

All 17 admin pages (the 12 already-approved pages plus the 5 new v2 pages from the last delivery), rendered at phone width. Same liquid-glass design system, same `admin_shared.py` — this is one additive CSS pass, not a rebuild, so nothing about the desktop pages changed and no page's markup was touched.

## What's in here

One `_mobile.png` per page (17 total), plus `admin_events_mobile_nav_open.png` — a single reference shot showing the sidebar as an open drawer, since that interaction only needs demonstrating once.

## The pattern, if your dev is wiring this up

**Navigation.** The sidebar becomes an off-canvas drawer behind a hamburger button in a slim sticky top bar, below 680px wide. It's pure CSS right now (`transform: translateX(-100%)` on `.sidebar`, flipped by a `mobile-nav-open` class on `<body>`) — a real build wires the hamburger's `onClick` to that same class toggle, the same pattern already used for `MobileNavMenu` on the customer-facing site.

**Multi-column layouts.** Tile/KPI rows (Events list stats, Live Pulse's gauges) drop from 3–4 columns to 2. Side-by-side content panels (the Event Workspace's two-column layout, Command Center's Attention Needed + Build Progress, Guest Lists' form + assignments) stack to a single column.

**Tables and the calendar.** The ticket inventory table, Contracts table, and the 7-day calendar grid keep their real column widths and scroll horizontally, rather than crushing every column down to unreadable. That's a deliberate choice, not a limitation — collapsing a data table to illegible 40px columns is worse than a swipe.

**List rows** (Events, Sales, Offers, Settlements, Seating layouts, Venues, Holds). Thumbnail and title stay on the first line; price, badges, and the Edit/Delete buttons drop to their own full-width lines below instead of being squeezed into a single cramped row.

**The 7-tab Event Workspace bar** scrolls horizontally instead of wrapping into a multi-row mess.

## One thing worth deciding

Box office and door staff are the two roles most likely to actually be on a phone mid-show — the Scanner page is already phone-shaped by design (single centered card, no dense grid). Everything else here is "make it not break on a phone," not "redesigned for one-handed door-staff use." If you want the Scanner flow itself rethought for a phone-first door experience (bigger tap targets, a persistent "next guest" queue, etc.) that's a real follow-up worth scoping separately rather than folding into this responsive pass.

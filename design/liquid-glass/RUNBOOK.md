# Liquid Glass Redesign — Handoff Runbook

This package has everything a Claude Code session needs to implement the redesign against your real codebase, safely, without touching anything functional. Follow these steps in order on the work iMac.

## 0. What's in this zip

- `LIQUID_GLASS_DESIGN_SYSTEM.md` — public site design spec (Home, Events, Event Detail, Checkout flow, About, Contact, Login, mobile nav states).
- `ADMIN_PORTAL_DESIGN_SYSTEM.md` — admin portal design spec (Dashboard + the 11 other core admin pages).
- `globals.css.snippet.css` / `admin-globals.css.snippet.css` — the actual CSS classes referenced in both docs, ready to drop into your stylesheet.
- `liquid-glass-components.tsx` — reference React components (GlassCard, EventCard, TicketCard, ApplePayButton, HeroCarouselChrome, MobileNavMenu, HotelPartnerPanel, etc.) — a starting point, not a required 1:1 match to your existing components.
- `tailwind.config.snippet.js` — token additions if you're on Tailwind.
- Every page mockup as a PNG, desktop + mobile where applicable (`home.png`, `home_mobile.png`, `events.png`, `event_detail.png`, `checkout_step.png`, `checkout_success.png`, `about.png`, `contact.png`, `login.png`, `mobile_nav_states.png`, `admin_events.png`, `admin_calendar.png`, `admin_live_detail.png`, etc.) plus the already-approved `dashboard.png`.

## 1. Get this onto the work iMac

Easiest path: open this same Claude conversation in the Claude desktop app **on the work iMac** (same account) and download the zip from there directly — no AirDrop/USB/email needed. If that's not convenient, any file transfer method works.

## 2. Stage the design package in the repo (no code changes yet)

```bash
cd /path/to/west72ent-repo
git checkout main
git pull
git checkout -b liquid-glass-redesign

mkdir -p design/liquid-glass
# unzip the package into design/liquid-glass/
unzip ~/Downloads/west72-liquid-glass-handoff.zip -d design/liquid-glass

git add design/liquid-glass
git commit -m "Add liquid-glass design reference package (assets only, no code changes)"
git push -u origin liquid-glass-redesign
```

Push this branch and open a draft PR on GitHub now, before any real code changes. If Vercel's GitHub integration is set up normally, this alone creates a **preview deployment** — a safe, non-production URL. Confirm that preview loads and looks identical to production right now (it should, since nothing in the actual app changed yet). That confirms the pipeline works before Claude Code touches anything.

## 3. Launch Claude Code in the repo

```bash
cd /path/to/west72ent-repo
claude
```

## 4. Paste this as your opening prompt

```
I'm redesigning west72ent.com's visual style to a black-and-white "liquid glass"
system (translucent blurred glass panels, white accents, Archivo font) — replacing
the current gold/amber accent color everywhere with white or a neutral outline.
The full spec is in design/liquid-glass/LIQUID_GLASS_DESIGN_SYSTEM.md (public site)
and design/liquid-glass/ADMIN_PORTAL_DESIGN_SYSTEM.md (admin portal), with matching
CSS in the .css.snippet.css files, reference components in
liquid-glass-components.tsx, and a PNG mockup for every page in that same folder.
The admin Dashboard page is already built and approved — use it as the visual
baseline if you need a tiebreaker on any spacing/color question the docs don't
cover.

This is a VISUAL-ONLY pass. Read both markdown docs fully before touching any
code. Hard constraints:

- Do not change any routes, URLs, data fetching, API calls, or business logic.
- Do not touch the homepage hero carousel's autoplay timer, swipe/drag/touch
  handlers, or its "hosted by West 72" filter query — restyle the existing
  slide/arrow/dot DOM only.
- Do not touch the mobile nav's open/close state logic — restyle the existing
  markup/state only.
- Do not touch checkout form submission, payment processing, or the Apple Pay
  button's actual wiring — restyle only. Do not add an "Add to Apple Wallet"
  button anywhere (no Apple Developer Program enrollment — see the design doc).
- Do not touch the admin Live Pulse page's auto-refresh polling interval or the
  Scanner page's camera/QR-decode logic — restyle only.
- Do not touch any drag-to-reschedule, accordion, or form-submit logic anywhere
  in the admin portal.
- If you find a component whose real structure doesn't line up cleanly with a
  mockup, stop and ask me rather than guessing or restructuring it.

Process:
- Work one page at a time, in this order: [Home, Events, Event Detail, Checkout
  flow, Checkout Success, About, Contact, Login, mobile nav] then the admin
  pages. (Reorder this list if you'd rather do admin first.)
- After each page, run the dev server and visually check it against that page's
  PNG before moving to the next one.
- Commit after each page with a message naming the page (e.g. "liquid glass:
  Home page").
- Stay on the liquid-glass-redesign branch (or cut sub-branches from it) —
  never push directly to main/production.
- When everything's done, open the PR (or mark the draft one ready) so I can
  review the Vercel preview before merging.

Start with the Home page.
```

Adjust the page order or split it into multiple shorter sessions if that's easier to review incrementally — smaller diffs are easier to sanity-check.

## 5. QA the Vercel preview before merging — don't skip this

Once Claude Code has worked through the pages and pushed, open the **preview URL** for that branch/PR (not production) and check:

**Still works exactly as before:**
- Homepage hero carousel still autoplays, still swipes on mobile, still only shows West-72-hosted events
- Mobile hamburger menu still opens/closes, "Get Tickets" CTA appears inside it and not in the collapsed header
- Checkout form still submits; the Apple Pay button still behaves as it does today
- Admin Live Pulse page still auto-refreshes every ~15s and "Refresh Now" still works
- Admin Scanner page still prompts for camera access and scans a real code
- Any admin calendar drag/reschedule or accordion behavior still works

**Looks right:**
- No gold/amber left anywhere, public site or admin
- Spot-check 4-5 pages against their PNGs (colors, spacing, type)
- Mobile breakpoints match the mobile PNGs, especially the event card layout and the checkout success ticket card (both were explicitly kept dense/one-line per earlier feedback)

Only merge to `main` once you've personally clicked through the preview. Vercel keeps prior production deployments, so if something slips through, "Instant Rollback" in the Vercel dashboard gets you back to the last good deploy in seconds while you fix it on the branch.

## One more thing

Don't paste any real secrets, API keys, or `.env` values into the Claude Code chat — this is a styling pass and shouldn't need any of them.

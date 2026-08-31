# West 72 — Liquid Glass Design System

This package turns the current West72 Entertainment site (Next.js + Tailwind) into a "liquid glass" look: translucent, blurred glass panels floating over a black field with soft ambient glow, white text, white CTAs, Archivo everywhere. It keeps every page's existing content and structure — this is a skin + layout pass, not a rewrite.

## How to use this with Claude Code

1. Copy this whole folder into the root of your Next.js repo (or just paste these files' contents into a Claude Code chat in that repo).
2. Give Claude Code a prompt along these lines:

   > Apply the liquid-glass design system in `LIQUID_GLASS_DESIGN_SYSTEM.md` to this app. Merge `tailwind.config.snippet.js` into `tailwind.config.js`, append `globals.css.snippet.css` to our global stylesheet, add Archivo via `next/font/google`, and mount `BackgroundField` once in the root layout. Then restyle Home, Events, Event Detail, About, Contact, Login, and the checkout flow (ticket selection → checkout form → a brand-new Order Confirmed page) to match the attached desktop and mobile mockups, and the reference components in `liquid-glass-components.tsx` — reuse our existing data-fetching and routes, only change presentation. Every CTA and highlight color is white/frosted, never gold.

3. Attach the mockup PNGs (desktop + `_mobile` variants for every page) so Claude Code has a visual target per page per breakpoint. Also attach `mobile_nav_states.png` (closed vs. open mobile header side by side) so it has a target for the hamburger-menu interaction specifically.
4. Let it work page by page — restyling this many screens in one pass is a lot of diff to review at once. Do the checkout flow (`checkout_step` → `checkout_success`) as its own pass since it touches real payment logic.

## Design tokens

| Token | Value | Use |
|---|---|---|
| `--ink` | `#08080a` | page background |
| `--accent` | `#ffffff` | primary buttons, highlighted words, progress fill — **white, not gold** |
| `--good` | `#8fd6a8` | positive amounts (net revenue, order totals) |
| `--glass-bg` / `--glass-bg-2` | `rgba(255,255,255,0.07)` / `0.04` | glass panel fill (gradient between the two) |
| `--glass-border` | `rgba(255,255,255,0.16)` | 1px border on every glass panel |
| `--glass-shadow` | `0 20px 60px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.16)` | outer drop shadow + inner top highlight |
| blur | `28px` backdrop blur, `saturate(160%)` | the "frost" |
| radius | `24px` cards, `18px` compact cards, `999px` pills/nav/buttons (`18px` / `full-width` on mobile — see Responsive below) | |
| font | **Archivo**, weights 400–900 (variable) | replaces the previous condensed display font site-wide, for consistency with the Command Center dashboard |

Full CSS variables are in `globals.css.snippet.css`. Tailwind equivalents are in `tailwind.config.snippet.js`.

**On the color:** an earlier pass of this system used a gold/tan accent (`#d9b47f`) for CTAs and highlighted text. That's gone — every place gold used to appear (primary buttons, "FREE" chips, progress fill, highlighted headline words) is now white/frosted instead, keeping the palette strictly black-and-white. If you find any leftover `#d9b47f` or `rgba(217,180,127,...)` while wiring this up, it's a miss — replace it with white.

### Why the background matters

A `backdrop-filter: blur()` panel over flat black just looks like dark grey — there's nothing to refract. The "glass" read comes from the **ambient orb field**: a handful of large, heavily-blurred colored circles (soft white, blue, rose) fixed behind the content. Every glass panel blurs *that*, which is what produces the frosted-color-bleed look in the mockups. `BackgroundField` (in `liquid-glass-components.tsx`) mounts this once in the root layout — don't skip it or every panel will look like plain dark cards.

## ⚠️ Visual-only pass — do not touch real interactive behavior

This is a skin + layout pass. A few pieces of the live site are **stateful, interactive components with real logic behind them** — restyle their DOM/CSS only. Do not rewrite, simplify, or replace how they work:

- **Home hero = a real auto-rotating carousel.** It autoplays through West-72-hosted events only (there's a host filter on the query), and supports touch/drag swipe to move between slides. `home.png` / `home_mobile.png` show the restyled chrome — a prev/next arrow pair (`.hero-arrow`), a dot-indicator row (`.hero-dots .dot`, active dot wider/white), and a small "↔ Swipe" affordance hint on desktop — layered onto the *existing* slide markup. Keep the autoplay interval, the swipe/drag gesture handlers, and the host-filtering query exactly as they are; only apply the new classes/colors to whatever slide track and controls already exist.
- **The mobile hamburger menu is a real open/close interaction**, not two separate pages. `mobile_nav_states.png` (and `home_mobile.png` for the closed state) shows both: closed collapses to a centered logo with no visible "Get Tickets" CTA and a hamburger icon; tapping it opens a dropdown sheet (`.nav-menu` + `.nav-scrim` backdrop) with the nav links and a full-width "Get Tickets" button, and the hamburger becomes a close (✕) icon (`.nav-close`). Wire the restyled markup to whatever open/close state your mobile nav already uses — don't build a second static header for the "open" case.
- Any other accordion, stepper, or toggle already on the site (FAQ rows on Event Detail, the checkout stepper) gets the same treatment: new classes and colors on the existing interactive element, same JS/state behind it.

If you're not sure whether something is "just a look" or "a real behavior," ask before changing the underlying markup structure — restyling a `<button>`'s classes is safe; swapping how a carousel tracks its current slide is not.

## Responsive / mobile

Every page has a matching `_mobile.png` mockup (390–430px wide) — the same components, restacked:

- **Mobile header:** the logo is centered in the collapsed nav (not left-aligned), and there is no visible "Get Tickets" CTA in the collapsed header — see `.nav .logo{grid-column:2; justify-self:center;}` and `.nav > .btn-primary{display:none;}` in `globals.css.snippet.css`. The CTA reappears full-width inside the opened hamburger menu instead (`.nav-menu .btn-primary`). See `mobile_nav_states.png` for both states side by side, and the carousel/menu note above — this is a real open/close interaction, not two separate headers.
- Every multi-column grid (`show-grid`, `event-grid`, `why-grid`, `like-row`, the checkout success "also like" grid) collapses to a single column under 600px.
- Two-column layouts (Event Detail, Checkout, Contact, Getting Here) stack vertically, with the sticky order/checkout card becoming static (no `position: sticky` once it's full-width under the content).
- Hero type sizes, card padding, and button sizes all step down — see the `@media (max-width: 600px)` blocks already included in `globals.css.snippet.css` and follow the same pattern for any component not covered there.

## Components

See `liquid-glass-components.tsx` for copy-paste-ready versions of:

- `BackgroundField` — the orb field (mount once, root layout)
- `GlassCard` — base glass surface (nav, cards, forms)
- `Button` — primary (white glass) / outline (frosted, transparent)
- `Chip` — price tags, "FREE" badges, filter pills
- `NavBar` — floating glass pill nav, collapses to a hamburger on mobile
- `ProgressBar` — used on the Command Center dashboard for per-event sales
- `EventCard` — the repeating card on `/events`, the home "Upcoming Shows" strip, and the checkout-success cross-sell grid. Matches the current live-site layout: full-bleed photo, a venue tag pinned top-left, title + info pills overlaid at the bottom on a gradient scrim — no separate white body panel under the photo. Only 2 pills (price, and a combined "date · time") so the row fits on one line at every breakpoint — don't split date and time into separate pills, that's what was wrapping to a second line before.
- `Field` — glass form input/textarea/select for Contact, Login, and Checkout
- `CheckoutStepper` — the TICKETS · CHECKOUT · DONE indicator on the checkout sidebar
- `TicketCard` — the order-confirmation line item on Checkout Success (event photo thumbnail, not a QR code)
- `ApplePayButton` — express-checkout button above the card form on Checkout (payment method only — not the same as, and doesn't require, Apple Wallet/Developer enrollment)
- `HeroCarouselChrome` — visual-only prev/next arrows + dots + swipe hint for the **existing** home hero carousel (see the visual-only warning above)
- `MobileNavMenu` — visual-only markup for the opened hamburger-menu state, paired with the collapsed `NavBar`
- `HotelPartnerPanel` — the Renaissance Shoals cross-sell panel on Checkout Success

## Page-by-page notes

Each mockup PNG is full-page (scroll included), delivered as a desktop version and a `_mobile` version. Only presentation changed — keep existing routes, data fetching, and form behavior; the notes below call out anything non-obvious.

### Home (`home.png` / `home_mobile.png`)
- Full-bleed hero **carousel** panel (glass scrim gradient at the bottom for text legibility) — swap the "Tour Photo" placeholder for the real artist image via `next/image` per slide. **This is the real auto-rotating, swipeable, host-filtered carousel — see the "visual-only" warning above before touching it.** New chrome: `.hero-arrow.prev` / `.hero-arrow.next` (circular glass buttons), `.hero-dots` (dot row, `.dot.active` is the wider white one), `.hero-swipe-hint` (desktop-only "↔ Swipe" label, hidden on mobile where swipe is the primary interaction anyway).
- "Upcoming Shows" strip: 4 `EventCard`s, horizontal (4-up, 4:3) on desktop, stacked full-width (16:9) on mobile — this is the site's current card layout, just restyled in glass (see `EventCard` above). Also used for the checkout-success cross-sell grid.
- **"Preview Artist" button** (outline CTA next to "Get Tickets" in the hero): carried over from the current design — assumed to link to the same artist-preview behavior already on Event Detail (the "▶ Preview Artist" row near the streaming-listener count). Confirm what that actually does on the live site (audio snippet, Spotify embed, etc.) and wire the hero's button to the same thing, scoped to whichever event is the active carousel slide.
- "Get Rowdy" — single centered glass panel, headline + paragraph + CTA.
- "Friends With Benefits" SMS opt-in — glass panel, icon + copy left, CTA + fine print right on desktop; stacks and CTA goes full-width on mobile.

### Events (`events.png` / `events_mobile.png`)
- This is the page Matt specifically flagged. Search pill + two filter dropdowns + "View past shows" link, then a 3-column grid of `EventCard`s (1 column on mobile).
- Free events get a white `Chip` + outline `Button` ("Register Free"); paid events get a neutral `Chip` + primary white `Button` ("Get Tickets"). This mirrors the current site's paid/free distinction.
- Card photo backgrounds rotate through 4 tinted gradient placeholders until real event artwork is wired in — see the `photoUrl` prop on `EventCard`.

### Event Detail (`event_detail.png` / `event_detail_mobile.png`)
- Two-column: artist photo + details on the left, a **sticky** `GlassCard` "Order Summary" on the right (quantity stepper, promo code link, price breakdown, total, "Secure Your Spot" primary button). Stacks to one column, sticky removed, on mobile.
- Below the fold: streaming embed panel, "You May Also Like" (small `EventCard`s), "Getting Here" (address + map embed + by-car/parking copy), and an FAQ list (each question is its own glass row — wire up your existing accordion state, just restyle the row).

### Checkout flow — new (`checkout_step.png` / `checkout_step_mobile.png`, `checkout_success.png` / `checkout_success_mobile.png`)
This replaces the current inline/popup checkout with the same visual language plus one structural change:
- **Tickets → Checkout** stays exactly where it is today: the same sidebar card on the event page, now with a 3-dot glass stepper (`TICKETS · CHECKOUT · DONE`) at the top so people always know where they are. Above the form sits a black **"Buy with  Pay"** express-checkout button (`.apple-pay-btn` — an inline SVG apple mark, not a font glyph, so it renders everywhere) and an "Or Pay With Card" divider — carry over whatever this button already does on your live ticket-selection page today; it's just restyled here, not new. Below that is the real form from your live site (Full Name, Email, Phone, ZIP, the "sign me up for offers" checkbox, then Card Number / Expiry / CVC) restyled as glass `Field`s, ending in a full-width "Pay $—" primary button.
  - **Apple Pay vs. Apple Wallet — these are two different things, don't conflate them:** Apple Pay (this button) is a payment method your processor (Stripe, Square, Braintree, etc.) turns on with a config flag — no Apple Developer Program enrollment needed. Apple Wallet (the ticket-pass button that got removed from Checkout Success) is a different feature that DOES require Apple Developer enrollment + a Pass Type ID certificate to generate `.pkpass` files. It's fine to ship Apple Pay now even though Wallet passes are on hold.
- **Done is no longer a popup or inline state — it's its own route** (e.g. `/events/[id]/success` or `/checkout/[orderId]/success`), linked to after a successful charge. `checkout_success.png` is that new page: a success badge, "You're In." headline, the confirmation copy (event, email), an order card (event photo thumbnail, event/venue/date, tier, price breakdown, order number), two actions (View My Tickets / Add to Calendar), a **hotel partner section** (below), and a "More Nights Worth Clearing Your Calendar For" cross-sell grid reusing `EventCard`. Swap in the real order data and event photo; the copy is a starting point in West 72's voice, not final legal/policy text.
  - The order-card thumbnail is the **event photo**, not a QR code — the QR/ticket itself lives behind "View My Tickets." Swap `.ticket-photo` for the real event image via `next/image`.
  - **There's no "Add to Apple Wallet" button.** Generating real `.pkpass` files requires Apple Developer Program enrollment plus a Pass Type ID certificate — that's not set up. Add it back as a third action once that's in place; for now, two buttons (View My Tickets full-width-primary + Add to Calendar outline, side by side) covers it. This is a separate thing from Apple Pay below — don't conflate the two when deciding what's blocked on Apple Developer status.
  - On mobile, the event/date/venue line under the ticket photo is set to one line (`white-space: nowrap` + ellipsis, and the date is abbreviated — "Fri, Nov 6 · 7:30 PM · Venue") with the ticket-tier (General Admission × 1 / Doors time) dropping to its own full-width row below, so it never wraps awkwardly. Same one-line rule applies to the `EventCard` pill row (see below).

**Hotel partner section (`.hotel-panel`)** — sits right after the three action buttons, before the cross-sell grid. This is a promo for Renaissance Shoals Resort & Spa's discounted room block for ticket holders, and the placement/copy is built around a few buyer-psychology levers worth keeping if you adapt the content:
  - *Timing:* it appears the moment the order is confirmed, while commitment is highest and before anything else competes for attention.
  - *Exclusivity/reciprocity* (`.hotel-badge`, "Unlocked By Your Ticket"): framed as something the purchase unlocked, not a generic ad — the discount code is tied to the order and auto-applies.
  - *Anchoring* (`.hotel-price-old` / `.hotel-price-new`): the crossed-out rack rate next to the discounted rate is what makes $129 read as a deal instead of just a price.
  - *Scarcity, stated honestly* (`.hotel-cutoff`): a real room-block cutoff tied to the event date, not a fake countdown timer.
  - *Low-friction CTA*: one button ("Unlock Our Rate"), no new account, no extra form — the copy says so explicitly.
  Wire `.hotel-price-old` / `.hotel-price-new`, the cutoff date, and the promo code to your real partner-rate data once that's available; the panel degrades gracefully to a static promo if you don't have a live rate feed yet. Keep the body copy short — one tight sentence, not a paragraph; the badge, price anchor, and cutoff line are doing the persuasion work, the paragraph is just an assist.

**Mobile density note:** the "While You're Here" cross-sell grid goes 2-column (not 1) on mobile, and the ticket card's tier line (General Admission × 1 / Doors time) drops to its own full-width row below the event details instead of squeezing into the same row — both just to keep this already-long page from feeling like an endless scroll on a phone.

### About (`about.png` / `about_mobile.png`)
- One large hero glass panel: eyebrow, headline (with the highlighted white phrase), two paragraphs, outline CTA.
- Three-column "Why Us" grid (1 column on mobile), each card with a small icon badge, heading, paragraph.

### Contact (`contact.png` / `contact_mobile.png`)
- Two columns (stacks on mobile): left is the glass form card (`Field` components + full-width primary submit button). Right is `eyebrow` + headline, an "Email Us" glass card, and an "Other Ways to Connect" glass card with circular social icon buttons.

### Login (`login.png` / `login_mobile.png`)
- Single centered glass card, ~420px wide on desktop (full-width on mobile), vertically centered in the viewport. Email field, password field (with show/hide toggle), primary "Sign In" button, "Forgot Password?" link underneath.

### Command Center dashboard (`dashboard.png`, for reference — already approved)
- Same glass system applied to the internal admin dashboard: 3 KPI tiles (Total Tickets Sold, Gross Revenue, Net Revenue), a Featured Upcoming banner, and an "Upcoming Events — Sales Progress" list using `ProgressBar` scaled to each event's real ticket sales. All progress bars and buttons are white, not gold.

## What did *not* change

Copy, routes, form fields, and ticketing logic are all preserved from the live site — this pass is purely visual (colors, surfaces, type, spacing, responsive behavior) plus the one structural change called out above (Done becomes its own page). Anywhere the mockups show a placeholder ("ARTIST PHOTO", "MAP EMBED", "STREAMING EMBED", "QR CODE"), that's an existing real asset/embed on your site — just drop it into the same visual frame.

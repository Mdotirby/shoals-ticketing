# Storefront spec — page by page

Design source: `handoff/mockup/VenueCore.dc.html`. Line numbers below point into
that file. Every visual value you need is an inline `style=""` attribute there —
read it off, don't approximate.

CSS: `handoff/storefront-glass.css`, appended to `app/styles/globals.css`. Use
its `sf-*` classes. Don't invent new glass values; if something's missing, take
it from the mockup and add it to that block.

---

## Branding — the one deviation from the mockup

The mockup header draws a **text lockup**:

```
WEST-72          ← 17px / 800 / ls 0.12em
ENTERTAINMENT    ← 7.5px / 600 / ls 0.34em / rgba(255,255,255,0.40)
```

**Production does not do this.** Use the operator's real mark, resolved from
`lib/operators.ts`:

```tsx
import { useOperator } from "@/app/components/OperatorContext";
import { logoFor } from "@/lib/operators";

const operator = useOperator();
// Storefront chrome is always dark translucent glass → glass = true
const src = logoFor(operator, "horizontal", true);
```

| Host | Header mark | Favicon | Tagline |
|---|---|---|---|
| `west72ent.com` | `W72_tech_wordmark_white.png` | `favicons/West72/W72_tech_icon_solid_black.ico` | Creating Memories, One Night at a Time. |
| `venuecore.live` | `VenueCore_Horizontal_White.png` | `favicons/icon_32.ico` | One Platform. Every Ticket. |

Mobile (≤640px) swaps the wordmark for the icon mark, centered:
`logoFor(operator, "icon", true)` → `W72_tech_icon_white.png` /
`VenueCore_Icon_White.png`.

On a **venue subdomain** (`shoals.venuecore.live`), `VenueThemeProvider` supplies
`venueTheme.logo_url` and that wins over the operator mark. `Header.tsx` already
does this — copy the pattern, don't reinvent it.

Footer copyright uses `operator.copyright`, not a literal. The mockup's
`© 2026 West 72 Entertainment LLC · Florence, AL · Privacy Policy` becomes
`© {year} {operator.copyright} · Florence, AL · Privacy Policy` with Privacy
linking to `/privacy`.

`operator.metaPixelId` only exists for west72 — keep it conditional.

---

## Shared components to build first

**`SfHeader`** — mockup line 1252. Floating pill, not a full-width bar. Sits
inside the 1240px content column. Classes: `.sf-header`, `.sf-header-logo`,
`.sf-header-nav`, `.sf-header-spacer`. Nav: Events, About, Contact, Login (the
mockup's `storeNav`). Right side: `Get Tickets` → `.sf-btn.sf-btn--primary.sf-btn--md`,
targeting the featured event (`/api/events/featured`, same call `Header.tsx`
already makes). Active link gets `aria-current="page"`.

Mobile ≤640px: three-part grid, icon centered, hamburger right, CTA hidden and
moved to the bottom of the open sheet as a full-width target. Mockup line 1820
documents this; `Header.tsx`'s existing drawer is a working reference.

**`SfFooter`** — `.sf-footer`. One centered line. Operator-aware per above.

**`SfStepper`** — mockup line 1408 (step 1 active) and 1522 (step 2 active).
Three steps: TICKETS / CHECKOUT / DONE. Props: `current: 1 | 2 | 3`. Classes
`.sf-stepper`, `.sf-step`, `.sf-step--done`, `.sf-step--current`,
`.sf-step-line--done`. Lives at the top of the cart panel on detail and
checkout, and above the confirmation on success.

---

## 1. Home — `app/page.tsx`

Mockup **lines 1250–1311**.

Structure: `.sf-page` → `SfHeader` → `.sf-hero` (featured carousel) →
`.sf-section-head` ("Upcoming" + "All events →") → `.sf-grid-home` of
`.events-grid-card` → `SfFooter`.

Hero: `aspect-ratio: 2.35`, photo with bottom gradient overlay. Kicker line is
`FRIDAY · NOVEMBER 6 · SINGIN' RIVER BREWING CO.` shape — uppercase day, date,
venue, joined by ` · `. Title 46px/900 uppercase. Two buttons: `Get Tickets`
(primary) and `Details` (secondary). `SWIPE →` hint top-right, dots bottom
center — carousel already exists in production, keep its logic and reskin.

**API — unchanged:**
- `fetch("/api/events")` — upcoming list
- whatever the existing hero/featured call is — read the file, keep it

Cards use the same `.events-grid-card` markup as the listing (§2) at
`minmax(280px, 1fr)`.

---

## 2. Events listing — `app/events/page.tsx`

Mockup **lines 1313–1361**.

**This file was just reverted to `465d26998334`. Start from that version.**

Keep exactly as-is: both `fetch` calls, `FilterType`, `matchesFilter()`,
`hostsWithEvents`, the `filtered` memo, and the `.events-grid-card` markup
structure. What changes is only the inline `<style>` block — delete it, since
`storefront-glass.css` now supplies every one of those classes.

Filter row (mockup line 1327): search pill flex `1 1 320px`, then `by All ▾`,
`All Hosts ▾` as `.sf-btn--secondary`, then `View past shows →` pushed right.
The existing `.events-search-pill` / `.events-filter-select` classes already have
glass rules — keep those class names.

Grid: `.sf-grid-events` — `minmax(292px, 1fr)`, card photo `aspect-ratio: 1.55`.

**API — unchanged:**
- `fetch("/api/events" + (isVenueSubdomain ? "?venue_slug=" + venueSlug : ""))`
- `fetch("/api/venues")`
- deps `[venueSlug, isVenueSubdomain]`

`EventsHero` exists and is unmounted on this route. The mockup has no hero on
the listing — leave it unmounted.

---

## 3. Event detail + cart — `app/events/[id]/EventDetailClient.tsx`

Mockup **lines 1363–1489**. **82KB. Read all of it first.** This is the file
most likely to break checkout.

Left column:
- `.sf-art` — artist photo, `aspect-ratio: 1.32`, `.sf-art-scrim`,
  venue badge top-left, age badge top-right, `.sf-art-facts` strip along the
  bottom (4 label/value pairs: date, doors, venue, age)
- `.sf-spotify` — mint-tinted glass panel. Eyebrow `HEAR HIM FIRST`, monthly
  listeners right-aligned, 74px art square, track name, progress bar, 52px mint
  play button, then the track list. Real implementation is the Spotify embed
  (`open.spotify.com/embed/artist/…`, compact 152px, autoplay off) — the mockup
  draws a mock because it can't iframe. **Only render this panel when the event
  has a linked Spotify artist**; omit entirely otherwise, no placeholder.
- `.sf-hosted-by` — "Hosted by {operator.copyright}"
- `.sf-prose` — event description

Right column — `.sf-cart`, `position: sticky; top: 88px`:
- `SfStepper current={1}`
- "Select tickets" (19px/800)
- `.sf-tier` per ticket type: name, note, price right, "N left" bottom-left,
  `.sf-qty` stepper bottom-right. Selected tier gets `.sf-tier--active`.
- `.sf-summary` — subtotal, fees, tax, total (`.sf-summary-row--total`)
- `Continue to Checkout` — `.sf-btn--primary.sf-btn--block`
- `.sf-hold-note` — "Seats held for 10:00 while you check out"

**API — unchanged. All of these:**
- `fetch("/api/events/" + eventId + "/views", { method: "POST", … })`
- `fetch("/api/sponsors?event_id=" + eventId)`
- `fetch("/api/seating/events/" + eventId, { cache: "no-store" })`
- `fetch("/api/events/" + eventId + "/presale/validate", { method: "POST", … })`
- `fetch("/api/events/" + eventId + "/artists")`
- `fetch("/api/events")`
- `fetch("/api/events/" + eventId)`
- `fetch("/api/venues")`
- `fetch("/api/events/" + data.id + "/ticket-types")`
- `fetch("/api/checkout/free", { method: "POST", … })` ← free/RSVP path

**sessionStorage — unchanged:** `vc_session`, `vc_tracking_ref`,
`vc_presale_${eventId}`. The tracking ref is read again by checkout; break it
and attribution silently dies.

Seated events route to `/events/[id]/seating` — a separate page with its own
reserve call and `router.push` to checkout carrying `seat_ids`, `qty`,
`held_until`. **Out of scope. Don't touch it.** Just don't break the branch that
sends users there.

---

## 4. Checkout — `app/checkout/page.tsx`

Mockup **lines 1491–1611**.

Left column: `.sf-art` again (same photo panel, no Spotify), `.sf-hosted-by`,
then `.sf-note` — eyebrow `BEFORE YOU GO IN`, body with doors/ages/re-entry/bag
policy/parking.

Right column — the checkout panel:
- `SfStepper current={2}`
- `← Back` + "Checkout" on one baseline
- Order line: `General Admission × 1` / `$29.01` in a `.sf-glass`-ish row
  (`rgba(255,255,255,0.06)`, radius 16px), then `(Incl. Taxes & Fees)` and
  `Show price details ▾` as a disclosure
- **Express checkout ABOVE the form.** Eyebrow `EXPRESS CHECKOUT — FASTEST`,
  then `.sf-express--apple` and `.sf-express--google`. Apple/Google glyph SVGs
  are in the mockup at line 1556–1557 — copy them verbatim. Note beneath:
  only one shows per visitor.
- `.sf-or` — `OR PAY WITH CARD`
- `.sf-fields` — Full Name, Email, then Phone + ZIP as `.sf-field-row`, then the
  marketing opt-in checkbox
- Divider, then `🔒 Payment` eyebrow and the Stripe card fields
- `Pay $29.01` — `.sf-btn--primary.sf-btn--block`
- Two fine-print lines: refund policy, then `🔒 Secure Checkout · Instant confirmation`

**API and payment — unchanged, this is the highest-risk file:**
- `loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!)`
- `<Elements stripe={stripePromise} options={{ clientSecret, appearance: stripeAppearance }}>`
- `stripe.confirmCardPayment(...)` — signature and error handling untouched
- `fetch("/api/events/" + eventId)`
- `fetch("/api/promo-codes/validate", { method: "POST", … })`
- `fetch("/api/checkout/create-intent", { method: "POST", … })` — body includes
  `sessionId: sessionStorage.getItem("vc_session")`
- `router.push("/checkout/success?payment_intent_id=" + paymentIntentId)`
- `searchParams.get("ref")` → falls back to `sessionStorage.getItem("vc_tracking_ref")`
- Keep `.ic-stripe-field` wrappers and `stripeAppearance` from
  `@/lib/stripeAppearance` — that config is what makes Stripe's iframe match the
  dark page. If the card fields go white, you dropped it.

The card inputs are Stripe-owned iframes. Style them through `stripeAppearance`,
not `.sf-input`. Match `.sf-input` values there: bg `rgba(255,255,255,0.05)`,
border `rgba(255,255,255,0.14)`, radius 14px, 13px Archivo, text
`rgba(255,255,255,0.95)`.

---

## 5. Order complete — `app/checkout/success/page.tsx`

Mockup **lines 1613–1717**.

`SfStepper current={3}`, confirmation panel with order number, QR ticket, then
the action row and cross-sell grid. Existing sub-components in
`app/checkout/success/_components/` — `SuccessHeader`, `OrderConfirmationPanel`,
`ActionRow`, `CrossSellSection` — keep the split, reskin each.

Cross-sell uses `.event-card` (the full-bleed tile) — **leave that component
alone**, it's already correct for this surface.

Hotel partner panel renders **only if the event has a booking link**. Glass rules
already exist (`.hotel-panel` etc. in the design snippet) — reuse, don't rebuild.

**API — unchanged:**
- `fetch("/api/checkout/confirmation?" + lookupQuery)` — the order is created by
  the Stripe webhook, so this polls; keep the retry/backoff exactly
- `fetch("/api/events")` — cross-sell
- `fetch("/api/laylo/subscribe", { method: "POST", … })` — still wired. We
  decided to drop Laylo for **transactional SMS**; this is the marketing opt-in
  and stays until Twilio lands. Leave it.

---

## 6. About — `app/about/page.tsx`

Mockup **lines 1719–1759**. Static. `.sf-page` → `SfHeader` → glass panels →
`SfFooter`. Existing `.about-philosophy` / `.about-philosophy-inner` glass rules
are already in `globals.css` — reuse.

## 7. Contact — `app/contact/page.tsx`

Mockup **lines 1761–1818**. Static form. `.sf-field-label` + `.sf-input`,
`.sf-btn--primary` submit. Contact address from `operator.contactEmail`.

---

## Not in scope

- `/login` split and the buyer portal — **on hold**, per Matt
- `app/events/[id]/seating` — seat-map picker, own flow
- `app/e/[slug]` landing pages — separate layout, no header/orb by design
- Rental inquiry (mockup line 1925) — no production route exists yet; build only
  if asked
- Anything under `app/admin`

## Definition of done

Per file: markup replaced, `sf-*` classes only, every `fetch`/`sessionStorage`/
`router` call verified identical to the list above, `npm run build` clean, and
one screenshot next to the mockup screen at the same width.

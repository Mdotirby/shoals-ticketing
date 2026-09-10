# Storefront rebuild — build this

The approved design is `handoff/mockup/VenueCore.dc.html`. Open it in a browser
(it renders standalone) and click the **Storefront** group in the left nav:
Home, Events, Event, Checkout, Order complete, About, Contact, Mobile, Rental
inquiry. That is the target. Production is wrong and gets replaced.

Read `handoff/STOREFRONT_SPEC.md` before writing code. Read
`handoff/CORRECTION.md` if you want to know why the rules in it are so blunt —
a previous pass at this broke a working page by guessing.

## Order

1. `handoff/storefront-glass.css` → append to end of `app/styles/globals.css`
2. Shared chrome — `SfHeader`, `SfFooter`, `SfStepper` (new components)
3. `app/page.tsx` — home
4. `app/events/page.tsx` — listing
5. `app/events/[id]/EventDetailClient.tsx` — detail + cart (82KB, hardest)
6. `app/checkout/page.tsx` — checkout
7. `app/checkout/success/page.tsx` — order complete
8. `app/about/page.tsx`, `app/contact/page.tsx` — static, easy, do last

Commit after each. Don't batch.

## Non-negotiable

**Every `fetch()` URL, method, body shape, header and response handling stays
byte-identical.** Same for `sessionStorage` keys, `router.push()` targets,
Stripe calls, and `useEffect` dependency arrays. You are replacing markup and
CSS classes. You are not touching the data layer. `STOREFRONT_SPEC.md` lists
the exact calls per route — diff against that list when you finish each file.

**Read the whole route file before you change it.** All 82KB of
`EventDetailClient.tsx` if that's what it takes. No summarising, no assuming
from the filename.

**`.event-card` and `.events-grid-card` are different components.** Don't merge
them. `storefront-glass.css` explains why at the top.

**Don't delete existing CSS.** `globals.css` is 18,410 lines and admin shares
selectors with the storefront. The new block overrides by property. If you think
a rule is dead, leave it and note it — a previous pass called correct rules dead.

**Logos come from `lib/operators.ts`, never hardcoded.** The mockup draws a text
lockup in the header; production uses the real mark per operator. See
`STOREFRONT_SPEC.md` § Branding — this is the one intentional deviation from
the mockup.

## Already correct — copy these in as-is

- `handoff/lib/operators.ts` → `lib/operators.ts`
- `handoff/app/components/Header.tsx` → `app/components/Header.tsx`

Verified against the real files. Adds `logoIconWhite` / `logoStackedWhite` and a
`logoFor(operator, shape, glass)` resolver, fixes VenueCore rendering its
navy icon on dark glass, repoints W72's stacked slot to the real lockup, and
corrects `privacy@venuecore.com` → `.live`. Additive: no existing field changed
meaning, so current call sites resolve to the same assets.

Note `Header.tsx` is the **site-wide** header. The storefront gets its own
floating pill header (`SfHeader`) per the mockup. Keep both — `Header` still
serves `/login` and anything outside the storefront routes.

## When you're done

Run the app and check both hosts:

- `west72ent.com` → W72 wordmark in header, W72 favicon, "Creating Memories,
  One Night at a Time.", Meta Pixel `708986435149013`
- `venuecore.live` → VenueCore wordmark, VenueCore favicon, "One Platform.
  Every Ticket.", no pixel

Then walk one real ticket purchase end to end on a test event: listing → detail
→ add 2 tickets → checkout → pay → success page shows the order and QR. If any
step 404s or the total changes, the data layer got touched. Stop and diff.

# Admin rebuild — full-replace handoff

**The mockup is the spec. Production bends to it.**

Design source: `handoff/mockup/VenueCore.dc.html` — open it in a browser, it
runs standalone. Left nav groups every screen. Read
`handoff/ADMIN_MERGE_PLAN.md` for the schema and API decisions behind it, and
`handoff/CORRECTION.md` for the one mistake that must not be repeated.

You are replacing markup and CSS. You are **not** replacing the data layer.

---

## The two rules that matter most

### 1. Every `fetch()`, `sessionStorage` key, `router.push()` target and Stripe
call stays byte-identical.

Read the whole route file before you change it — all of it, however long.
`app/admin/events/[id]/edit/page.tsx` is 106KB, `settlements/[id]` is 100KB,
`offers/[id]` is 78KB, `private-events/[id]` is 77KB, `calendar/page.tsx` is
62KB with a 59KB `EventPanel.tsx` beside it. No summarising, no inferring from
the filename, no "this looks like a standard CRUD page." When you finish a file,
diff its call list against what you found before you started. Same count, same
URLs, same methods, same bodies.

### 2. Read the stylesheet region for a page before you touch it.

`app/styles/globals.css` is 18,410 lines and about 4,500 of them are already
`body[data-theme="liquid-glass"]` rules covering admin and storefront. **Most of
admin is already themed.** A previous pass assumed a page was unstyled, deleted
what looked like dead CSS, and destroyed a working design — the detail is in
`CORRECTION.md`. Before rebuilding a page, grep `globals.css` for its class
names and read what's there. Often the glass rules already exist and the page
just doesn't use them.

**Do not bulk-delete CSS.** Admin and storefront share selectors. Append new
rules; override by property. If you believe a block is dead, leave it and list
it in your report — don't act on it.

---

## Order

Do these in sequence, one commit each. Do not batch.

**Phase 0 — plumbing, no visible output** (from `ADMIN_MERGE_PLAN.md` §§ 2–3)
1. Role taxonomy migration: `full_admin` → `venue_admin` (Venue Admin holds
   settlement-signing authority — decided). Fold `super_admin` → `owner`,
   `promoter` → talent buyer, `door_greeter` → box office. Leave `artist`,
   `partner`, `agent` alone — they are external portal identities with their own
   routes, not staff levels.
2. `lib/eventClass.ts` — lift `isHardTicket` out of `events/new/page.tsx`
   (it is duplicated at lines 246 and 421, and again in the edit form). Fix the
   stale union in `lib/types/event.ts`, which is missing `co_promote` and
   `rental_box_office` — both of which production writes.
3. `lib/auth/can(user, capability, scope)` + guards on `/api/admin/*`.
   `/api/admin/users`, `/api/admin/dashboard` and
   `/api/admin/sidebar-permissions` currently do **no role check at all** and
   use the service-role client. Fix before anything else ships.
4. `audit_log` table, insert-only.

**Phase 1 — the screens**
5. Shared admin chrome: sidebar, page header, the glass card primitive.
6. Dashboard — hard-ticket band (§ 4)
7. Box office — POS + reader (§ below, most detailed)
8. Create a show
9. Users & credentials
10. Access control
11. Calendar, Offers, Settlements, Ticketing
12. Rental quotes, Event orders, Invoices, Expenses, Reporting, Relationships

---

## Box office — the POS

`app/admin/live/[eventId]/page.tsx` (21KB) and `app/admin/scan/page.tsx` (24KB)
are the closest existing surfaces. The mockup's Box office screen is the target.

**The backend is already built and good. Do not rewrite it.**

- `POST /api/terminal/connection-token` — creates a Stripe connection token
  **scoped to `STRIPE_TERMINAL_LOCATION_ID`**. The S700 is a smart reader and
  cannot connect without the location scope. Keep it.
- `POST /api/terminal/payment-intent` — `payment_method_types: ["card_present"]`,
  and card-present fee math is genuinely different: **2.7% + $0.05**, via
  `surchargeCents(subtotal, undefined, "terminal")` from `lib/fees/rates`. It is
  not a copy of the online rate. When `fees_included_in_price` is true the venue
  absorbs processing and the buyer is charged exactly the sticker price. Do not
  "simplify" this.
- `POST /api/box-office/cash-sale` — cash has **no fee, no tax, no surcharge**;
  face value is the money. Writes the order, tickets (auto `is_scanned: true`,
  because the buyer is standing right there), and a `settlement_ledger` row with
  real written zeros. Read the comment block at the top of that file before
  touching the cash path.
- `GET /api/events/[id]/drop-count` — counts `is_scanned = true`.

**What the UI must show — the reader state is the point:**

1. **A green light and "Connected to reader"**, top of page, full width, always
   visible. Mockup: 10px dot in `#8fd6a8` with
   `box-shadow: 0 0 12px #8fd6a8, 0 0 24px rgba(143,214,168,0.5)`, the words
   "Connected to reader" in mint, and beneath it the reader identity —
   `Stripe Reader S700 · "Front Door" · tap, chip & swipe ready`. Then serial,
   battery, last ping, mode.
2. **Every real Terminal SDK state**, not just connected. The SDK gives you
   `discovering`, `connecting`, `connected`, `disconnected`, and payment states
   `waiting_for_input`, `processing`, `succeeded`, `failed`. Wire the dot and
   label to the actual state — amber while discovering/connecting, red on
   disconnect with a Reconnect action, mint only when genuinely connected. A
   green light that is always green is worse than no light.
3. **The payment progression** as a visible checklist: intent created → sent to
   reader → waiting for the customer → ticket issued & checked in. Mockup shows
   this in a mint-tinted glass panel with a live timer, Cancel payment, and
   Enter manually.
4. **Tender buttons carry their cost**: Card says "on the reader", Cash says
   "no fees", Comp says "PIN required". The fee difference is real money and the
   door staff should see it.
5. **POS ergonomics**: tier tiles are 92px minimum with the price at 22px, a
   3×4 numeric keypad for quantity, cart lines with ± steppers, and Amount due
   at 38px. Everything tappable is at least 44px.

Also on the page: tonight's door totals, recent sales feed with card/cash/comp
marked, comps & guest list, drawer & reconcile, and Close night → settlement.

---

## Flag, don't fix

Production has pages and features the mockup doesn't cover. **Leave them
alone.** Do not restyle them, do not refactor them, do not delete them.

Known list — verify and extend it:

| Area | Files | Mockup coverage |
|---|---|---|
| Auctions | `admin/auctions/**` + `api/auctions/**` | none |
| FWB loyalty | `admin/marketing/fwb*`, `api/fwb/**` | none |
| Market radar | `admin/market-radar`, `api/market-radar/**` | none |
| Ad engine | `admin/events/[id]/ads`, `api/ad-engine/**` | none |
| Broadcasts / email builder | `admin/broadcasts/**` | none |
| SOPs | `admin/sops` (67KB) | none |
| Seating map editor | `admin/seating`, `api/seating/**` | referenced, not designed |
| Agent portal | `admin/agents`, `/agent`, `api/agents/**` | none |
| Partner dashboard | `admin/partner-dashboard` | none |
| Co-promote agreements | `admin/co-promote-agreements/**` | becomes `deal_type` — see plan § 9.1 |
| Onboarding | `admin/onboarding` (35KB) | Platform admin screen, partially |

For each one, write a short entry in `REBUILD-REPORT.md`: what it is, which
files, what it depends on, and a proposed plan for bringing it into the design
system later. **Proposal only. No code.**

The one exception — "absolutely necessary" — is when an untouched page imports a
component you are replacing and would break the build. In that case: make the
smallest possible change to keep it compiling, and log it in the report as a
forced edit with the reason. Do not take the opportunity to restyle it.

---

## Design vocabulary

Take exact values from the mockup — every one is an inline `style=""` you can
read directly. The recurring ones:

```
glass fill    linear-gradient(120deg, rgba(255,255,255,0.15) 0%,
                rgba(255,255,255,0.02) 30%, rgba(255,255,255,0) 60%),
              linear-gradient(155deg, rgba(255,255,255,0.07), rgba(255,255,255,0.04))
blur          blur(28px) saturate(160%)          (+ -webkit- prefix)
border        1px solid rgba(255,255,255,0.16)
shadow        0 20px 60px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.16)
radius        24px cards · 18px rows · 14px inputs · 999px pills
primary CTA   linear-gradient(180deg, #ffffff, rgba(255,255,255,0.80)) on #0a0a0c
              + 0 0 30px rgba(255,255,255,0.32), inset 0 1px 0 #fff
money / good  #8fd6a8      eyebrow  9px/700/0.18em uppercase rgba(255,255,255,0.42)
font          Archivo       numbers  font-variant-numeric: tabular-nums
```

**Fluid, not fixed.** Admin is viewed at arbitrary widths. Use
`repeat(auto-fit, minmax(Npx, 1fr))` and `minmax(0, 1fr)` for text columns, with
`min-width: 0` on flex/grid children that hold text. Bare `1fr` next to a fixed
track collapses text cells to zero width — this happened twice during the
mockup's own build.

---

## Definition of done, per page

- Markup rebuilt on the mockup's vocabulary
- Every `fetch` / `sessionStorage` / `router` call verified identical to
  pre-change
- No CSS deleted from `globals.css`
- `npm run build` clean
- One screenshot beside the mockup screen at the same width
- Any untouched-but-related production feature logged in `REBUILD-REPORT.md`

## When the whole pass is done

Walk one real ticket sale end to end on a test event, twice: once online
(storefront → checkout → success), once at the door on the S700 (connect →
tier → card → ticket issued → drop count increments). Then one cash sale. If any
step 404s, a total changes, or the drop count doesn't move, the data layer got
touched — stop and diff.

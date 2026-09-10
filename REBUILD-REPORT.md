# Admin rebuild — report

Running log of anything found but deliberately **not** changed, per the
"Flag, don't fix" rule in `handoff/ADMIN_REBUILD.md`. Proposals only, no code.

---

## Phase 0 — plumbing

Four commits, all landed. Two SQL migrations written and run.

| Item | State |
|---|---|
| 1. Role taxonomy | `lib/auth/roles.ts` is the single source. Migration run — 9 `door_greeter` → `box_office`; no legacy strings remain |
| 2. `lib/eventClass.ts` | Four duplicate predicates consolidated; fixed a live data bug (below) |
| 3. `lib/auth/can.ts` + guards | 33 handlers across 25 route files. **Not deployed yet** |
| 4. `audit_log` | Table live, immutability verified against the service role |

### Open decisions

- **`read_only` as a scope, not a role** (`ADMIN_MERGE_PLAN.md` § 8.1). Left
  undecided; `normalizeRole()` grants such users nothing, preserving today's
  behaviour. **Now effectively moot** — production has zero `read_only` users
  (distribution: artist 9, box_office 9, venue_admin 5, agent 5, owner 4). Can
  be decided at leisure or the role retired.
- **§ 8.3 gross revenue** — answered: `settlement_ledger`.
- **§ 8.4 co-promote in the hard-ticket band** — answered: yes, for the owner.
  See the event-model note below, which reaches the same place more cleanly.
- **§ 8.2 password override emails the user** — answered: no. Affects item 9.

### Found and fixed: silent tier loss on co-promote / rental shows

`app/admin/events/[id]/edit/page.tsx` defined `isHardTicket` as
`hard_ticket || ticketed`, omitting `co_promote` and `rental_box_office`, which
`events/new` creates with tiers. That predicate gates the PUT to
`/api/events/[id]/ticket-types` and the `lowestPrice` calculation.

**Failure:** create a co-promote or rental show with tiers, open the edit form,
save anything — tiers are not written and `events.price` is set to 0. Silent,
and it survives every later save.

Not currently biting: production has **zero** events of either type (43 events:
27 `hard_ticket`, 16 `private`). It would have bitten the first one created.

### Found, not fixed: `/api/admin/*` was entirely unauthenticated

`middleware.ts` guards on `pathname.startsWith("/admin")`, and `/api/admin/*`
starts with `/api/`, so the middleware never applied. 25 of 27 route files did
no check of their own and used the service-role client, which bypasses RLS.

Verified with no cookies and no auth header: `GET /api/admin/dashboard` returned
full financials, `GET /api/admin/users` returned 32 staff rows with email,
phone and address. Only reads were exercised;
`POST /api/admin/orders/[orderId]/refund` sat behind the same absence.

Fixed in commit 3 — **but that commit is not deployed, so the hole is open in
production right now.** Deploy it via a preview you log into first: the one
thing not verifiable locally is that the guards still admit real staff.

---

## Decisions taken

| Question | Answer |
|---|---|
| § 8.1 `read_only` as a scope | Moot — zero such users in production. Decide at leisure or retire the role |
| § 8.2 password override emails the user | **No** |
| § 8.3 gross revenue definition | **`settlement_ledger`** |
| § 8.4 co-promote in the hard-ticket band | **Yes** — and § 9.1 reaches it by construction, see below |
| Nav grouping | **Keep the repo's**, by workflow moment. At 6pm you are in Day of Show; on Monday you are in Finance. Object-type grouping is how a developer thinks about the schema, not how a venue runs. The mockup's *Storefront* and *Reference* groups are document artefacts and are dropped entirely |
| § 9.1 event model | **Taken now**, while the backfill matches zero rows |

### Standing instructions

- **Offer tab keys stay verbatim** — `details` / `pnl` / `deal_lab`. They are in
  `useState` at `offers/[id]/page.tsx:60` and likely in URL state. Do not rename
  them to display labels when that screen is rebuilt.
- **Deal lab** exists in production as a tab with no mockup counterpart; the
  design for it is four levers with a live venue-net readout, explicitly
  non-writing until a scenario is copied across.
- **Create a show** becomes numbered Setup / Tickets / On-sale & fees, with the
  money rail and the Publish gate persistent across all three — deliberately not
  a tab you can skip, because the sellout math and the publish precondition live
  there.

---

## Item 6 prerequisite — gross is computed from the wrong table, in two places

`/api/admin/dashboard` computes revenue as `sum(orders.total_amount)` where
`status = 'paid'` (route.ts:74). § 8.3 says it should be `settlement_ledger`.

The catch: **the event workspace reads the same endpoint.**
`app/admin/events/[id]/page.tsx:143` calls
`/api/admin/dashboard?event_ids=${id}` and takes `totalRevenue` as that show's
gross. So the dashboard and the workspace share one code path.

That is good news if the fix goes in `app/api/admin/dashboard/route.ts` — both
move together. It becomes a bug the moment somebody repoints the dashboard
*page* at `settlement_ledger`, or adds a second endpoint for it, and leaves the
route alone: the same show would then report two different grosses depending on
which screen you were looking at. **Fix the route, not the page.**

---

## Event workspace — a screen the mockup does not have

`app/admin/events/[id]/page.tsx` has seven tabs — overview, inventory, orders,
settlement, marketing, guestlist, access — four of which are thin panels that
link out to dedicated pages. That is a good pattern: one place per show that
gathers everything without duplicating it.

**The mockup has no equivalent screen.** Create a show and the Ticket builder
are not substitutes — they are creation and configuration surfaces, not a place
to stand while a show is live.

**Proposal:** flag it, restyle it onto the shared vocabulary when Phase 1
reaches it, and leave the tab structure alone. Redesigning it deserves its own
pass with a design behind it, not an inference from screens built for other
jobs.

---

## Event model — taken (§ 9.1)

`ADMIN_MERGE_PLAN.md` § 9.1 proposes dropping `co_promote` and
`rental_box_office` as event *classes*, making them `deal_type` on a ticketed
show, and adding one genuinely new class, `external_promotion`, for shows
promoted off-platform.

**Done.** `plans/event-deal-type-migration.sql` — not yet run.

`event_type` is now five classes (co_promote and rental_box_office removed,
`external_promotion` added); `deal_type` is four values on the show. The band
filters on class, so a co-promoted show is in — it is our inventory and our box
office — and an external promotion is out.

The create form keeps its five buttons, so the operator still picks "what kind
of show is this" in one place, but Co-Promote and Rental now set
`event_type: hard_ticket` + `deal_type`, rather than a class of their own.
Routing to the offer builder reads `deal_type` now. Call counts unchanged.

**Two things flagged, not decided:**

- **Naming collision.** `artist_offers.deal_type` already exists and means
  something else — `VS` / `FLAT` / `PLUS` / `BONUS`, the artist *payment*
  structure. The new column is the venue-side risk model. Two axes, one name,
  on related tables — the same conflation § 9.1 untangles, one level up. Named
  per the plan; `promotion_model` would read less ambiguously if it is ever
  revisited. The TypeScript types are named apart (`EventDealType`) so a file
  importing both can tell them apart.
- **`guarantee` as a value.** own_risk / co_promote / rental_box_office all
  describe whose money is at stake. A guarantee describes how the artist is
  paid — which is what `artist_offers.deal_type` already records. Kept because
  § 9.1 lists it, but worth deciding whether it belongs on this axis before
  anything writes it.

No UI for `external_promotion`. Creating one needs a Create-a-show branch that
skips tiers, fees and on-sale entirely — that belongs with item 8. The class and
its columns exist so that screen has something to write to.

---

## Item 5 — shared admin chrome

### What the mockup itself says about this chrome

The mockup contains a "Repo vs. mockup" comparison screen that has already
analysed the admin shell, and it credits the repo on six of seven axes:

| Concern | Repo | Mockup |
|---|---|---|
| Sidebar model | Six collapsible groups, `expandedGroups` auto-expanded from pathname, per-group icons | "Flat list… no accordion, no icons, no active-group inference" |
| Nav visibility | Three-layer resolve — artist allowlist → `sidebar_permissions` → static roles | "Single static list… not enforced in the nav" |
| Mobile nav | Separate `admin-mobile-topbar` component | "Closer to a spec than to the shipped pattern" |
| Branding | venue → operator → VenueCore cascade via `SafeImage`, persisted to cookies for PDF export | "Two static img tags" |
| Data flow | Cookies read first for instant paint, then `admin_users`, then `/api/admin/auth` fallback | "All values are literals… no fetch, no loading states" |

Its own notes list "cookies as a first-paint cache" as **"worth copying into
any new shell"**, and record a fixed hooks-order bug — the `/admin/login` early
return sits below every `useEffect` on purpose, because a conditionally-called
hook threw "rendered more hooks" and showed a blank screen right after signing
in. Verified still intact after this commit.

So item 5 was **not** a rebuild. The chrome was already fully themed:
`.admin-shell` re-points the `--vc-*` tokens at `--lg-*` values, so ~40 existing
admin rules inherit the real glass surface without restating it. What was
actually missing was smaller and is what got built.

### Deliberately not changed

**Nav grouping.** The mockup organises by object type (Operate / Money /
Storefront / Identity / Platform / Reference); the repo organises by workflow
moment (Shows / Finance / Day of Show / Marketing / Contacts / Settings). That
is a product decision, not a styling one — and two of the mockup's groups
(*Storefront*, *Reference*) are artefacts of it being a browsable design
document, not product areas. **Needs a decision before any regrouping.**

**Capability-derived nav visibility** (§ 3.2). Deferred: the `role_capabilities`
table doesn't exist yet, so there is nothing to derive from except the defaults
matrix in `lib/auth/capabilities.ts`. Changing who sees which tab, on a live
admin, before that table exists, is not a chrome change. § 3.2 is explicit that
`sidebar_permissions` stays until the derivation is proven — it is the
first-paint cache the layout reads.

**Legacy role strings in the nav arrays.** `lib/admin/nav.ts` still names
`full_admin` and `door_greeter` even though the database no longer contains
them, because `normalizeRole()` resolves both and every one of those arrays
feeds a visibility check. Rewriting them belongs with the capability
derivation, not here.

### Dead or near-dead code found

| What | Where | Note |
|---|---|---|
| `AdminSidebar.tsx` | `app/components/admin/` | 23-line stub — a logo and nothing else, no nav. **Imported by nothing.** Superseded by the sidebar inside `admin/layout.tsx`. Safe to delete once confirmed |
| `liquid-glass-admin.tsx` | `app/components/admin/` | 11 admin primitives (`StatusBadge`, `ListRow`, `DataTable`, `GaugeRing`, `EmptyState`…) imported by **exactly one page**, `admin/events/[id]/page.tsx` |

The second matters for the rest of Phase 1: there is already a partial admin
primitive library. `AdminCard` and `AdminPageHeader` were added because neither
a generic card nor a page header existed in it — but the two sets should be
merged rather than grown in parallel, or Phase 1 ends with three component
vocabularies instead of one. **Proposal:** fold `liquid-glass-admin.tsx` into
`app/components/admin/` as named primitives alongside the new ones, adopt them
page by page as each screen is rebuilt, and delete the old file when its last
importer is converted.

---

## Flag, don't fix — production features the mockup doesn't cover

Untouched. Not restyled, not refactored, not deleted.

| Area | Files | Depends on | Proposal for later |
|---|---|---|---|
| **Auctions** | `admin/auctions` (4 files, 64KB) + `api/auctions` (9 routes) | Own tables, bidder registration, its own checkout at `/auction/[id]/checkout` | Its own phase. It is a second commerce path with its own money flow — it should not be folded into the ticketing screens |
| **FWB loyalty** | `admin/marketing/fwb*`, `api/fwb` (16 routes) | Laylo, `admin-auth.ts` Bearer helper | Rebuild alongside Marketing. Note its API uses the Bearer-token auth helper, not the cookie guard — reconcile the two when Phase 1 reaches it |
| **Market radar** | `admin/market-radar` (4KB) + `api/market-radar` (6 routes) | Scheduled crons | Thin page over a large API. Restyle is cheap; the crons are the real surface |
| **Ad engine** | `admin/events/[id]/ads` + `api/ad-engine` (10 routes) | Meta/Google ad APIs | Leave until Phase 1 is done. External API contracts make it the riskiest to touch cosmetically |
| **Broadcasts / email builder** | `admin/broadcasts` (10 files, 80KB) | Email templates, send infrastructure | Large. Deserves its own design pass — the builder is a distinct editing surface, not a CRUD screen |
| **SOPs** | `admin/sops` (1 file, 68KB) | — | 68KB in a single file. Worth splitting before restyling, not during |
| **Seating map editor** | `admin/seating` (8KB) + `api/seating` (10 routes) | Seat tables, realtime channel | Mockup references seating but does not design the editor. Needs design before code |
| **Agent portal** | `admin/agents` (24KB), `/agent`, `api/agents` (3 routes) | External identity — outside the staff matrix by design | Keep outside the capability matrix. It is a portal identity, per `lib/auth/roles.ts` |
| **Partner dashboard** | `admin/partner-dashboard` (12KB) | `partner` external identity | Same — outside the matrix |
| **Co-promote agreements** | `admin/co-promote-agreements` (3 files, 72KB) + send/accept routes | Becomes `deal_type` under § 9.1 | Do not restyle before the event-model decision. The screen's shape changes if co-promote stops being a class |
| **Onboarding** | `admin/onboarding` (1 file, 36KB) | Venue creation, Stripe Connect | Mockup covers it partially as a Platform admin screen. Diff the two step lists before building |

### Forced edits

None so far. No untouched page has needed a change to keep compiling.

---

## Settlement ledger — the gap, closed (2026-09-10)

**Before:** 54 paid orders, $3,643.23, had tickets issued and no
`settlement_ledger` row. 2026-08-13 → 2026-09-10, all `inline_checkout`,
across five events. No customer was affected — every one of the 54 has valid
tickets — but settlement, the dashboard and the event workspace all read that
table, so those five shows under-reported their gross.

**After:** 922 of 922 paid orders have a sale row. 0 gaps, 0 orphans.

### Root cause — two failures that had to coincide

1. `fetchActualStripeCost()` ran **before** the ledger insert: an external API
   round-trip sitting between creating the order and recording the money, for
   a value settlement explicitly knows how to do without (it falls back to the
   estimated card fee when `stripe_fee_actual` is null). Corroborating
   evidence: **0 of 77 pre-existing rows on these five events had
   `stripe_fee_actual` set** — the call was never succeeding anyway.
2. The idempotency guard returned unconditionally on finding an existing
   order, so a lost ledger write could never be repaired: every redelivery
   bailed at the guard, and the handler returns 200 regardless, so Stripe
   stopped retrying.

Correlates with `485dbfd` (2026-08-12), which introduced the pre-insert Stripe
round-trip. The gap opens the next day.

### Fixed

| | |
|---|---|
| `lib/settlement/ledger.ts` | **New.** One definition of the ledger arithmetic. It existed in three drifted copies (webhook, backfill, cash-sale-as-zeros) |
| `api/webhooks/stripe` | Stripe lookup is an UPDATE **after** the insert. Guard is per-step: an existing order skips order/ticket creation only; the ledger is checked and repaired on its own |
| `api/events/[id]/revenue-summary/backfill` | Rewritten additive. Also **required a capability** — it was an unauthenticated POST that wrote financial rows |

The backfill had to be rewritten before it could be run at all. Its docstring
said "only inserts rows for orders with no ledger entry"; it actually ran
`DELETE FROM settlement_ledger WHERE event_id = $1 AND type = 'sale'` and
rebuilt everything. On live data that would have (a) destroyed
`stripe_fee_actual` / `stripe_net` / `stripe_balance_transaction_id` on every
correct row without recomputing them, (b) priced every order at the ONLINE
card rate — it selected `orders.source` and never read it, and ignored the
2026-08-14 cutover — restating Terminal door sales and everything sold before
the cutover, and (c) rebuilt cash sales as if they were Stripe orders,
inventing a surcharge and a service fee the buyer never paid.

`mode=recalculate` keeps the original purpose as an in-place UPDATE that
leaves the Stripe actuals alone.

### Comps and free tickets — corrected 2026-09-10

Matt's rule, confirmed: **a comp or free ticket is $0 gross, no fees, no
processing fee.** 152 ledger rows disagreed. Every one had `gross_amount = 0`,
and the old arithmetic subtracted a service and facility fee from that zero:

| column | was | now |
|---|---|---|
| `ticket_revenue` | −$978.10 | $0.00 |
| `ticketing_fee` | $1,002.00 | $0.00 |
| `facility_fee` | $24.00 | $0.00 |
| `tax_collected` | −$93.48 | $0.00 |
| `stripe_fee` | $45.58 | $0.00 |
| `net_to_venue` | −$1,071.58 | $0.00 |
| `net_to_platform` | $1,002.00 | $0.00 |

The headline was the negative face value, but `net_to_platform` was the worse
number: **$1,002 of platform fee revenue booked against tickets the buyer paid
nothing for.** All 152 rows updated; 0 rows with a negative `ticket_revenue`
remain, 0 $0-gross rows carry a non-zero component.

Enforced in three places now so it cannot recur: `computeLedgerAmounts()`
short-circuits at `totalAmount <= 0`, and `api/checkout/free` and
`api/admin/comps` write every column as an explicit zero rather than omitting
it.

### Open — NOT fixed, needs a decision

~~**152 ledger rows carry a negative `ticket_revenue`, totalling −$978.10.**~~
Every one has `gross_amount = 0` — they are comps and free tickets. The old
arithmetic subtracted a service and facility fee from a gross of zero, so a
$0 comp was recorded as −$22.18 of face value. `computeLedgerAmounts` now
returns zeros for a $0 order (matching what `api/admin/comps` and
`api/checkout/free` write at the point of sale). **Done — see above.**

**~$19 of cents-level variance on 4 rows of one 2026-06 event**
(`Muscle Shoals Meets: The 90's`) and a few cents each across ~200 others,
from ledger rows written at the current card rate rather than the rate in
force when the card was charged. Real but immaterial; a `mode=recalculate`
pass would clear it. Not run — see below.

**Do not run `mode=recalculate` as a sweep.** Recomputing all 922 rows and
diffing is how the negative-comp bug was found, and it is also why a blanket
restatement is not safe: the recomputation disagrees with stored rows for
several distinct reasons, only some of which are the stored row's fault.
Per-event, after reading the diff, only.

---

## Item 6 — Dashboard (§ 4), 2026-09-10

The **route**, not the page. `app/admin/events/[id]` reads its gross from
`/api/admin/dashboard?event_ids=<id>`, so the event workspace and the Command
Center were inheriting the same wrong number from the same endpoint. Fixing
one and not the other is how they end up disagreeing about the same show.

### (a) Class filter — `HARD_TICKET_TYPES` + not free

Applied only when the route derives the event set. `event_ids` is a caller
naming exact events; filtering that list would make the workspace read $0 for
a free or private show, which is a regression, not a correction.

Under § 9.1 the band reads **class**, not deal — `deal_type` has shipped
(`events.deal_type` is live, all 43 rows `own_risk`), so a co-promoted show is
in the band because it is our inventory, and an external promotion is out.

`is_free` is filtered as `is_free.is.null,is_free.eq.false`, not
`.neq("is_free", true)` — `is_free <> true` is NULL for a NULL, which would
silently drop a real paid show whose column was never set.

### (b) Revenue from `settlement_ledger`

`totalRevenue` is `sum(gross_amount)` over every ledger row, so refunds and
disputes net (their rows are negative). Card fees read `stripe_fee_actual`
where it exists and fall back to the billed surcharge — never a re-derivation
from the rate card.

**Old vs new, live data:**

| | old (`orders.total_amount`, no filter) | new (ledger, hard-ticket band) |
|---|---|---|
| totalEvents | 43 | **21** |
| totalTicketsSold | 2,026 | **1,664** (1,639 paid + 25 comped) |
| totalRevenue | $72,615.05 | **$72,615.05** |

Revenue matching to the penny is the point, not a coincidence: it only
reconciles because the 54-row gap was backfilled first. Before that, the
dashboard showed Dolly Parton at $6,400.88 while settlements showed
$3,345.04. Both now say $6,400.88. Refunds are $0.00 lifetime, which is the
other reason the two sources happened to agree until now — the first refund
would have split them.

New decomposition the old shape could not express: face value $58,251.89,
net to venue $63,733.34, ticketing fees $4,797.00, facility fees $1,977.00,
tax $5,481.46, card fees $2,137.71.

### (c) N+1 removed

`upcomingEvents` ran two queries per event inside an `await` — five events was
ten serial round trips after the ten parallel ones. Now one grouped capacity
query, with ticket counts folded out of the single tickets read.

Also fixed in passing: the ticket counts were scoped only when `event_ids` was
passed, so the unscoped Command Center counted **every ticket in the
database** against a venue-scoped revenue figure. Two headline numbers on the
same card measuring different populations.

### Added

`sellThrough` (sold ÷ capacity — comps count, a comped seat is not available
to sell) and `avgTicket` (**face value ÷ paid tickets** — gross would let fees
and tax inflate it, and counting comps would drag it toward zero), per event
and in aggregate. Plus `paidTickets` / `compedTickets`, kept apart because a
comp issues a ticket but is not a sale.

Every existing response key is preserved — both consumers depend on the
current shape.

### Ledger row dates

The 54 backfilled rows were written with today's `created_at`. The dashboard
buckets revenue by ledger `created_at`, so left alone they would have dumped
$3,643.23 into "revenue today". 53 rows re-dated to their order's timestamp
(the 54th genuinely is today), and the backfill endpoint now sets `created_at`
from the order so a future run cannot repeat it.

---

## Item 7 — Box office POS, 2026-09-10

Priority was stated as operational, not cosmetic: the box office has to take
door money tomorrow. So this is the functional half of § "Box office — the
POS" done properly, and the full visual rebuild to the mockup deliberately
left until after the show.

**The backend is untouched, as the spec instructs.** Verified rather than
assumed: `NEXT_PUBLIC_STRIPE_TERMINAL_LOCATION_ID` is `tml_GhH9Qfm4j4Kt3t`,
inlined in the deployed bundle, so S700 discovery is location-scoped in
production; `/api/terminal/connection-token` returns a live `pst_live_…`.
(Neither variable is in local `.env.local` — a local dev box cannot connect a
reader. That is a local gap, not a production one.)

### Fixed — door correctness

| | |
|---|---|
| **Door card sales were not checked in** | `is_scanned: false` on every terminal/box_office ticket, so the drop count was wrong and staff were asked to scan a QR the buyer might not have received. Cash has always checked in on issue. Now both do. |
| **Email was mandatory for card, optional for cash** | Same sale, same counter, two rules. A walk-up who would not give an address could not be sold a card ticket, so staff typed junk. Now optional — every webhook use was already `if (customerEmail)` guarded. |
| **Storefront header sat above the till** | Events / Login / Get Tickets over a POS on a door tablet. One mis-tap leaves the till and drops the reader session mid-transaction. `/boxoffice` added to `HIDDEN_PREFIXES`. |

### Fixed — the reader light was lying

It had two states and lived at 12px between the logo and the sign-out button.
A dot that is green whenever the page has loaded trains staff to ignore it.
Now full width, mint **only** when genuinely connected, amber while
discovering or connecting, red with a **Reconnect** action on disconnect,
reader identity underneath, and — when it is down — an explicit note that cash
and manual entry still work.

### Added — the sale is verifiable at the door

"Approved" means Stripe took the money. The order, ticket and ledger row are
written by the webhook, out of band, and if that fails **nothing on the POS
said so**. That is precisely how the 54-row gap happened, and at the door it
is worse because there is a person standing there.

- Progression checklist: created → sent to reader → waiting for the customer →
  processing → **ticket issued & checked in**, with a live timer, Cancel
  payment, and Enter manually.
- `GET /api/box-office/order-status` — polled until the ticket exists.
- The success screen does not appear until it does. If the poll gives up it
  says plainly: let them in, flag the sale, **do not re-run the card**.
- A missing ledger row is surfaced at the door without blocking the sale.

### Added — tonight's door

`GET /api/box-office/tonight`: card, cash and comp counted apart, drop count,
and a recent-sales feed. **Reads `orders`, not `settlement_ledger`** — the
ledger row lands a beat after the reader approves, and a door total that lags
the card in the customer's hand would make a reconciled drawer look short. It
is a door count; the ledger stays authoritative at close.

### POS ergonomics

92px tier tiles with the price at 22px (was 11px list rows), stepper plus a
3×4 quantity pad, amount due at 38px, tender buttons carrying their cost
("on the reader" / "no fees"), 44px minimum targets.

### Not done — deliberately, the night before a show

- **No Comp tender.** The spec wants "Comp — PIN required". An ungated comp
  button at a door is worse than no button, and the PIN gate is not built.
- **No drawer reconcile or Close night → settlement.** Matt is settling this
  show by hand.
- **No reader picker.** Discovery still auto-connects to the first reader at
  the Location; `readers` is populated and unused. Fine for one reader, wrong
  the day a second is registered.
- **No visual rebuild to the mockup.** The page is still inline-styled and
  structurally as it was. Rebuilding the layout the night before a show trades
  a working till for a prettier one.

---

## Rebuild status — what is actually rebuilt to the mockup

Asked directly, so answered directly. **Before the box office, nothing was.**

| | |
|---|---|
| Admin `page.tsx` files in the repo | **71** |
| Rebuilt to the mockup | **0** (now 1, counting `/boxoffice`) |
| Files importing `AdminCard` / `AdminPageHeader` | **0** — both primitives shipped in item 5 and nothing consumes them |

The admin pages touched so far were touched for **logic**, not design:

- `events/new` and `events/[id]/edit` — the `isHardTicket` consolidation
- `settings/permissions` — repointed at `lib/admin/nav.ts`
- `app/admin/layout.tsx` — the sidebar **was** restructured, so the chrome is
  partly done

Item 6 was the dashboard **route** (`app/api/admin/dashboard`). `app/admin/page.tsx`
— the screen — has not been touched at all. It still renders the old cards
against the corrected numbers.

So Phase 1 stands at: chrome partly done, **one** screen rebuilt, primitives
built and unused. Items 8–12 are untouched.

### Box office — the first screen rebuilt (2026-09-10)

Layout, glass, ambient field, tile and keypad geometry, cart, tenders,
progression panel, KPIs, feed, comps and drawer all taken from the mockup's
`isBox` block.

**Where the mockup outruns the schema, the schema wins and the page says so:**

| Mockup | Reality | What shipped |
|---|---|---|
| Multi-tier cart | An order carries one tier + quantity; no line-item table | One tier line, in the mockup's cart shape. A basket the reader cannot charge is worse than no basket |
| Comp tender + tile | No manager-PIN gate exists | Drawn, disabled, labelled "manager PIN" |
| Itemised fee lines | Card-present fees are computed by `/api/terminal/payment-intent` | Lines say "at payment". A number the reader then contradicts is worse than naming where it is computed |
| Drawer & reconcile | No drawer record exists | Over/short computed live from real card and cash totals, with the panel saying plainly that the count is not saved |
| Close night → settlement | Not built | Omitted. Matt is settling this show by hand |

The `.bo-*` stylesheet is **self-contained** rather than inheriting `--lg-*`.
Every other glass surface is gated on `body[data-theme="liquid-glass"]`, which
resolves from the operator; a till must not be able to render unstyled because
of which brand cookie a door tablet is carrying.

The ambient field is load-bearing, not decoration: `backdrop-filter` has
nothing to blur against a flat `#08080a`, so without the mockup's blurred orbs
and dot lattice every panel reads as a dark box with a border. Reproduced at
roughly half the mockup's alpha — that export is a hero shot on a bright
monitor, and the same luminance washes out 9.5px eyebrow labels read at arm's
length in a dark room beside a stage.

---

## Command Center — the second screen rebuilt (2026-09-10)

`app/admin/page.tsx`, to the mockup's `dash` block. The **screen** this time —
item 6 had only fixed the route feeding it.

The mockup's shape is an argument about what an operator looks at first: one
hard-ticket number for the month, the shows that made it, then everything that
needs a decision. The old screen led with four "today" tiles — a number that is
zero most mornings and says nothing about whether the month is working.

### Built, all from real data

| Panel | Source |
|---|---|
| **Hard ticket — this month** — tickets sold, gross, ± vs last month, net to venue, avg ticket, "13 of 43" | New month-window aggregates on the dashboard route, computed from rows already fetched — no extra queries |
| **By event — sold & gross** with sell-through bars | `upcomingEvents`, bars on the mockup's thresholds (85% mint / 55% white / below dim) |
| **Four money KPIs** — gross all-time, face value, net to venue, fees retained | `settlement_ledger` decomposition |
| **Where the gross splits** — face → service → facility → tax → card, proportional bars | Same |
| **Needs a decision** | **Derived**, not stored — see below |
| **Latest sales** | `recentOrders` |
| **Tickets sold, last 30 days** | `dailySales`, restyled |

Calendar month, not a rolling 30 days: the hero reads "vs. last month", and a
venue closes its books on a month, not on a window that moves every time
somebody loads the page.

### The queue is derived

Every item is computed from data already on the page, so it can never disagree
with the numbers above it. On live data it immediately surfaced three real
things: tonight's show at 6% sold, a show 9 days out at 0%, and
**"Julia Cole // The Team Hold has no ticket tiers"** — a show on the calendar
the storefront has nothing to sell for.

The mockup's version also lists offer expiries and unsigned settlements. Those
live in tables this endpoint does not read; a half-populated attention list is
worse than a short honest one.

### Not built — and why

The mockup also draws **cash position, deposits held in trust, receivables
aging, money in motion, and merch/bar ancillary**. The underlying tables exist
(`invoices`, `private_event_revenue`) but nothing aggregates them, and that is
§ 5's job. Drawing those panels with invented numbers on a screen whose whole
point is that its numbers reconcile would be the exact failure this rebuild has
spent its time undoing. Left out.

**Artist mode is untouched.** It is a different, simpler screen for an external
identity and rebuilding it was not asked for.

### Two bugs fixed in passing

- **`daysOut` counted milliseconds, not calendar days.** `Math.ceil` on the raw
  difference rounds any fraction of a day up, so tonight's 8pm show read
  "1 day to go" on the one morning that number matters. Now compares calendar
  dates. `daysUntil()` is left alone — it returns display text the artist
  dashboard renders.
- **`EMPTY_DASHBOARD` extracted.** The zero state was written inline where an
  artist has no assigned events, listing the response's fields by hand — so
  every field added to the endpoint silently left it behind. It is typed
  `DashboardData` now, so the build fails when the two diverge instead of the
  dashboard rendering `undefined`.

### Rebuild status

**2 of 71** admin screens. `AdminCard` and `AdminPageHeader` are still unused —
this screen needed the mockup's specific hero and table geometry, not a generic
card, so folding them in belongs with a screen that wants a plain card.

---

## Item 8 — Create a show (2026-09-10)

`app/admin/events/new/page.tsx`, restructured to the mockup's `create` block:
numbered **Setup / Tickets / On-sale & fees**, with the money rail and the
publish gate persistent across all three.

**Restructured, not rewritten.** Every field, every fetch, and every
post-submit route (private events → `/admin/private-events/[id]`, co-promote
and rental → `/admin/offers/new`) is the same code in a different container.
This form creates the shows that sell tickets; a from-scratch rewrite would
have been the wrong trade.

### The publish gate — the real change

The form POSTed `status: "published"` **unconditionally**. Creating a show put
it on the storefront the same second: there was no draft state to work in, so
you could not set a title and come back for the tiers without the show being
live and unsellable in between.

Now both rail buttons carry the intent — **Save as draft** and **Publish** —
and Publish is disabled until the checklist clears. Checks are derived from the
form as it stands: title and venue, date and show time, a tier with a price and
a capacity, artwork, an on-sale date, and a room map if reserved seating is on.

`/api/events` already filters public reads with
`status.eq.published,status.is.null`, so drafts are genuinely hidden from both
the storefront and the box office picker. The gate is real, not cosmetic.

**The other half of the gate: a Publish / Unpublish button on the event
workspace.** Until this, the only way to publish a draft was a status dropdown
buried in the calendar's event panel — a gate you cannot open from the screen
you land on is a trap, not a safeguard. Unpublishing warns and leaves orders,
tickets and scans intact.

### The money rail

Recomputed on every keystroke from the tiers, using the **same rate card
checkout bills against** (`lib/fees/rates`), so it cannot drift from what a
buyer is charged. Verified live: 650 × $35 → face $22,750.00, service
+$1,950.00, tax +$2,161.25, **gross if sold out $27,640.53**, card −$779.28,
**net to venue $24,911.25**.

`selectedVenueFees` was widened to carry `ticketing_fee` and `tax_rate` — the
venue query already selected both and only `facility_fee` was ever kept.

**Named limitation, in the rail itself:** Stripe's flat fee is charged *per
order*, and this models one. A 650-cap room sold across a few hundred orders
costs more than the card line shows.

### A collision worth recording

`.cs-*` is already the **checkout-success** namespace in `globals.css`, and
`body[data-theme="liquid-glass"] .cs-check` is a 64×64 circle. Reusing the
prefix turned every publish-gate row into a bubble with its label wrapped
inside — and the attribute selector on `body` outranks a bare class, so
nothing new could have won. Renamed to `.cshow-*`. **Grep the prefix before
claiming one.**

### Flagged, not fixed

- **The event workspace and the dashboard disagree about capacity.** The
  workspace reads `venue.capacity ?? Σ tiers` and showed Tyler Halverson at
  42/**750**; the dashboard sums tier capacity and shows 42/**720**. Two
  screens, same show, different denominator — so sell-through differs too.
- **A 401 from `/api/admin/dashboard` renders as `$0.00` gross** on the
  workspace, not as an error. Staff without the capability see a wrong number
  rather than a refusal.
- **`PUT /api/events/[id]` is unauthenticated**, like the rest of
  `/api/events/*`. The new publish button uses it. Pre-existing, and the same
  class of hole as `8a4fa41` closed for `/api/admin/*`.

### Rebuild status

**3 of 71** admin screens: box office, Command Center, create a show.

---

## The three flags, fixed (2026-09-10)

### 1. Capacity vs sellable cap — two numbers, not a bug

Matt's model, confirmed:

> **capacity** is the room. **Sellable cap** is capacity less kills and comps.
> A 750-cap room with 30 comps has a sellable cap of 720.

So the workspace's 42/**750** and the dashboard's 42/**720** were both right
and neither was labelled. `lib/capacity.ts` is now the single definition:

| | |
|---|---|
| `room` | `event_venues.capacity` / `venues.capacity` — the fire marshal's number |
| `sellable` | Σ `ticket_tiers.capacity`, less unreleased `event_holds` |
| `sellThrough` | sold ÷ **sellable** |

**Sell-through divides by sellable**, because dividing by the room counts
seats nobody was ever allowed to sell as unsold inventory and makes every show
look softer than it is. Tyler Halverson: 5.6% against the room, **5.8%**
against what was for sale.

Both screens read the same function now. The workspace header shows
`42 / 720 of 750` and labels it "Sold / sellable of room"; the dashboard row
shows the room underneath when the two differ, so the smaller number cannot
read as an error.

#### Corrected after Matt explained where the numbers come from

The decomposition is **not** hand-set and it is **not** in `event_holds` — the
**offer** already carries it, per tier:

```
artist_offers.ticket_scaling
  [{ name: "General Admission", seats: 750, comps: 30, kills: 0,
     sellable_cap: 720, price, net_price, facility_fee, ticketing_fee }]
artist_offers.artist_comps / .marketing_comps   →  10 / 20 of those 30
```

Gross potential at the offer stage is computed off `sellable_cap`, not
`seats` — which is exactly why the tier created later carries 720 and the
venue record carries 750. **The two numbers were never in conflict.** Nothing
on the admin screens said which was which.

**The gap is not assumed to be comps.** Measured across the book: of 18
hard-ticket shows with tiers and a recorded room, **16 have a room larger than
their sellable cap** — but only sometimes because of comps. Shemekia Copeland
is 2,000 against 500 and Food Truck Fright Fest 750 against 250; those are
partial-house configurations, not 1,500 and 500 comps. So `hasKills` was a lie.
It is `roomDiffers` + `offSale` now, and the reason is named **only when an
offer supplies it**:

| | |
|---|---|
| with a linked offer | "30 comps (10 artist, 20 marketing)" |
| without one | "30 seats not on sale" |

Guessing would have put an invented comp count on a settlement screen.

The event workspace loads the linked offer's scaling for this. **Only 1 of 39
offers currently carries an `event_id`**, so the sourced breakdown rarely fires
yet — linking offers to their events is what turns it on, and is worth doing.

`event_holds` reduces the sellable cap further when rows exist. Empty today.

### 2. A 401 no longer reads as $0.00

The event workspace fetched gross with `.catch(() => {})` onto a state that
started at `0`, so a 401 — staff without `view_settlement`, or an expired
session — rendered a confident **$0.00 gross on a sold-out show**. It now
distinguishes loading / ok / denied / error and shows "Hidden — no access"
rather than a number. A wrong number is worse than no number.

### 3. `/api/events/*` is no longer open

Every route under `/api/events` was unauthenticated on the service-role
client, which bypasses RLS — the same hole `8a4fa41` closed for `/api/admin/*`,
in the namespace that hosts the `PUT` the new publish button calls.

**Guarded** — 17 handlers across 12 files:

| | |
|---|---|
| `requireStaff()` | event `PUT` / `DELETE`, event `POST`, closeout, presale read/write, trackable links, views analytics, drop count, holds read |
| `requireCapability("ticket_scaling", write)` | ticket-types `POST` / `PUT` — the PUT that silently dropped tiers and zeroed `events.price` in `07a07fd` |
| `requireCapability("holds", write)` | hold create and release |
| `requireCapability("view_settlement")` | `revenue-summary` — face value, fees, tax and net to venue for one show, previously readable by anyone with the event id |

**Left public, and now commented as such** so the next audit does not have to
re-derive it: the storefront listing and event detail `GET`, `ticket-types`
`GET` (the storefront and the box office both read it), `artists` `GET`,
`featured` `GET`, `views` `POST`, `presale/validate` `POST` (takes a code and
answers yes/no — it never hands one out), and `record-conversion` `POST`.

Checked before guarding: no storefront, checkout or box-office caller touches
a route that got a guard.

---

## Create a show — scaling, so the sellable cap stops being mental arithmetic

The form asked for **capacity** and nothing else, so an operator working from
an offer had to compute 750 − 30 comps in their head and type 720. Nothing
recorded that the 30 existed.

The tier row now carries the offer's own three fields and derives the fourth:

```
ROOM SEATS  −  COMPS  −  KILLS  =  SELLABLE
    750          30        0         720
```

`capacity` — the only field that reaches `ticket_tiers`, and the number
`app/api/checkout/create-intent` refuses a sale against — is **derived** from
them. Typing directly into capacity still works and clears the derivation,
because a tier that only knows its sellable number is a legitimate thing to
have.

**Verified against a real offer.** American Aquarium: 750 seats, 30 comps,
720 sellable at $31. The rail computes face value **$22,320.00** — exactly the
`gross_potential` stored on that offer. The create form and the offer builder
now agree by construction rather than by whoever typed carefully.

Full rail on that input: face $22,320.00 · service +$2,160.00 · tax
+$2,120.40 · **gross if sold out $27,372.11** · card −$771.71 · service
retained −$2,160.00 · **net to venue $24,440.40**.

### The allocation is recorded, not just subtracted

On save, comps and kills are written to `event_holds` as `house_comp` and
`production` rows with an owner label. They **do not reduce anything** — the
tier is already net of them — they say *who the off-sale seats belong to*, so
the workspace can print "30 comps" instead of "30 seats not on sale".
Best-effort: a failure there never loses the show that was just created.

### A bug this caught in `lib/capacity.ts`

I had `resolveCapacity` subtracting unreleased holds from the tier total. That
is wrong and would have **understated the sellable cap the moment anyone
created a hold**: `ticket_tiers.capacity` is what checkout enforces, so it is
already the sellable number and the comps are already out of it. Subtracting
them again counts them twice. Holds are attribution now, not arithmetic.

### And a CSS one

`.admin-tier-row` is `display: flex; flex-wrap: nowrap`. Dropping a full-width
row into it crushed the name, price and capacity inputs to 30px each. Wrapping
is scoped to `.cshow` so the edit form — which has no scaling row — is
untouched.

---

## Item 9 — Team & credentials (2026-09-10)

New screen at `/admin/users`, to the mockup's `users` block: the roster on the
left, **one panel** on the right for identity, contact, access level and
credentials. Splitting those across screens is how an admin changes someone's
role and forgets the login still points at an address they no longer use.

Registered in `lib/admin/nav.ts` as **Team** → tab key `users`. That file's own
comment warns a new screen needs a row there or it silently fails the
visibility check.

### The rule that shapes the credentials block

**An override does not email the user.** Matt's instruction, and it is right:
an unannounced credential email reads as phishing to the person receiving it,
and the admin doing the override is normally already talking to them. The
onboarding mail is sent on **create**, with credentials the admin chose to
send.

So everything on this screen is silent, and the screen says so:

| | |
|---|---|
| **Override password** | Set directly. Nothing sent. Generate button, plus "force a change at next login" (`admin_users.must_change_password`, which already existed) |
| **Generate a reset link** | Mints Supabase's own one-time recovery link and **hands it back** rather than emailing it. Returning it cannot fail silently the way a mail can |

### Seniority is now enforced, not just displayed

`requireCapability("assign_roles")` says you may manage users. It does **not**
say you outrank the person you are managing — so before this, any venue admin
holding that capability could set an **owner's** password and take the account.

`PUT /api/admin/users` now checks `canEditRole(actor, target)` on two axes:

- the person being edited must be **below** the actor's rank
- the level being **assigned** must be below it too — promoting someone to your
  own level is promoting yourself by proxy

The UI mirrors it (levels lock with "above you", the panel goes read-only with
a note), but the server is what refuses. Both password overrides and recovery
links are written to `audit_log`.

### Not built — and why

The mockup also offers **"reset MFA enrolment"** and **"revoke all active
sessions"**. There is no MFA in this app, and Supabase's admin `signOut` takes
a JWT rather than a user id, so neither can be done honestly from here.
Drawing a button that does nothing is worse than not drawing one.

Verified against live data: 18 staff, 14 external. External identities —
artist, partner, agent — are listed but carry no access level, per
`lib/auth/roles.ts`.

### Rebuild status

**4 of 71** admin screens: box office, Command Center, create a show, team.

---

## Sales window — a past show can no longer be sold (2026-09-10)

Someone bought and paid for a ticket to a show that had already happened.

**How it got through:** nothing in checkout ever asked whether the event was in
the future. `lib/events/closeout.ts` had the check, and
`/api/checkout` and `/api/checkout/free` imported it — but
**`/api/checkout/create-intent`, the path the storefront actually uses, did
not.** A past event's page is still reachable, its tiers still exist, and the
capacity check passes trivially on a show that barely sold. So it charged.

### The rule, one module

`lib/salesWindow.ts`, show day in Central:

| | storefront | box office |
|---|---|---|
| 00:00 → 12:00 | **sells** | closed |
| 12:00 → 22:00 | **sells** | **sells** |
| 22:00 → 24:00 | closed | **sells** |
| after midnight | closed | closed |

The two windows **overlap on purpose**. Selling to someone standing in your own
parking lot at 8pm is not a problem to solve; selling a ticket to a show that
finished last month is. The box office also sells **advance** tickets for
future shows at any hour — the noon opening is about the day-of till, not the
window clerk taking money for next Friday.

Central via `Intl`, never a fixed offset. Verified at every boundary in **both**
CDT and CST.

Guarded: `checkout/create-intent`, `checkout`, `checkout/free`, `boxoffice`,
`terminal/payment-intent`, `box-office/cash-sale`. `create-intent` picks its
channel from `source`, so `/boxoffice`'s manual card entry keeps working after
the web has closed at 10pm.

`closeout.ts` now delegates its date logic here instead of computing cutoffs by
hand as `midnightUTC + (startHour + 7)` and `midnightUTC + 30h` — both of which
hardcode CDT and were an hour wrong all winter, as that file's own comment
admitted. The storefront UI already keys off `pastEventReason`, so it picks up
the correct state and the right message ("available at the box office" vs "this
event has already taken place") for free.

### What it costs — measured

| | |
|---|---|
| Genuinely late orders this stops | **1 paid** ($31.56, bought 2026-09-10 for a 2026-08-08 show) + 4 free RSVPs to a gone show |
| Web orders at/after 10pm CT on show day | **0** |
| Door orders before noon CT on show day | **0** |

**The hours are set where the sales are not.** For contrast, the first pass of
this put the web cutoff at noon, which would have refused **81 orders worth
$3,099.28** — most of them 7–9pm, people buying on a phone at the venue. Matt
moved it to 10pm and separated the two channels, which costs nothing and still
closes the hole.

Both hours are constants — `STOREFRONT_CLOSE_HOUR` and `BOX_OFFICE_OPEN_HOUR`,
overridable at runtime — because they are venue policy, not a fact about the
software.

**One edge, flagged:** the till is closed before noon on show day, so a walk-up
at 11am asking for tonight cannot be served. That is the rule as stated; if it
bites, `BOX_OFFICE_OPEN_HOUR` is the one line.

**A note on the first pass of this analysis:** counting "orders after the show
date" in UTC returned 30 orders / $650.67. Nearly all were 7–9pm Central on the
show day itself — 7pm CDT is already the next day in UTC. That is precisely the
bug `lib/dates.ts` exists to prevent, and I made it in my own query before
redoing it in Central. The real figure is 5.

## Past events page — one nav, not two

`/events/past` rendered a bare fragment with no `SfHeader`, so it fell through
to the legacy `Header` — the only storefront page still doing so. Two navs, two
different mobile drawers, which is why the menu behaved differently there. It
now renders `.sf-page` + `SfHeader` + `SfFooter` like `/events`, and is listed
in `SF_HEADER_ROUTES` so the legacy header stands down.

---

## Item 10 — Access control (2026-09-10)

`/admin/settings/permissions`, rebuilt to the mockup's `roles` screen: role
cards, the **16 × 6 capability matrix** with its four states, and the audit log.

### The strong half above the weak half

`sidebar_permissions` — the thing this page used to be — only ever answered
"can this role **see** this tab". That is worth having, but it is not access
control: hiding Settlements in the nav never stopped a Box Office user
deep-linking to `/admin/settlements/[id]`.

Capabilities answer "can this role **do** this thing", and they are checked on
the server. So the matrix is the page now, and the sidebar editor sits beneath
it retitled **Sidebar visibility**, saying plainly that it is tidiness rather
than security.

### Four states, and they render as four

Verified against live data: *Place & release holds* reads
full · full · full · none · **scoped** · none, and *Build & send offers* reads
full · full · full · **read** · none · none — matching the design's
`[F,F,F,N,S,N]` and `[F,F,F,R,N,N]`. 16 rows × 6 columns = 96 cells. Role
cards carry real seat counts (Owner 4, Venue Admin 5, Box Office 9).

### Editable per venue — the plumbing, not yet the table

`lib/auth/capabilities.ts` always said the live values belong in a
`role_capabilities` table that did not exist. It does now, as
**`plans/role-capabilities-migration.sql`** (hand-run, like every migration
here). Until it is run the matrix shows the compiled defaults, every cell is
disabled, and the page says which file to run — the same shape
`/api/events/[id]/holds` already uses for its own pending table.

`can()` reads overrides now without becoming async: they are loaded **with the
actor** in `getAdminActor()` and ride along on it, so `can()` stays a pure
function of what it was handed and no call site changed.

**Safe to run while selling.** It creates one empty table; every
(venue, role, capability) with no override resolves to the compiled default, so
an empty table behaves exactly like today.

### Three ways owner is protected

An owner who can be demoted by whoever holds `assign_roles` is one `UPDATE`
away from not being the owner. So:

1. `can()` returns the default for `owner` and never consults an override
2. `PUT /api/admin/capabilities` refuses `role: "owner"` with a 403
3. a database trigger raises on any owner row that is not `full`

Two more guards on that endpoint: you cannot grant a capability **you do not
hold yourself** (otherwise a venue admin without `sign_payout` grants it to a
role they hold and signs their own payouts), and every change writes to
`audit_log`.

### Audit log

`GET /api/admin/audit`, gated on `read_audit` — Owner and Venue Admin full,
Finance read, per the design. Real entries already showing, including this
session's `settlement_ledger.backfill`.

### Rebuild status

**5 of 71** admin screens: box office, Command Center, create a show, team,
access control.

---

## Item 11a — Ticketing (2026-09-10)

The mockup's `tickets` screen, mounted on `/admin/orders/[id]` above the order
list — "how is this show selling" is what people open that page for; "who
bought ticket 412" is what they scroll for.

`GET /api/admin/ticketing/[eventId]` assembles it. Verified against
The Dolly Parton Tribute: **232 sold · 30.9% of 750 sellable · gross
$6,660.77 · face $4,620.00 · fees retained $1,386.00 · $19.91 avg ticket**.

| Panel | Source |
|---|---|
| KPI strip | tickets, `settlement_ledger`, `resolveCapacity` |
| Inventory & release | tiers (alloc), tickets per tier (sold), `event_holds` (held), sell-through on the mockup's 85/55 thresholds, gate from `event_presales` / `on_sale_at` |
| Sales curve | daily units, venue-local, last 45 days |
| Codes | `promo_codes` (Promo/Access, uses vs max, inactive dimmed) + enabled `event_presales` |

Every read goes through `fetchAll` — a sold-out 1,400-cap room is one show
away from the PostgREST 1000-row cap.

### What the mockup asks for and does not get

- **Add-ons in the same cart** — parking passes, merch bundles, coat check.
  There are no add-on products in this schema. Omitted rather than mocked.
- **"Pace vs. comparable +12%"** and the intervention estimates ("release
  balcony as a $29 flex tier, +~180 est.") need a nominated comparable show
  and a forecasting model. Neither exists. This is the screen used to decide
  whether to release inventory, so a guessed pace figure on it is worse than a
  blank space. The curve shows this show's own daily units — a fact — and says
  so on the card.

Item 11's other three (Settlements, Offers, Calendar) are untouched. The
settlement detail page is 2,209 lines and is how artists get paid; the
valuable work there is reconciliation, not a restyle — see below.

## Ledger watch — the fix is deployed but NOT yet proven

| | |
|---|---|
| Backfilled this morning | 54 rows, $3,643.23 |
| Backfilled again at ~13:30 CDT | 6 rows, $291.45 |
| Pushed to `main` | **13:51:20 CDT** |
| One more gap, at **13:54:43 CDT** | 1 row, $29.01 — **3½ minutes after the push** |

Vercel builds take a couple of minutes, so that order almost certainly hit the
old function mid-deploy. **It is not evidence the fix failed, and it is not
evidence it worked.** Backfilled; 930 paid orders, 0 gaps.

**The real test is the next card sale after the deploy settled.** If the gap
count is still 0 tomorrow after a day of Dolly Parton selling, the fix is
proven. Until then this needs checking daily.

### Also found

`/admin/orders/[id]` showed **Gross $6,660.77** in the new panel and **Total
Revenue $6,689.78** in the old KPI cards below it — the ledger against
`orders.total_amount`. The $29.01 difference was exactly the missing row. Two
numbers disagreeing on one screen is how the missing row announced itself,
which is an argument for the panel earning its place.

---

## Item 11b — Settlement, restyled (2026-09-10)

`/admin/settlements/[id]` — 2,209 lines, and how artists get paid. Restyled to
the mockup's `settle` language. **Not one number moved.**

### How that was guaranteed, not hoped for

The arithmetic already lives in `lib/settlement/model.ts`
(`settlementWaterfall`, `artistPayout`). **That file is not modified**, and
neither is any computed value on the page. The entire change is four style
constants and one wrapper class.

Every money row, label, value and section heading renders through one of those
four objects — **91 `style={…}` uses and 39 spreads** — so changing what they
contain restyles the whole document without touching a line of markup around a
live figure.

They stay inline rather than becoming CSS classes for a specific reason: they
are **spread** in 39 places (`{...labelStyle, fontWeight: 600}`), and a class
cannot be spread. A `className` key inside a style object silently does
nothing — I tried it first and it does not work. Converting 130 call sites by
hand, each one wrapped around a settlement figure, is precisely the risk this
avoids.

### Proof

The rendered page was captured before and after and diffed token for token on
a real finalized settlement (Muscle Shoals Meets: The 90's, $41,413.92):

| | before | after | |
|---|---|---|---|
| money values | 74 | 74 | **identical, in order** |
| percentages | 9 | 9 | **identical, in order** |

### What changed visually

Uppercase glass section bands, tabular figures on every value so a column of
dollars aligns on the decimal — the single biggest legibility win on a
settlement, and why the mockup sets `font-variant-numeric` on everything it
prints — tighter row rhythm, and uppercase field labels.

**One thing the first attempt got wrong:** the section heading was styled as
the lid of a card with the following block as its body. That broke in three
places — Ticket Audit's heading is the last child of a flex parent, so it
shrink-wrapped to 130px with no body to close it, and Financial Summary and
Settlement have bodies narrower than the heading, so the lid overhung. It is a
self-contained full-width band now, which is correct at every width and does
not depend on what follows it. Verified: all nine headings at 1080px.

---

## Item 11 c/d — Offers and Calendar (2026-09-10)

Both restyled to the mockup's glass language. **Item 11 is complete.**

### Offer builder — restyled with ZERO page edits

`app/admin/offers/[id]/page.tsx` is 1,387 lines and holds the gross-potential,
splitpoint, backend and walkout arithmetic. It was **not opened**.

It already renders through CSS classes — `.offer-potential-grid`,
`.offer-potential-row`, `.offer-calc-cell`, `.admin-form-section-title` — so
the entire screen restyles from `globals.css`. That is a stronger guarantee
than a before/after diff: a file with no changes cannot have moved a number.

Same treatment as the settlement: uppercase glass section bands, tabular
figures throughout, and `.highlight` rows (gross if sold out, net, walkout)
weighted a size up the way the mockup weights its totals.

**Tab keys kept verbatim**, per Matt's instruction — *Offer Details*,
*P&L / Breakeven*, *Deal Lab (Simulated)*. Verified in the DOM after the
restyle.

Verified rendering: Noah Hicks — gross potential $16,920.00, adjusted
$12,600.00, tax $1,197.00, total expenses $4,061.18, P&L $2,561.65, breakeven
573.62 tickets. Matches the stored offer.

### Offers list — rebuilt

112 lines of card list became a table that leads with the number an offer is
actually argued over: **gross potential**, with the guarantee beside it for the
comparison that gets made, then deal type and status.

**Delete was nearly lost.** The first rewrite dropped it — the row became a
`<Link>` and the button went with it. Restored as a sibling rather than nested,
because a `<button>` inside an `<a>` is invalid and the row would navigate on
the way to the button.

### Calendar

No money math — it is a scheduling grid. Its two shared style objects
(`navBtnStyle`, `labelStyle`) carry the nav and every field label, so moving
those to the glass language restyles the chrome without touching a line of
scheduling logic.

### The whole of item 11 c/d, verified

| file | |
|---|---|
| `lib/settlement/model.ts` · `ledger.ts` · `fees/rates.ts` · `checkout-helpers.ts` | **unchanged** |
| `app/admin/offers/[id]/page.tsx` · `offers/new/page.tsx` | **unchanged** |
| `app/admin/settlements/[id]/page.tsx` | unchanged in this pass |
| changed | `calendar/page.tsx` (33), `offers/page.tsx` (107), `globals.css` (+146) |

### Item 11 complete

| | |
|---|---|
| Ticketing | new screen on `/admin/orders/[id]` |
| Settlements | restyled, 74 money values diffed identical |
| Offers | list rebuilt, builder restyled with no page edits |
| Calendar | chrome restyled |

**Rebuild status: 9 of 71** admin screens touched — box office, Command
Center, create a show, team, access control, ticketing, settlement, offers
list, offer builder, calendar.

---

## Item 12 — Rental quotes, Event orders, Invoices, Expenses, Reporting, Relationships

The last item, and the one where the honest answer is mostly about what has no
data behind it. Two things were real and got built; four are flagged.

### Built: Invoices — a screen that was simply missing

`invoices` has a full API (`/api/invoices`, `[id]`, `/checkout`, `/payments`),
a Stripe payment link, and a **customer-facing page at `/pay/[invoiceId]`**.
Invoices could be raised from a private event and paid by a client — and there
was **nowhere to see them all**. Receivables existed one event at a time.

`/admin/invoices` now shows outstanding, collected, past-60, an aging ladder
(current / 1–30 / 31–60 / 61–90 / 90+, the late buckets hatched), and the list.
A row opens the client's own payment page — the same link they were sent.

An invoice counts as outstanding when it has a **balance**, not when its status
field says so: status is set by hand and drifts, the balance is arithmetic.

Registered in `lib/admin/nav.ts` under tab key `invoices_payments`, matching
the capability of the same name.

### Fixed: another auth hole, and the split that matters

`/api/invoices` was **entirely unauthenticated** on the service-role client —
the third namespace in this shape, after `/api/admin/*` and `/api/events/*`.
The LIST returns every client's name, email, phone, billing address and
balance.

- `GET /api/invoices` (list) and `POST` → **staff only**
- `PUT` / `DELETE` on `[id]` → **staff only**
- **`GET /api/invoices/[id]` stays public by design** — `/pay/[invoiceId]` is
  what a client opens from an emailed link and it has no session. The UUID is
  the bearer token for that one invoice, the same shape as a ticket QR.
  Guarding it would break every outstanding payment link.

### Fixed: the reports were 68 rows from silently truncating

`settlement_ledger` is at **932 rows** and `orders` at **933**. The monthly
revenue report read the ledger with no pagination; PostgREST caps at 1000 and
ignores the limit. At 1,001 rows it would have started under-stating the month
with no symptom at all — the same failure that made Tyler Halverson read 15
instead of 42. `monthly-revenue`, `orders` and `expenses` now use `fetchAll`.

### Flagged — no data model behind them

| Mockup screen | Reality |
|---|---|
| **Rental quotes** | `private_event_proposals` exists and `/admin/private-events/[id]` is 1,752 lines of working proposal flow. The mockup's quote screen is a different shape; reconciling them is a design decision, not a restyle |
| **Event orders (BEO)** | No `beos` table, no BEO document. The mockup draws line-by-line reconciliation of contracted vs actual — nothing stores it |
| **Expenses** | `settlement_expenses` is per-settlement and `operational_expenses` exists, but there is no standalone expense ledger screen. The reports endpoint aggregates both, which is the useful half |
| **Relationships (CRM)** | No `contacts` table at all. `/admin/agents` (529 lines) is the nearest thing and covers agents only. A CRM is a schema project, not a screen |

Drawing any of those four would have meant inventing the data. The pattern
this rebuild has followed throughout — build what is real, name what is not —
says leave them.

### Rebuild status

**11 of 71** admin screens. Items 1–12 are complete as far as the data allows.


---

## CORRECTION — the ledger gap's real cause (2026-09-10, later)

**My earlier diagnosis was wrong, and the fix I shipped for it did not work.**

I attributed the missing ledger rows to `fetchActualStripeCost()` running
before the insert — an external API round-trip between creating the order and
recording the money. It was a plausible story, it fitted the correlation with
`485dbfd`, and it was not the cause. Moving that call was harmless and
irrelevant.

An order placed **an hour after that fix deployed** still had no ledger row.

### The actual cause

```
settlement_ledger.stripe_event_id  TEXT REFERENCES stripe_events(id)
```

The webhook writes the ledger row in the **middle** of processing (line 515).
It logged the event into `stripe_events` at the **end** (line 1157) —
deliberately, so a failed event could be retried. So the foreign key pointed at
a row that did not exist yet. Every insert was rejected with **23503**,
`writeSettlementLedger` logged the failure and swallowed it — it must not
throw, the sale is already complete — and the row was silently lost.

**Proven, not inferred.** Reproduced against production twice:

| | |
|---|---|
| Insert a ledger row with a `stripe_event_id` that has no event row | **HTTP 409** — `violates foreign key constraint settlement_ledger_stripe_event_id_fkey` |
| Insert the `stripe_events` row **first**, then the same ledger row | **HTTP 201** |

And the corroborating fact I should have looked for first: **of 932
`settlement_ledger` rows, ZERO carry a `stripe_event_id`.** Not one, ever.
Every row that exists came from a path that does not set one — cash sales,
free checkouts, comps, or a backfill. Broken since `44f35e5`, in April.

That single query would have found this in a minute. I went looking for a
timing story instead, because one fitted the dates.

### The fix

`plans/stripe-events-processed-at-migration.sql` adds
`stripe_events.processed_at`. The event row is written **first**, with
`processed_at` NULL, so the foreign key is satisfiable from that moment. It is
stamped at the end. The dedupe check tests `processed_at` rather than
existence, so an event that dies half way is still retried — which is exactly
what logging late was protecting, and it is preserved.

The code tolerates the column not existing yet, so deploy order does not
matter.

**This migration is the thing that actually closes the gap.** Until it runs and
the code ships, every card sale keeps losing its ledger row.

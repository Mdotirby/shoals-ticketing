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

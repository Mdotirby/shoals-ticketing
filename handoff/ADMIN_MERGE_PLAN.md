# Admin merge plan

Resynced against `Mdotirby/shoals-ticketing@main` (tree `0b4b6fdf9c43`), 2026-09-09.
Design source of truth: `VenueCore.dc.html`. Production bends to it.

Plan only — no code written. Two design additions were made because the merge
needs screens the mockup didn't have; see § 0.

---

## 0. Design additions made this turn

**`Users & credentials`** (new screen, Identity group). The mockup's Access
Control page had a read-only team table. You asked to edit each user's email,
phone, access level and override their password — none of which had a UI to
build against. The new screen is the missing half: team list on the left,
one edit panel on the right (first/last, email with verified state, phone,
access level as a six-option radio with levels above you locked out), then a
Credentials block — override password with generate, force-change-at-next-login
toggle, send reset link, reset MFA, revoke sessions — then suspend/delete with
the FK guardrail spelled out. Below it, the three-card **forgot password** flow
the user drives themselves: request → check email → set new password.

**Hard-ticket band on the Dashboard.** Added above the cash-position KPIs, not
in place of them. Left: tickets sold and gross revenue at 40px, with net to
venue / avg ticket / ticketed-events-count underneath. Right: per-event table —
sold/cap, sell-through bar, gross. Explicitly labelled "ticketed only" and
noted as excluding RSVP, private rentals, comps and internal holds, because the
current API does not make that distinction (§ 4).

**`Create a show`** (new screen, Shows group). There was no event-creation
mockup — a real gap, since production has a 44KB form and the design is meant to
be master. Built against the real field set: the six event classes as chips with
"sells / no tickets" marked, the three independent states (booking / visibility
/ ticketing) side by side, the basics, a tier editor with per-tier potential, and
the on-sale / free / facility-fee / reserved-seating / promo toggles. Right rail
carries an "if it sells out" money breakdown (face → service fee → gross →
facility fee → processing → net) and a live buyer-card preview.

Access Control keeps the permission matrix and audit log. Users & credentials is
the per-person editor. Create a show is the class-driven form. Three pages,
three jobs.

---

## 1. What's actually already there

Worth knowing before anything gets built, because three of the four asks are
closer to done than they look.

**`PUT /api/admin/users` already does the hard part.** It accepts `email` and
`new_password`, calls `auth.admin.updateUserById` with the service role, and
mirrors email onto `admin_users`. Password override needs **no new backend** —
it needs a UI. It also already spreads arbitrary `fields` onto the row, so new
columns are writable the moment they exist.

**`DELETE` already handles the FK wall.** It catches Postgres `23503` and
returns a plain-English 409 naming the likely blockers (finalized settlement,
campaign, template, ad/deal-lab row, agent profile). The design's delete-blocked
copy should match that message rather than invent its own.

**`must_change_password` exists** on `admin_users` and is returned by
`POST /api/admin/auth`. The force-change toggle has a column already.

**Onboarding email already deep-links credentials.** `POST /api/admin/users`
builds `venuecore.live/login?email=…&temp_password=…`, the login page prefills
and scrubs the params, and it CCs `matt.irby@west72ent.com`. The reset-link
flow should reuse `lib/email/onboarding-email` rather than start a new sender.

**`sidebar_permissions`** is a real table with a real API
(`venue_id, role, tab_key, visible`, upsert on that triple) and a working
permissions page.

So: no new auth infrastructure. What's missing is a phone column, a reset-token
flow, an audit table, and a lot of UI.

---

## 2. The blocker — role taxonomy is defined four times, differently

This has to be settled before any access-control work, because every other
decision hangs off it.

| Source | Roles |
|---|---|
| `lib/types/admin.ts` | owner, super_admin, venue_admin, promoter, full_admin, box_office, read_only, door_greeter, artist, partner (10) |
| `settings/permissions` `ROLES` | owner, venue_admin, full_admin, box_office, read_only, door_greeter, artist (7) |
| `users/route.ts` `ROLE_LABELS` | the 7 above + super_admin, agent (9) |
| **Design** `roleCols` | Owner, Venue Admin, Talent Buyer, Finance, Events Mgr, Box Office (6) |

Four lists, no two the same. `full_admin` appears in two of them and not in the
type union's intent; `super_admin` appears in two; the design introduces
**Talent Buyer**, **Finance** and **Events Manager**, none of which exist
anywhere in the repo. Meanwhile `promoter`, `read_only`, `door_greeter`,
`artist`, `partner` and `agent` exist in production and are absent from the
design.

`artist`, `partner` and `agent` are not staff access levels — they're external
portal identities with their own routes (`/agent`, `/admin/partner-dashboard`,
artist guest lists) and their own API surface. Collapsing them into a six-role
staff matrix would break those portals.

**Proposed shape** — two axes instead of one:

- **Staff access level** (the six in the design, ordered L1–L6). This is what
  the matrix edits and what the Users screen assigns.
- **External identity** (`artist`, `partner`, `agent`) — unchanged, untouched by
  the matrix, routed as they are today.

Then a migration mapping the legacy strings:

| Legacy | Becomes | Note |
|---|---|---|
| `owner` | Owner | unchanged |
| `super_admin` | Owner | platform level; folds in |
| `venue_admin` | Venue Admin | unchanged |
| `full_admin` | Venue Admin | **decided** — folds in; Venue Admin holds settlement-signing authority |
| `promoter` | Talent Buyer | closest fit |
| `box_office` | Box Office | unchanged |
| `door_greeter` | Box Office | scoped to scan-only via matrix, not a role |
| `read_only` | — | becomes a *scope*, not a level — see § 8 |
| `artist` / `partner` / `agent` | external identity | out of the matrix |

Nothing about Finance or Events Manager exists yet; those are net-new levels and
will start with zero users.

---

## 3. Access control — two systems that need to become one

Today `sidebar_permissions` answers only "can this role see this nav tab," 12
tabs, boolean. The design's matrix answers "can this role perform this
capability," 16 capabilities, three states (full / scoped / none). Those are
different questions, and nav visibility is the weaker one — hiding Settlements
in the sidebar does not stop a Box Office user deep-linking to
`/admin/settlements/[id]`.

**Plan:**

1. New table `role_capabilities` — `venue_id, role, capability_key, level`
   where level ∈ `full | scoped | none`. Sixteen capability keys, taken verbatim
   from the design's `permRows` (assign_roles, venue_lifecycle,
   cross_tenant_reporting, holds, offers, ticket_scaling, inventory_release,
   door_sales_comps, scan_checkin, view_settlement, sign_payout,
   quote_contract_rentals, invoices_payments, expenses, export_ledger,
   read_audit).
2. Keep `sidebar_permissions` as-is. Derive nav visibility from capabilities
   instead of storing it twice — a tab shows if any capability mapped to it is
   not `none`. **Don't drop the table** until the derivation is proven; it's the
   first-paint cache and the layout reads it.
3. Server-side enforcement is the point. A shared guard
   (`lib/auth/can(user, capability, scope)`) called in every `/api/admin/*`
   route handler and in each admin page's data load. Right now
   `/api/admin/users`, `/api/admin/dashboard` and `/api/admin/sidebar-permissions`
   do **no role check at all** — they use the service-role client and answer
   anyone who can reach the URL. That's the real gap behind this screen, and
   it's a security fix, not a design one.
4. The design's five guardrails become server-side invariants, not UI copy:
   no self-elevation, no editing at-or-above your own level, last Venue Admin
   undeletable, payout re-prompts MFA, owner assumption time-boxed and logged.
5. New table `audit_log` — `venue_id, actor_id, action, target_type, target_id,
   detail, created_at`, insert-only, no update/delete grant. The design promises
   immutable with 7-year retention; that has to be a database constraint.

**Logic to remove:** the hardcoded `DEFAULTS` map in
`settings/permissions/page.tsx` duplicates `sidebarItems` in
`admin/layout.tsx`. One of the two has to become the source; the page comment
already admits it's a mirror. Ship the seed as data, delete the client copy.

---

## 4. Dashboard — the math is the problem, not the layout

You want tickets sold and gross revenue for **hard-ticket events**. Three things
stand in the way.

**(a) The event class filter is missing from the query — but the model already
exists.** Corrected after cross-referencing the create form; my earlier read was
wrong. `events.event_type` is already a six-value enum in production, and
`app/admin/events/new/page.tsx` line 246 already defines the exact predicate:

```js
const isHardTicket = ["hard_ticket", "ticketed", "co_promote", "rental_box_office"]
  .includes(form.event_type);
```

Full value set: `hard_ticket`, `ticketed`, `non_ticketed`, `private`,
`co_promote`, `rental_box_office`. Alongside it: `is_free` (bool),
`booking_status` (confirmed/hold/cancelled), `hold_level` (H1/H2/H3),
`status` (draft/published), `on_sale` date, `facility_fee`.

→ **No migration. This is a WHERE clause.** `/api/admin/dashboard` simply never
applies it — it counts every row in `tickets` and sums every paid order,
so RSVPs, comps, private rentals and non-ticketed calendar holds all inflate the
same number. The fix is to scope the hard-ticket band to
`event_type IN ('hard_ticket','ticketed','co_promote','rental_box_office')`
and `is_free = false`, reusing that predicate rather than re-deriving it.

**Lift it into `lib/eventClass.ts`** as `isHardTicket(event)` /
`HARD_TICKET_TYPES`. It is currently duplicated as an inline array literal in
both `events/new/page.tsx` (twice — lines 246 and 421) and, by inspection,
`events/[id]/edit/page.tsx`. Three copies of the definition of "hard ticket" is
how the dashboard and the create form drift apart.

**Also stale:** `lib/types/event.ts` declares
`event_type?: "hard_ticket" | "ticketed" | "non_ticketed" | "private"` — missing
`co_promote` and `rental_box_office`, both of which production writes. Any code
narrowing on that union is silently wrong for two real classes. Fix the union in
the same commit.

**The three-state model already exists too.** `booking_status` + `status` +
on-sale date are the three states we specced, already stored, already
independent. They just aren't presented as one thing anywhere. That's a UI job,
not a schema job.

**(b) Two sources of truth for revenue.** `/api/admin/dashboard` uses
`orders.total_amount`. `/api/events/[id]/revenue-summary` sums
`settlement_ledger` and decomposes properly — `gross_amount`, `ticket_revenue`,
`ticketing_fee`, `tax_collected`, `stripe_fee`, `net_to_venue` — and handles
refunds correctly because the Stripe webhook writes negative rows. The
dashboard's number does **not** net refunds, and cannot separate face value
from fees or tax.

→ **Repoint the dashboard at `settlement_ledger`.** Then "gross revenue" on the
new band means `sum(gross_amount)` net of refunds, "net to venue" means
`sum(net_to_venue)`, and the number reconciles with settlements instead of
contradicting them. This is the single highest-value change in the whole plan:
right now the dashboard and the settlement page disagree, and settlements is
right.

**(c) N+1 in `upcomingEvents`.** The loop runs two queries per event inside an
`await`, serially — 5 events is 10 round trips after the 10 parallel ones. The
new per-event band makes that worse. Replace with one grouped ticket count and
one grouped capacity query, joined in memory.

**Logic to add:** `sold` and `capacity` per event already derivable
(`tickets` count, `ticket_tiers.capacity` sum) — the band needs sell-through,
which is just `sold / capacity`, and avg ticket = `ticket_revenue / sold`
(face value, not gross — otherwise fees inflate it).

---

## 5. Private event lifecycle

The repo has more than our earlier gap analysis credited. Real, working:
`private_event_revenue`, proposals with accept/decline, contracts, attachments,
and `invoices` with line items, tax rate, amount paid and computed
`balance_due`. `/admin/private-events/[id]/page.tsx` is 77KB — that's not a stub.

What is genuinely missing against the design:

| Design screen | Repo state | Gap |
|---|---|---|
| Rental quotes | proposals API exists | No **rate card** — every quote is typed from scratch, no per-line margin |
| Event orders (BEO) | nothing | Run of show, F&B, floorplan, staffing — net new |
| Invoices | `invoices` table + checkout + payments | No **deposit schedule**; one due date, no instalments |
| Expenses | `settlement_expenses` only | No standalone register — a bar invoice spanning two events has nowhere to live |

**Also broken:** `/admin/private-events/page.tsx` fetches `/api/events` with no
filter and does `.filter(e => e.event_type === 'private')` client-side. Every
admin visiting that page downloads every event in the system. Needs
`?event_type=private` server-side. It's also the only admin page still painting
in the pre-glass palette (`#0b0d1d`, `GOLD = "#ffffff"` — a variable named GOLD
holding white, left over from the old theme).

**Sequencing:** rate card first (it unblocks quotes), then deposit schedule
(unblocks the cash-position dashboard, which needs deposits-held-in-trust),
then BEO, then the expense register. BEO is the biggest build and the least
blocking — it's operations paperwork, not money.

---

## 6. Users & credentials — what to build

Against the new design screen:

**Schema:** add `phone` to `admin_users`. Note `buyer_phone` / `buyer_email`
already exist but are the *promoter's contract contact*, not the user's own
number — don't reuse them. Add `suspended_at` (the design shows a Suspended
state; today it has no column). Add `password_changed_at` and
`password_changed_by` so the audit entry can say whether a change was
self-service or an override.

**API:**
- `GET /api/admin/users` — add `phone`, `must_change_password`, `suspended_at`
  to the select. Add the role guard.
- `PUT` — works already. Add: audit-log write on every email/password/role
  change, the at-or-above-your-level check, the last-Venue-Admin check, and an
  email notification to the user when an admin changes their credentials (the
  design promises this).
- New `POST /api/admin/users/[id]/revoke-sessions` — `auth.admin.signOut`.
- New `POST /api/admin/users/[id]/reset-mfa`.

**Forgot password — net new, three routes:**
- `POST /api/auth/forgot-password` — takes email, always returns 200 with an
  identical body whether or not the account exists (the design's step-1 footnote
  is a real requirement, not flavour text). Rate limit: 1/min, 5/hour per
  address. Issues a single-use token, 30-minute expiry, invalidating any prior
  one.
- `GET/POST /api/auth/reset-password` — validates token, sets password, revokes
  all other sessions, clears `must_change_password`, writes audit as
  self-service.
- New table `password_reset_tokens` — `id, user_id, token_hash, expires_at,
  used_at`. Store a hash, never the token.
- Public pages `/forgot-password` and `/reset-password` on the storefront glass
  vocabulary (they're pre-auth, so they use the storefront chrome, not admin).

**Buyer variant:** the design notes the buyer path skips step 3 and signs them
straight in — that's passwordless, and it belongs with the buyer portal, which
is still on hold. Build the staff path now; leave the buyer branch stubbed.

---

## 7. Build order

Each step is independently shippable and reversible.

1. **Role taxonomy migration** — types, mapping, backfill. Blocks 2 and 3.
2. **`lib/auth/can()` + guards on `/api/admin/*`** — security fix, no UI. The
   three unguarded service-role routes in § 3.3 first.
3. **`audit_log` table + writes** — needed by 4 and 5 to be truthful.
4. **Users & credentials screen** + `phone`/`suspended_at` columns + the two new
   user routes. Ships the whole ask except reset.
5. **Forgot-password flow** — tokens table, three routes, two public pages.
6. **Access control screen** — `role_capabilities`, matrix UI, derive nav from
   capabilities, delete the duplicated `DEFAULTS`.
7. **Dashboard** — repoint to `settlement_ledger`, apply the existing
   hard-ticket predicate (no migration), fix the N+1, then build the band. Lift
   `isHardTicket` into `lib/eventClass.ts` and fix the stale `event_type` union
   first — both are 10-minute changes that stop the drift.
8. **Private events** — rate card → deposit schedule → BEO → expense register.
9. **Glass pass on remaining admin pages** — `/admin/private-events` is the
   worst offender; audit the rest against `globals.css` before touching them
   (the storefront lesson: read the stylesheet region for a page *before*
   assuming it's unstyled — most of admin is already themed).

Steps 1–3 are plumbing with no visible output. Worth doing anyway; 4 onward
depends on all three, and skipping them means building the UI twice.

---

## 8. Decisions I need from you

**Settled:**

- ~~`full_admin`~~ → folds into **Venue Admin**, which holds settlement-signing
  authority. Migration is a straight string rewrite; those users gain
  `sign_payout` and `view_settlement` at full.
- ~~Does `events` carry a ticketing-model field?~~ **Yes** — six-value
  `event_type` plus `is_free`, and the hard-ticket predicate already exists in
  the create form. No migration; see § 4a.

**Still open:**

1. **`read_only` as a scope, not a role?** The design has no read-only level.
   Cleanest is a `read_only` flag on top of any level — a read-only Finance user
   sees settlements but can't sign. More flexible, more work. Blocks step 1.
2. **Should overriding a password email the user?** The design says yes and names
   the admin who did it. It's the difference between a support tool and a silent
   backdoor.
3. **Gross revenue definition on the dashboard.** I've assumed
   `sum(gross_amount)` from `settlement_ledger` — face + fees + tax, net of
   refunds. If you mean face value only, that's `ticket_revenue` and the number
   drops noticeably.
4. **Do `co_promote` and `rental_box_office` belong in the hard-ticket band?**
   The create form counts them as hard ticket, so I've included them. But they
   settle to someone else — a co-pro's gross isn't all yours. Including them
   makes the band match the create form; excluding them makes it match your
   actual take. Can't be both.

Answer 1 and step 1 can start. The rest only affect the screens.


---

## 9. Event model, round two — decisions from review

Four answers, recorded before they get lost. Design work on these is **not yet
done**; this is the schema position they should be built against.

### 9.1 Co-promote is two different things wearing one label

You're right, and the current enum conflates them. Untangled:

**(a) A co-promote DEAL on a show that sells natively here.** Inventory, tiers,
scanning, settlement — all ours. The only thing that differs is how the money
splits at the end. That is **not an event class**; it's a deal structure hanging
off a normal `hard_ticket` show. It already has a home: the offer builder and
`co_promote_agreements` (which exist, with send/accept routes).

**(b) A show you promote in another city on someone else's ticketing platform.**
No inventory here. No scan, no storefront, no tiers, no Stripe. But you still
have real marketing spend, a guarantee, a settlement to reconcile from *their*
report, and a P&L line that has to appear in your combined ledger. Today the
model has no way to say this, so it either gets faked as a `hard_ticket` with
no sales (poisoning the dashboard) or doesn't get entered at all.

**Proposed:**

- Drop `co_promote` and `rental_box_office` as *classes*. Both become
  `deal_type` on a ticketed show: `own_risk | co_promote | rental_box_office |
  guarantee`. Class answers "does this sell here"; deal type answers "whose
  money is it". Those are orthogonal, and merging them is why the current enum
  has six values that don't sort cleanly.
- Add one genuinely new class: `external_promotion` — a show you promote
  off-platform. Fields it needs and nothing more: venue name (free text, not a
  `venue_id`), city, date, the deal, marketing spend, and a settlement figure
  you type in from their report. It never appears on the storefront, never
  generates a ticket, and shows in the ledger as a promoter P&L line.

This also answers the open question from § 8.4 cleanly: the hard-ticket band
filters on **class**, so co-promoted native shows are in (they are your
inventory), and `external_promotion` is out (it isn't). Whose money it is gets
reported by deal type, separately, in settlements — where it belongs.

**Venue-operator vs promoter builds:** don't fork the product. Same schema, and
the operator's own venue list decides what they see — a promoter with no venue
never sees room configs or BEOs; you, running Singin' River *and* promoting
elsewhere, see both. That's a capability question, which § 3 already answers.
Two builds would double the surface for one rare case.

### 9.2 How the statuses are actually set — and dropdowns

Current schema, three independent fields (all already exist):

| Field | Values | Who sets it |
|---|---|---|
| `booking_status` | confirmed · hold · cancelled | Talent Buyer, on the calendar |
| `status` | draft · published | **Publish action only** — see 9.3 |
| on-sale | timestamp, nullable | Talent Buyer, scheduled ahead |

Agreed on dropdowns for the create form. But **class and the states should not
merge into one control.** Class changes which fields exist — it has to be
answered first and it's structural. Booking status is a workflow state that
changes many times over a show's life. One control implying they're the same
kind of choice would mean a hold and a private rental read as siblings, which
they aren't.

Proposed form header instead: **two dropdowns and no third.**

1. **Class** dropdown (with `external_promotion` added) — drives the form.
2. **Deal type** dropdown, shown only for classes that sell — replaces the old
   co-promote/rental classes.
3. **Booking status** as a dropdown *inline in the header*, defaulting to
   Confirmed.
4. Visibility is **not a dropdown** — it's the Publish action.
5. On-sale is a datetime field inside the ticketing block, where it already is.

So: three dropdowns, one button, and on-sale stays where the tiers are.

### 9.3 Separate Publish action — agreed, and it should be a gate

Visibility should never be a side effect of saving a form. Proposed:

- Create/Save always writes `status = 'draft'`. There is no path from the form
  body to `published`.
- **Publish** is its own button, sitting away from Save, in the show's header
  once it exists. It runs the § "Before it can go on sale" checklist as a real
  precondition — at least one tier priced, artwork present, doors/show set,
  Stripe payout connected — and refuses with the specific missing item rather
  than a generic error.
- Publishing writes to `audit_log` with actor and timestamp, and is
  capability-gated (`ticket_scaling` or a new `publish_event`).
- **Unpublish** exists and is not destructive — it pulls the storefront listing
  and leaves orders, tickets and scans intact. Sold tickets stay valid.
- A published show with a future on-sale shows a countdown; publish and on-sale
  stay independent, as they already are in the schema.

### 9.4 "If it sells out" — no, it is not from the offer

It's computed live from what's on the form: `sum(tier.price × tier.capacity)`,
plus the buyer-side service fee, minus facility fee and estimated processing.
Pure inventory math. It exists because at create time there may be no offer at
all — a self-promoted show never has one.

**The distinction that matters:** the create form owns *inventory* math (what
the room can produce). The offer builder owns *deal* math (guarantee, splits,
breakeven, artist walkout). They answer different questions and must never be
merged — but they must agree on the one number they share: **potential gross**.

Today they'd derive it separately, which is the same two-sources-of-truth
pattern as the dashboard vs. settlements (§ 4b). Proposed:

- One helper, `lib/pricing/potentialGross(tiers, feeConfig)`, used by the create
  form, the offer builder, and the deal-lab simulator.
- When a show has an offer attached, the create/edit form shows the offer's
  breakeven line **next to** the sellout figure, so you can see "sells out at
  $22,495 / breaks even at $14,200" in one place. That's the number that
  actually drives a booking decision, and right now it lives on two screens.

### 9.5 Built — Create a show, revised

The screen now reflects 9.1–9.4:

- **Three dropdowns** replace the six class chips and the three radio groups:
  Event class, Deal type, Room. Class carries a "sells / no tickets" tag; Deal
  type is captioned as settlement-only so it reads as orthogonal to class.
- **Visibility is a locked, dashed field reading Draft**, not a control. The
  caption says saving always writes Draft.
- **Booking status stays a dropdown** in its own "Where it stands" card, next to
  the locked visibility field — so the two read as different kinds of thing.
- **Publish is its own card at the bottom of the right rail**, below Save as
  draft, carrying the precondition checklist and a disabled button reading
  "Publish — 1 item outstanding". Unpublish behaviour is stated.
- **Breakeven sits directly under the sellout figure** — $14,200 / 452 tickets /
  70% of the room, with the guarantee + production + marketing split, labelled
  "from the offer". Caption states plainly that sellout is inventory math from
  this form, the offer owns guarantee and splits, and both read potential gross
  from one helper.

Still to build against 9.1: the `external_promotion` class form variant (venue
as free text, no tiers, typed settlement figure) and the `deal_type` column
migration that retires `co_promote` / `rental_box_office` as classes.

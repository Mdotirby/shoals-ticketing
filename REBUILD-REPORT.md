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

## Event model — a window that closes

`ADMIN_MERGE_PLAN.md` § 9.1 proposes dropping `co_promote` and
`rental_box_office` as event *classes*, making them `deal_type` on a ticketed
show, and adding one genuinely new class, `external_promotion`, for shows
promoted off-platform.

**Production has zero rows of either type**, so that restructure has nothing to
migrate today. It will never be cheaper. It gets expensive the moment someone
creates the first co-promote show.

Worth doing **before item 6**, because the Dashboard's hard-ticket band
definition depends on which model is in place, and building the band twice is
the waste. `lib/eventClass.ts` already separates `isHardTicket()` from
`settlesToThirdParty()` so the two questions can't be answered by accident.

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

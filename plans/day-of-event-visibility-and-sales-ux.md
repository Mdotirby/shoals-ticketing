# Plan — Day-of event visibility, scanner lookup, sales UX, and cash sales

Source: user feedback text (VenueCore) + Matt's box office notes, 2026-08-05.
Status: **§2 implemented** (Central-time helpers, box office, scanner, list ordering,
orders search). **§3 cash sales still on hold** — under discussion, deliberately not built.

Decisions locked in by Matt:
- **"Sort by name"** = a last-name search on the **event-specific ticket sales page**
  (`/admin/orders/[id]`) orders table — same interaction as the scanner's name lookup.
- **Timezone** = hardcode **America/Chicago** globally, both `venuecore.live` and
  `west72ent.com`. Every date/time comparison and display runs on venue-local time.
- **New feature** = cash sales at the box office (§3).

---

## 1. Deciphering the original feedback

### "Under ticket sales: Add sort by name"

The per-event orders table at `/admin/orders/[id]` lists every buyer with no sort and no
search. Rows come back `created_at DESC` ([app/api/orders/route.ts:15](app/api/orders/route.ts:15))
and render straight through ([app/admin/orders/[id]/page.tsx:721](app/admin/orders/[id]/page.tsx:721)).
At will-call, staff hunt for one name in a purchase-ordered list. → Add a name search box
plus sortable Buyer column, matching the scanner's lookup behavior.

### "For scanner: not close ticket sales AT ALL / leave database open in drop down"

"Ticket sales" here means *the ticket database for that show*, not the act of selling. The
scanner's show dropdown drops the event, and with no event selected the name search is
hard-disabled — [app/admin/scan/page.tsx:82](app/admin/scan/page.tsx:82) no-ops without
`selectedEventId`, and the UI shows "Select a show above to search guest names"
([app/admin/scan/page.tsx:491](app/admin/scan/page.tsx:491)). When the event falls out of
the dropdown, name lookup dies. That's the "otherwise one cannot look up by name."

**Root cause:** `/api/admin/scan/events` filters `gte("date", today)` where `today` is a
**UTC** date string ([app/api/admin/scan/events/route.ts:9](app/api/admin/scan/events/route.ts:9)).
On Vercel (UTC) that rolls over at **7:00 PM CDT / 6:00 PM CST** — right at doors, tonight's
show vanishes. The auto-select at [app/admin/scan/page.tsx:71](app/admin/scan/page.tsx:71)
uses the same UTC date, so it also stops picking tonight's show.

### "On Events Page and Ticket sales: remove past shows, active show first, then upcoming"

Both `/admin/events` and `/admin/orders` request `?all=1`
([app/admin/events/page.tsx:39](app/admin/events/page.tsx:39),
[app/admin/orders/page.tsx:62](app/admin/orders/page.tsx:62)), which **bypasses the
past-event filter entirely** in [app/api/events/route.js:121](app/api/events/route.js:121).
Rows return `ORDER BY date ASC`, so the oldest dead shows sit at the top and tonight's show
is buried.

### Matt: "box office event disappears day-of"

**Confirmed, and worse than described.** [app/boxoffice/page.tsx:181](app/boxoffice/page.tsx:181)
filters `new Date(e.date) >= now`. A date-only string like `"2026-08-05"` parses as
**midnight UTC** = 7:00 PM CDT on **Aug 4** — the show drops out of the box office dropdown
the *evening before*, and is gone all day-of.

### The common thread

Three of four items are one defect: **date-only event dates compared against UTC "now"** on
a UTC server for a venue that lives in Central time. The platform ends the show day between
6 and 7 PM local — mid-doors.

---

## 2. Timezone + visibility fixes

### Step 0 — Global Central-time helpers in `lib/dates.ts`

`lib/dates.ts` already centralizes `safeDate`. Add:

- `VENUE_TZ = "America/Chicago"` — one constant, both brands, every surface.
- `localTodayISO()` → `"YYYY-MM-DD"` in Central. Replaces every
  `new Date().toISOString().slice(0,10)` currently used as "today".
- `eventEndsAt(dateString)` → local midnight ending the show day (Matt's "until 12am next
  day"). One cutoff, no grace window, no per-surface variation.
- `isEventPast(dateString, now?)` / `isEventLive(...)` — the single predicate everything
  calls.

**Note on "CST":** `America/Chicago` is CST in winter and CDT in summer — it always tracks
the venue's wall clock, which is what "everything in Central" means operationally. A fixed
UTC−6 would put every summer show an hour off. Going with `America/Chicago`.

Unit tests are the point of this step: an event dated today, evaluated at 6 PM, 8 PM,
11:59 PM, and 12:01 AM Central, with the process clock forced to UTC. That's the regression
that keeps biting.

### Step 1 — Box office holds tonight's show through the night ★

**This is the whole ask.** Tonight's event must stay in the box office dropdown so staff can
sell at the door on the Stripe Terminal reader.

[app/boxoffice/page.tsx:181](app/boxoffice/page.tsx:181) → `!isEventPast(e.date)` instead of
the UTC comparison, and auto-select today's show so the reader is armed on the right event
without staff touching the dropdown. Today's show stays sellable all day and all evening,
dropping off at local midnight.

No change needed to the Terminal flow itself — it already works off `selectedEventId`
([app/boxoffice/page.tsx:197](app/boxoffice/page.tsx:197)); it has simply had no event to
point at, because the event was gone from the list before doors.

### Step 2 — Scanner dropdown, same one-line cause

`/api/admin/scan/events` filters `gte("date", <UTC today>)`
([app/api/admin/scan/events/route.ts:9](app/api/admin/scan/events/route.ts:9)) → switch to
`localTodayISO()`. Auto-select at [app/admin/scan/page.tsx:71](app/admin/scan/page.tsx:71)
→ Central today.

**No lookback window.** Once the UTC bug is gone, tonight's show simply stays in the
dropdown through midnight, which is what "leave the database open until close" meant. Past
shows stay out of the list.

### Step 3 — Name lookup that actually finds people

`/api/admin/scan/search` matches `ilike("customer_name", "% " + lastName)`
([app/api/admin/scan/search/route.ts:42](app/api/admin/scan/search/route.ts:42)) — the
leading space means it **misses single-word names entirely** and matches whole last names
only, no partials. Change to an `or(...)` across `customer_name` / `customer_email` with
`%term%`, keep name ordering, relabel the field "Name or email".

### Step 4 — Events + Sales lists: active first, past hidden

Both pages, same treatment:

- Keep `all=1` (it carries the hold/type/status filters those pages depend on) and do the
  past/upcoming split client-side with `isEventPast` — less churn in
  [app/api/events/route.js](app/api/events/route.js), whose `include=past|all` contract is
  used elsewhere.
- Sort: **today's show(s) pinned first**, then upcoming ascending.
- Past shows behind a "Show past events" toggle, most-recent-first. Nothing deleted, just
  out of the way.

### Step 5 — Name search on the event ticket sales page

[app/admin/orders/[id]/page.tsx:706](app/admin/orders/[id]/page.tsx:706): a search box above
the orders table matching name / email / phone (same `%term%` semantics as Step 3, so the
two lookups behave identically), plus sortable `Buyer`, `Qty`, `Total`, `Date` headers.
Client-side — the row count per event is small. Default stays newest-first.

---

## 3. Cash sales at the box office

### Requirement as stated

A cash sale collects **face value only** — no service fee, no facility fee, no CC fee, no
tax added on top. It **feeds Net Receipts, not Gross Receipts**, so the fee/tax deduction
walk never touches it.

### Why that placement is right

The settlement walk today ([app/api/settlements/[id]/refresh/route.ts:63](app/api/settlements/[id]/refresh/route.ts:63)) is:

```
Gross Receipts (audit.total_gross, = Σ face value of sold tickets)
  − Service Fees      (venue config × paying tickets)
  − Facility Fees     (venue config × paying tickets)
  − Tax Collected     (gross × tax_rate, multiplier or divisor)
  − CC Processing Fees (residual)
= Net Receipts        ← artist split base
```

If cash face value went into `total_gross`, the walk would immediately deduct service +
facility + tax + CC against money that never carried those charges — understating the
drawer by roughly $6–8 a ticket. Landing it below the deductions is the correct model.

### 3a. Data model

| Thing | Approach | Migration? |
|---|---|---|
| `orders.source = 'cash'` | Column is plain `TEXT DEFAULT 'online'`, **no CHECK constraint** ([plans/promo-codes-migration.sql:44](plans/promo-codes-migration.sql:44)) | No |
| `orders.total_amount` | face × qty (no fees, no tax) | No |
| `settlement_ledger` row, `type = 'cash'` | `type` is plain TEXT ([plans/settlement-ledger-migration.sql:29](plans/settlement-ledger-migration.sql:29)); `ticketing_fee` / `tax_collected` / `stripe_fee` = 0, `net_to_venue` = full amount | No |
| `settlements.cash_receipts`, `settlements.cash_tickets_count` | new columns, default 0 | **Yes** |
| `orders.sold_by UUID → admin_users(id)` | so the drawer reconciles per staff member — cash without attribution is unauditable | **Yes** |
| `orders.cash_tendered NUMERIC` | optional, for change-due records | Yes (same migration) |

New allowed-field entries in [app/api/settlements/[id]/route.ts:85](app/api/settlements/[id]/route.ts:85)
for the two settlement columns.

### 3b. The sale itself

New `POST /api/boxoffice/cash`, modeled directly on the comp route
([app/api/admin/comps/route.ts:60](app/api/admin/comps/route.ts:60)), which already does
everything needed for a non-Stripe sale: insert order → resolve default tier → mint QR
tickets → write a settlement_ledger row → upsert the customer profile. The cash route is
that flow with `source: "cash"`, `total_amount = face × qty`, and a `type: "cash"` ledger
row carrying the real dollars.

Auth: reuse the box office role gate (`owner`, `venue_admin`, `box_office` —
[app/boxoffice/page.tsx:16](app/boxoffice/page.tsx:16)); stamp `sold_by` from the session.

### 3c. Box office UI

- Third payment mode alongside Terminal and Manual card — `PaymentMode` at
  [app/boxoffice/page.tsx:20](app/boxoffice/page.tsx:20) gains `"cash"`.
- Price display shows **face only**, with an explicit "cash price — no fees or tax" line so
  staff quote the right number at the window.
- Amount tendered → change due calculator.
- Buyer email **optional** for cash walk-ups (they often won't give one). Name required.
  With no email, skip delivery and show the QR on screen to scan directly. *Open question
  below — the scanner's name lookup keys off `customer_name`, so name-only still works.*
- Confirmation screen shows cash collected + running drawer total for the shift.

### 3d. Audit math — the risky part

`computeEventAudit` ([lib/settlement/audit.ts](lib/settlement/audit.ts)) currently sorts
every order into exactly two buckets, comp or paid. Cash needs a **third**, and getting this
wrong corrupts settlements silently:

- **CC fee residual.** [lib/settlement/audit.ts:298](lib/settlement/audit.ts:298) derives
  processing fees as `stripe_gross − face − svc − fac − tax`, where `stripe_gross` is
  `Σ orders.total_amount` for non-comp orders. Let cash orders into that sum and the
  residual drops by (svc + fac + tax) × cash tickets, goes negative, and silently falls back
  to the 2.7% + $0.30 formula. Cash must be excluded from `total_paid_amount` and
  `paid_order_count`.
- **Fee multiplication.** `tickets_sold_count` drives `ticketing_fees` and `facility_fees`
  ([lib/settlement/audit.ts:281](lib/settlement/audit.ts:281)). Cash tickets must not
  increment it, or the settlement charges fees on cash.
- **Tax base.** Cash face must stay out of `tier.gross` → `total_gross`
  ([lib/settlement/audit.ts:329](lib/settlement/audit.ts:329)), which is what tax is
  computed against.
- **But they're real butts in seats.** Cash tickets still count for capacity, drop count,
  and the ticket audit table — add a `cash` column beside `sold` / `comps` so the audit
  still reconciles to the room.

New audit outputs: `cash_receipts`, `cash_tickets_count`.

### 3e. Settlement walk

```
Gross Receipts (card)
  − Service Fees
  − Facility Fees
  − Tax Collected
  − CC / Processing Fees
= Net Card Receipts
  + Cash Receipts        ← no fees, no tax, straight through
= Net Receipts             (artist split base)
```

Touches: [app/api/settlements/[id]/refresh/route.ts:63](app/api/settlements/[id]/refresh/route.ts:63),
settlement creation in [app/api/settlements/route.ts:124](app/api/settlements/route.ts:124),
the Financial Summary block at [app/admin/settlements/[id]/page.tsx:1141](app/admin/settlements/[id]/page.tsx:1141),
the PDF at [lib/pdf/settlement-pdf.ts:282](lib/pdf/settlement-pdf.ts:282), and the calendar
panel readout at [app/admin/calendar/EventPanel.tsx:646](app/admin/calendar/EventPanel.tsx:646).

**Money decision to confirm:** placing cash inside Net Receipts means it sits *above* the
artist split — the artist shares in door cash. That's standard for a door deal and I'd
assume it's what you want, but it is the difference between the artist getting a cut of the
cash drawer or not. If not, cash goes below the split line as venue-only revenue. Flagging,
not blocking — I'll build it above the split unless you say otherwise.

### 3f. Reporting + reconciliation

- Cash / card split on the event sales page and in the orders report CSV
  ([app/api/admin/reports/orders/route.ts](app/api/admin/reports/orders/route.ts)).
- Drawer reconciliation view: cash collected per event, per staff member (via `sold_by`),
  per shift.
- `/api/marketing/event-performance` already counts all paid orders regardless of source
  ([app/api/marketing/event-performance/route.ts:22](app/api/marketing/event-performance/route.ts:22)),
  so cash sales flow into sold counts on the Sales page automatically. Verify, don't change.
- Cash tickets carry real QR codes through the comp pipeline, so they scan normally with no
  scanner changes.

### 3g. One tax caveat

Alabama sales tax generally still applies to paid admissions whether the buyer paid cash or
card — not itemizing it at the window doesn't remove the venue's liability, it makes the
cash price tax-*inclusive*. The build does exactly what you asked (nothing added on top at
the window). If the venue does owe tax on that cash, the clean handling is a per-venue
"cash price is tax-inclusive" toggle that backs the tax out of cash receipts on the
settlement using the existing `divisor` tax method
([lib/settlement/audit.ts:337](lib/settlement/audit.ts:337)) — the plumbing is already
there. Worth a word with the accountant; not a blocker.

---

## 4. Sequencing

1. **Step 0** — Central-time helpers + tests. Everything in §2 depends on it.
2. **Step 1** — box office day-of fix. Highest operational pain, smallest diff.
3. **Steps 2 + 3** — scanner dropdown + name search. Door staff.
4. **Step 4** — Events + Sales list ordering.
5. **Step 5** — name search on the event ticket sales page.
6. **§3 cash sales** — migration → API → audit math → settlement walk → UI → reporting.
   Independent of §2; the audit math is where the care goes.

## 5. Open questions

Resolved: no scanner lookback window, and a single hard cutoff at local midnight for every
surface — the only requirement is that the show in progress never drops off and the reader
can sell at the door.

- **Cash + artist split** — above or below the split line (§3e).
- **Cash buyer email** — optional (my assumption, walk-up reality) or required so every
  ticket is deliverable?

## 6. Noted, out of scope

Other UTC-today usages drift the same way after 7 PM:
[app/admin/page.tsx:404](app/admin/page.tsx:404) and
[app/api/admin/dashboard/route.ts:86](app/api/admin/dashboard/route.ts:86) (dashboard
"upcoming" counts). Not part of this ask; they should adopt the Step 0 helper eventually.

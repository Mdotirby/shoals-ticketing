# Ad Engine + Deal Lab — Phase 1 System Analysis

> Mandatory pre-build report. Status: **complete — green-light to build**.
> Scope: Two isolated, additive modules (`/modules/ad-engine`, `/modules/deal-lab`) that must not modify or duplicate existing Offers / Pricing / Revenue logic.

---

## 1. Structured Output

```json
{
  "existing_inputs": [
    "events(id,title,venue,date,price,capacity,venue_id,event_type,booking_status,start_time,end_time,facility_fee_enabled,is_free,on_sale_at,landing_page_slug,status)",
    "ticket_tiers(id,event_id,tier_name,price,capacity,sort_order) — canonical tier capacity + price",
    "ticket_types(id,event_id,name,price,quantity_available,quantity_sold,sort_order) — legacy tiers still referenced by some event-performance queries",
    "orders(id,event_id,total_amount,quantity,status,created_at) — source of truth for actual revenue (status IN ('paid','completed'))",
    "tickets(id,event_id,order_id,is_scanned,scanned_at) — source of truth for drop/scan counts",
    "event_views(event_id,...) — raw page-view log (used via COUNT)",
    "venues(id,ticketing_fee,facility_fee,tax_rate,venue_rebate,capacity) — fee/tax defaults",
    "artist_offers — deal terms + persisted P&L (gross_potential, adj_gross, net_potential, splitpoint, artist_backend, pot_walkout, total_expenses, tax_rate, tax_method, ticket_scaling, fixed_expenses, variable_expenses, guarantee, deal_type, backend_percentage)",
    "settlements — finalized actuals (total_gross, ticketing_fees, facility_fees, adj_gross, taxes, net_receipts, total_expenses, splitpoint, artist_backend, artist_total, venue_total_revenue, venue_net_profit, ancillary)",
    "ad_campaigns (legacy marketing module) — campaign-level spend/impressions/clicks by platform+event"
  ],
  "existing_calculations": [
    "offer.gross_potential   = Σ(sellable_cap × price)           [client: app/admin/offers/new/page.tsx L272, app/admin/offers/[id]/page.tsx L139]",
    "offer.adj_gross         = gross_potential − Σ((ticketing_fee+facility_fee) × sellable_cap)   [same files]",
    "offer.net_potential     = tax_method='divisor' → adj_gross/(1+tax_rate); 'multiplier' → adj_gross−(adj_gross×tax_rate)",
    "offer.total_expenses    = Σ fixed_expenses + Σ(variable_expense.rate × gross_potential)",
    "offer.splitpoint        = max(net_potential − total_expenses, 0)   (0 for FLAT)",
    "offer.artist_backend    = splitpoint × (backend_percentage/100)    (0 for FLAT)",
    "offer.artist_total (PAS) = FLAT→guarantee; VS→max(guarantee,backend); PLUS/BONUS→guarantee+backend",
    "offer.pot_walkout       = FLAT→net−expenses; else splitpoint−artist_total",
    "settlement.venue_net_profit = venue_total_revenue − (total_expenses + artist_total)   [lib/pdf/settlement-pdf.ts L375-388]",
    "event sell-through (actual) = Σ orders.quantity (paid/completed) / Σ ticket_tiers.capacity   [app/api/marketing/event-performance/route.ts]",
    "event revenue (actual)       = Σ orders.total_amount (paid/completed)"
  ],
  "existing_outputs": [
    "artist_offers row — persisted totals are the authoritative projection",
    "settlements row — persisted totals are the authoritative actuals",
    "/api/marketing/event-performance — per-event sold/capacity/revenue/drop/views aggregator",
    "/api/admin/reports/monthly-revenue — gross_revenue, total_expenses, net_profit per month",
    "/api/marketing/ad-spend — existing campaign list (spend/impressions/clicks)"
  ],
  "reusable_services": [
    "lib/supabase-server.ts::createAdminClient — service-role DB client (all modules must use this)",
    "modules/market-radar/jobs/* — reference pattern for scheduled jobs (Cron route → runXxxJob())",
    "app/api/cron/update-metrics/route.ts — reference Vercel cron handler (Bearer CRON_SECRET)",
    "/api/marketing/event-performance — per-event aggregate (Deal Lab will READ, not duplicate)",
    "/api/marketing/meta-sync — existing Meta API token plumbing (META_SYSTEM_TOKEN, META_AD_ACCOUNT_ID) — Ad Engine will re-use same env vars",
    "lib/types/{event,offer,settlement,ticket,order,venue}.ts — canonical TS types for DB shapes"
  ],
  "data_dependencies": [
    "artist_offers.*  — Deal Lab reads persisted financials; NEVER recomputes them",
    "settlements.*    — Deal Lab uses finalized data as ground truth when available",
    "ticket_tiers.capacity+price — Deal Lab scenario sell-through target base",
    "orders(paid|completed) — Ad Engine conversion/ROAS denominator",
    "tickets.is_scanned — not used (attendance, not spend)",
    "venues.ticketing_fee+facility_fee+tax_rate — only used as fallback metadata if offer row missing",
    "ad_campaigns (legacy) — Ad Engine writes NEW rows into ad_engine_* tables, does not modify legacy table"
  ],
  "risks": [
    "R-01 (HIGH): offer math lives in client-side useMemo (app/admin/offers/new/page.tsx L272-320 + [id]/page.tsx L133-177). There is no server-side pure function. Mitigation: core-data service READS persisted artist_offers columns; if any are null/0 we return {complete:false, missing:[...]} and refuse to simulate.",
    "R-02 (HIGH): settlements-migration references offers(id) while the actual table is artist_offers. Pre-existing bug — OUT OF SCOPE. Both new modules use artist_offers consistently.",
    "R-03 (MED): two parallel tier tables (ticket_tiers + ticket_types). Mitigation: core-data.getTicketPricing() reads ticket_tiers first, falls back to ticket_types (matches existing event-performance logic).",
    "R-04 (MED): Meta API token plumbing exists (meta-sync route) but Snapchat is not yet wired. Mitigation: Ad Engine abstracts both behind modules/ad-engine/integrations/{meta,snapchat}.ts; Snapchat ships as stub that returns MOCK results unless SNAP_AD_ACCESS_TOKEN present.",
    "R-05 (LOW): `events` table has no single canonical 'capacity' — sometimes events.capacity, sometimes Σ ticket_tiers.capacity. Mitigation: core-data returns both and prefers Σ ticket_tiers.capacity (matches event-performance contract).",
    "R-06 (HIGH): ticket_scaling (JSONB) drives offer gross. Deal Lab MUST NOT re-derive scenario gross from tier prices × capacity if the offer already persisted gross_potential — use the offer's gross. Otherwise numbers will diverge from PDFs.",
    "R-07 (MED): ad_campaigns legacy table has no hourly/daily insights granularity. Mitigation: new ad_engine_daily_metrics table aggregated by Meta/Snap cron; legacy table untouched.",
    "R-08 (STOP-CONDITION): any code path that re-implements gross/adj/net/splitpoint/backend math is a hard fail. All such math must flow through core-data's read path."
  ]
}
```

---

## 2. Decisions Locked In

1. **Single source of truth for financials = `artist_offers` row (projection) + `settlements` row (actuals).** Neither module recomputes.
2. **Core-data service is read-only** (`services/core-data.ts`). No writes, no fallbacks that fabricate numbers.
3. **Both modules live under `/modules/*`.** Admin UI routes mount under existing `app/admin/events/[id]/{ads,deal-lab}` (project uses `[id]` not `[eventId]` — the path is nested under the existing dynamic segment; the spec intent is preserved).
4. **Ad Engine tables are new and prefixed `ad_engine_*`** to avoid collision with the legacy `ad_campaigns` table (kept untouched).
5. **Deal Lab tables are new and prefixed `deal_lab_*`.** All outputs carry `simulated = true`.
6. **Cron jobs register as new Vercel cron routes** (`/api/cron/ad-engine-metrics`, `/api/cron/ad-engine-optimize`) secured by the existing `CRON_SECRET` pattern.

---

## 3. Safety Layer Summary (applied globally)

| Rule | Enforced at |
|------|-------------|
| Freshness gate (metrics_age > 12h → log-only) | `modules/ad-engine/services/optimizationEngine.ts` |
| Cooldowns (6–12h after launch; max 1 budget adj/24h) | `ad_engine_decision_log` unique window + engine check |
| Confidence scoring (high/med/low) | `evaluateDecision()` in optimization engine |
| Simulation labeling | `deal_lab_simulations.simulated = true` (DB default + type) |
| Hard budget walls (daily + campaign cap) | `ad_engine_budget_caps` + engine pre-flight check |
| Human override (freeze / disable-optimization / lock-budget) | `ad_engine_overrides` table |
| Fail-safe (rule conflict → no action) | `evaluateDecision()` returns `{allow:false, reason}` |

Build proceeds in Phase 2.

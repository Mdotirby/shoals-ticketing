# Ad Engine + Deal Lab — Hand-off

Two additive, isolated modules shipped without touching existing Offers / Pricing / Revenue logic.

## Deliverables

| # | Deliverable | Path |
|---|-------------|------|
| 1 | Phase-1 analysis report | [`plans/ad-engine-and-deal-lab-analysis.md`](./ad-engine-and-deal-lab-analysis.md:1) |
| 2 | Database migration (additive only) | [`plans/ad-engine-and-deal-lab-migration.sql`](./ad-engine-and-deal-lab-migration.sql:1) |
| 3 | Shared data access layer (single source of truth) | [`services/core-data.ts`](../services/core-data.ts:1) |
| 4 | Ad Engine module | [`modules/ad-engine/`](../modules/ad-engine:1) |
| 5 | Deal Lab module | [`modules/deal-lab/`](../modules/deal-lab:1) |
| 6 | Cron jobs (registered in `vercel.json`) | [`app/api/cron/ad-engine-metrics/route.ts`](../app/api/cron/ad-engine-metrics/route.ts:1), [`app/api/cron/ad-engine-optimize/route.ts`](../app/api/cron/ad-engine-optimize/route.ts:1) |
| 7 | API abstraction layer | [`app/api/ad-engine/`](../app/api/ad-engine:1), [`app/api/deal-lab/`](../app/api/deal-lab:1) |
| 8 | Admin UI | [`app/admin/events/[id]/ads/page.tsx`](../app/admin/events/[id]/ads/page.tsx:1), [`app/admin/events/[id]/deal-lab/page.tsx`](../app/admin/events/[id]/deal-lab/page.tsx:1) |

> Type-check status: **0 errors** in all new files (one pre-existing unrelated error in `__tests__/fwb/helpers.ts`).

---

## Module 1 — Ad Engine

### Files

```
modules/ad-engine/
  constants.ts                   — safety thresholds (metrics age, cooldowns, sample sizes)
  types.ts                       — all module types
  index.ts                       — public surface
  integrations/
    types.ts                     — PlatformAdapter contract
    meta.ts                      — Meta Marketing API adapter
    snapchat.ts                  — Snapchat Marketing API adapter (stub when unconfigured)
    index.ts
  services/
    assetService.ts              — ad_engine_assets CRUD
    creativeGenerator.ts         — DETERMINISTIC (asset × hook × copy), no AI, idempotent
    preLaunch.ts                 — ≥3 creatives, ≥1 video, ≥2 hooks + identity + cap gate
    campaignBuilder.ts           — validated build → platform adapter → persist
    performanceTracker.ts        — daily insights → ad_engine_daily_metrics (aggregated)
    safety.ts                    — overrides, freshness gate, cooldowns, confidence, hard walls
    optimizationEngine.ts        — cron entry point: efficiency + volume modes
```

### Cron schedule (`vercel.json`)

| Path | Schedule | Purpose |
|------|----------|---------|
| `/api/cron/ad-engine-metrics` | every 6h | pull insights into `ad_engine_daily_metrics` |
| `/api/cron/ad-engine-optimize` | every 6h, offset 30m | evaluate campaigns + execute within guardrails |

### Env vars

| Var | Required | Notes |
|-----|:--:|-------|
| `META_SYSTEM_TOKEN` | yes (for Meta) | reused from legacy marketing module |
| `META_AD_ACCOUNT_ID` | yes (for Meta) | reused |
| `SNAP_ACCESS_TOKEN` | optional | adapter stays in stub mode if absent |
| `SNAP_AD_ACCOUNT_ID` | optional | same |
| `CRON_SECRET` | yes | reused from existing cron pattern |

### API surface (UI-facing)

```
GET  /api/ad-engine/events/[eventId]/overview
GET  /api/ad-engine/events/[eventId]/assets
POST /api/ad-engine/events/[eventId]/assets
GET  /api/ad-engine/events/[eventId]/hooks
POST /api/ad-engine/events/[eventId]/hooks
GET  /api/ad-engine/events/[eventId]/copy
POST /api/ad-engine/events/[eventId]/copy
GET  /api/ad-engine/events/[eventId]/creatives
POST /api/ad-engine/events/[eventId]/creatives/generate
GET  /api/ad-engine/events/[eventId]/budget-cap
POST /api/ad-engine/events/[eventId]/budget-cap
GET  /api/ad-engine/events/[eventId]/overrides
POST /api/ad-engine/events/[eventId]/overrides
DELETE /api/ad-engine/events/[eventId]/overrides?id=...
POST /api/ad-engine/events/[eventId]/campaigns
POST /api/ad-engine/campaigns/[campaignId]/control   (pause | resume | update_budget)
```

### Safety pipeline (applies to every optimization action)

1. Human overrides (freeze / disable_optimization / lock_budget) → BLOCK
2. Metrics freshness (> 12h old) → LOG-ONLY
3. Launch cooldown (< 6h since launch) → LOG-ONLY
4. Budget-adjustment cooldown (1 per 24h) → LOG-ONLY
5. Confidence scoring (low → BLOCK · medium → LOG-ONLY · high → EXECUTE)
6. Budget hard walls (event-level daily + total caps) → BLOCK on breach
7. Scale step caps (`MAX_SCALE_UP_STEP_PCT`, `MAX_SCALE_DOWN_STEP_PCT`)
8. Fail-safe: any rule conflict → NO ACTION. Priority: data safety > optimization.

Every evaluation is written to `ad_engine_decision_log` with outcome = `executed | logged_only | blocked`.

### Pre-launch validation (hard gate)

- ≥ 3 creatives linked to the event
- ≥ 1 video creative
- ≥ 2 active hooks (event-scoped OR venue-scoped)
- Budget cap row set for the event
- Active identity for the chosen platform

Campaign builder refuses to launch unless **all** pass.

### Optimization modes

**Efficiency (ROAS):**
- Scale UP when `ROAS ≥ 2.0` and `CPC ≤ $1.50`
- Scale DOWN when `ROAS < 0.8`

**Volume (ticket velocity):**
- Scale UP when `CTR ≥ 1.2%` and `CPM ≤ $25`
- Scale DOWN when `CTR < 0.3%`

All thresholds live in [`modules/ad-engine/constants.ts`](../modules/ad-engine/constants.ts:1).

---

## Module 2 — Deal Lab

### Files

```
modules/deal-lab/
  constants.ts                   — scenario %, risk thresholds, talent-line regex
  types.ts                       — SimulationOutput, Recommendation, etc. (all `simulated: true`)
  index.ts                       — public surface
  services/
    scenarioEngine.ts            — scales core-data persisted totals by sell-through %
    dealStructures.ts            — guarantee, guarantee+backend, door_split, tiered_bonus + break-even solver
    riskScoring.ts               — break-even > 80%, high-guarantee, low-margin, talent-double-count
    recommendationEngine.ts      — weighted score: downside_safety + upside + artist_fit + risk
    simulationEngine.ts          — one-call orchestrator + optional persistence
```

### Scenarios

- `conservative = 0.50` sell-through
- `expected     = 0.70`
- `optimistic   = 0.90`

### Revenue / expense source

**Deal Lab does not compute revenue.** Every number comes from `services/core-data.ts` which reads the persisted `artist_offers` row. If that row is incomplete the simulation refuses to run and returns blockers — the UI surfaces them explicitly.

### Risk flags

| Flag | Trigger |
|------|--------|
| `break_even_gt_80` | break-even ≥ 80% of venue capacity |
| `high_guarantee` | guarantee > 65% of optimistic-scenario net |
| `low_margin` | promoter profit < 10% of projected net |
| `incomplete_inputs` | core financials incomplete (fallbacks used) |
| `talent_double_count_risk` | existing offer already contains a Talent/Artist/Guarantee line AND the simulated deal adds another guarantee |

### API surface

```
POST /api/deal-lab/events/[eventId]/simulate
     body: { structures: [{structure,inputs}], scenarios?, persist?, label? }
     resp: { banner:"SIMULATED_ONLY", simulated:true, bundle, recommendation }
GET  /api/deal-lab/events/[eventId]/sessions
```

Every response includes `simulated: true` and a `banner: "SIMULATED_ONLY"` field — the UI displays the banner prominently.

---

## Shared Safety Layer — Summary

| Guardrail | Location | Enforcement |
|-----------|----------|-------------|
| Single source of truth | [`services/core-data.ts`](../services/core-data.ts:1) | Only reads persisted offer/settlement values. No formulas. |
| Data freshness gate | [`modules/ad-engine/services/optimizationEngine.ts`](../modules/ad-engine/services/optimizationEngine.ts:149) | `metrics_age > 12h` → log-only |
| Decision cooldowns | `optimizationEngine.ts` | launch 6h / budget-adj 24h |
| Confidence scoring | [`modules/ad-engine/services/safety.ts`](../modules/ad-engine/services/safety.ts:78) | high=execute, medium=log, low=block |
| Simulation separation | [`modules/deal-lab/types.ts`](../modules/deal-lab/types.ts:1) + DB `simulated boolean NOT NULL DEFAULT true` | permanent label on every output |
| Budget hard walls | [`modules/ad-engine/services/safety.ts`](../modules/ad-engine/services/safety.ts:104) | event cap + campaign cap, never overridable by optimizer |
| Human overrides | `ad_engine_overrides` table | freeze / disable_optimization / lock_budget — blocks engine |
| Fail-safe | every decision path | rule conflict → NO ACTION |

---

## Data dependencies (read-only)

Ad Engine reads:
- `events`, `venues` (via `core-data.getEventMeta`)
- its own tables (never touches `ad_campaigns` legacy table)

Deal Lab reads:
- `artist_offers` (via `core-data`, never directly)
- `settlements` (actuals, via `core-data`)
- `ticket_tiers` → fallback `ticket_types` → fallback `events.price` (via `core-data.getTicketPricing`)
- `orders` (actuals when no finalized settlement)

Neither module writes to any pre-existing table.

---

## Deploy checklist

1. **Apply migration** in Supabase SQL editor: [`plans/ad-engine-and-deal-lab-migration.sql`](./ad-engine-and-deal-lab-migration.sql:1)
2. **Set env vars** in Vercel:
   - existing: `META_SYSTEM_TOKEN`, `META_AD_ACCOUNT_ID`, `CRON_SECRET`
   - optional: `SNAP_ACCESS_TOKEN`, `SNAP_AD_ACCOUNT_ID`
3. **Redeploy** — `vercel.json` now registers the two new cron paths automatically.
4. **Seed identities** — insert one row per venue + platform into `ad_engine_identities` (required for campaign launch pre-launch gate).
5. **Set budget caps** per event via the UI (`/admin/events/[id]/ads`) before any campaign is launched. The builder hard-fails without a cap row.

---

## Fail-condition audit (spec compliance)

| Rule | Verified |
|------|:--:|
| Do not modify existing Offers Engine logic | ✓ — zero edits to `app/admin/offers/**`, `app/api/offers/**`, `app/api/settlements/**` |
| Do not duplicate pricing / cost / revenue calculations | ✓ — every financial number flows from persisted `artist_offers` / `settlements` |
| All new modules live in `/modules/ad-engine` and `/modules/deal-lab` | ✓ |
| All integrations to existing systems are read-only | ✓ — core-data never writes |
| Deal Lab is simulation-only | ✓ — `simulated: true` on DB column default + every API response |
| Ad Engine is reactionary only | ✓ — no proactive mutation of orders/tickets/events |
| Budget hard walls never overridable by optimizer | ✓ — `checkBudgetWalls()` returns `{ok:false}` before adapter call |
| `simulated=true` cannot be used as factual revenue | ✓ — recommendation response includes `banner: "SIMULATED_ONLY"` |

---

## Future hardening (not in MVP)

- Promote client-side offer P&L math into a shared pure function — would eliminate the "incomplete offer row" blocker by computing on-read.
- Proper file upload pipeline for `ad_engine_assets` (currently URL-paste in MVP UI).
- Per-creative A/B rotation logic via `ad_engine_creative_metrics`.
- UI for identity management (currently DB-seeded).
- Explicit `/api/deal-lab/sessions/[id]` read route and a saved-sessions list view.

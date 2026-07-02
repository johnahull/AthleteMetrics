# Design: Additional Individual-Report Charts (+ Tier-Progress in Coach Analytics)

- **Date:** 2026-06-28
- **Status:** Approved (design phase) — pending user review of this doc
- **Author:** John Hull (with Claude Code)
- **Builds on:** `2026-06-26-report-time-range-trends-design.md` (the trend feature this extends)

## Problem

The individual report currently shows per-metric **trend lines** plus a **performance
table** (best value, percentile, team average, benchmark tier). We want richer,
more intuitive visuals for the athlete/parent audience, reusing what Coach
Analytics already solved where possible, and adding genuinely new value where it
doesn't.

## Scope

**In scope (this increment):**
- **A — Radar (all-around percentile profile)** on the individual report. Reuses the
  existing `RadarChart`.
- **B — Tier-progress / distance-to-next-tier chart**, a *new* component, shown on
  the individual report **and** wired into Coach Analytics' single-athlete view.
- **C — Personal-best & benchmark-crossing markers** added to the existing
  `BenchmarkTrendChart`.
- **Shared tier-comparison service** — extract the tier logic out of
  `report-service` so both reports and a new analytics endpoint compute tiers
  identically (the keystone for later dashboard reuse).

**Out of scope (designed-for, deferred):**
- **D — "You are here" peer-distribution chart** (needs a peer-distribution query;
  follow-up increment).
- Wiring these into the athlete/parent **dashboards** and **coach dashboard**. The
  architecture below keeps that cheap later (pure components + shared service +
  shared data contract), but it is not built now.
- Team-report trends (separate deferred increment).

## Key Decisions (from brainstorming)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Which charts | A radar, B tier-progress, C PB markers | User selected all; D deferred for backend cost |
| Sequencing | A+B+C now, D next | A/B/C are data-ready; D needs peer-distribution backend |
| Reuse vs new | Reuse RadarChart (A) + LineChart PB logic (C); new component for B | Coach Analytics already has radar + PB markers; tier-progress is novel |
| Analytics wiring | Put **B (tier-progress)** into Coach Analytics too | It's the only net-new chart; A & C already exist there |
| Tier logic location | **Shared API service**, not buried in report-service | Single source of truth; reports + analytics + (future) dashboards all consume it |

## Comparison to Coach Analytics (what already exists)

| Candidate | In Coach Analytics today | This increment |
|-----------|--------------------------|----------------|
| A Radar percentile profile | ✅ `RadarChart` (individual, 3+ metrics) | Reuse it in the report |
| B Tier progress / distance-to-next | ❌ none | Build new component; add to report **and** analytics |
| C PB / milestone markers | ◐ `LineChart` PB logic | Port into `BenchmarkTrendChart` |
| D You-are-here distribution | ✅ `BoxPlotChart` + `highlightAthlete` | Deferred (needs peer data in payload) |

## Architecture

### Shared tier-comparison service (keystone)

Today `report-service.ts` privately computes tier comparisons via
`evaluateTierBenchmark()` / `getBenchmarkComparisons()`, returning the
`BenchmarkComparison` shape (with `tierName`, `tierColor`, `tierOrder`,
`distanceToNextTier`, `nextTierName`, `isBestTier`, `allTiers`).

- **Extract** the tier-evaluation logic into a shared module
  `packages/api/services/benchmark-tiers.ts` exporting a pure(ish)
  `evaluateTierBenchmark(...)` and the `BenchmarkComparison` type (moved to
  `packages/shared` so frontend + both services share one definition).
- `report-service.getBenchmarkComparisons()` is refactored to call the shared
  module (behavior unchanged — verified by existing report tests).
- A new analytics path (below) calls the same module, so tiers are computed
  identically everywhere.

This is the only backend change in this increment, and it's required by B-in-analytics regardless.

### A — Radar on the individual report

- `RadarChart` accepts `MultiMetricData[]` with `percentileRanks: Record<metric, number>`.
  The report already has `athlete.percentiles` (0–100). Build one `MultiMetricData`
  from the athlete and pass it; `RadarChart` uses precomputed `percentileRanks`
  directly (no recompute).
- Render in `TrendSection` (or a sibling section) **only when ≥3 metrics** have a
  percentile (radar needs ≥3 axes; fewer → skip with no error).
- Carries `data-chart-metric="__radar"` (or similar) so it's captured into the PDF.

### B — Tier-progress chart (`TierProgressChart`, new)

- **Component** `packages/web/src/components/charts/TierProgressChart.tsx`. Input: a
  metric label + a `BenchmarkComparison` carrying `allTiers` + the athlete value +
  `distanceToNextTier`/`nextTierName`. Renders a horizontal tiered bar (one segment
  per tier, colored), a "you are here" marker at the athlete's position, and a
  caption ("0.12 s to Elite" / "Elite ✓"). Pure/presentational.
- **Report**: render one per metric that has tier data, in a new "Benchmark
  standing" section of `IndividualReportView` (and the public page), captured for PDF.
- **Coach Analytics**:
  - Add chart type `'tier_progress'` to the `ChartType` union
    (`packages/shared/analytics-types.ts`) + lazy import + switch case in
    `ChartContainer.tsx` + entry in `getRecommendedChartType()` / selection matrix
    (offered for individual single-metric analysis).
  - **New analytics data**: extend the analytics pipeline to provide tier data for
    the selected athlete+metric. Approach: a focused endpoint
    `GET /api/analytics/benchmark-tiers` (athleteId, metric, org) that calls the
    shared tier service and returns `BenchmarkComparison`. `BaseAnalyticsView`
    fetches it when `tier_progress` is selected and feeds `TierProgressChart`.

### C — PB & benchmark-crossing markers on the trend

- Extract metric-aware best-point detection from `LineChart` (lines ~245–292) into a
  reusable `trend-utils` helper `personalBestIndex(series, direction)`.
- In `BenchmarkTrendChart`, add point styling/annotations: star the PB point(s) and
  flag the first point that crosses into a better benchmark tier (derived from the
  series + the `BenchmarkOverlay` tier bands). Keep it presentational; uses data
  already in `trends`.

## Data contract

- Move `BenchmarkComparison` to `packages/shared/report-trends-types.ts` (or a new
  `packages/shared/benchmark-types.ts`) so report-service, the shared tier service,
  the analytics endpoint, and all frontend consumers use one definition.
- `RadarChart` continues to consume `MultiMetricData` (existing shared type).

## Edge cases

- **< 3 metrics** → no radar (skip section).
- **Metric with no tier benchmark** → no tier-progress bar for that metric (threshold-only or none).
- **Single measurement** → trend already handled (no line); PB marker simply marks that point.
- **Analytics athlete/metric with no benchmark** → tier_progress unavailable; fall back to recommended chart.
- **PDF** → radar + tier-progress carry capture hooks so they embed like the trend charts.

## Testing (TDD)

**Unit:**
- Shared `evaluateTierBenchmark`: tier match, `distanceToNextTier` for higher- and
  lower-is-better, `isBestTier`, `allTiers` ordering (port/extend existing coverage).
- `trend-utils.personalBestIndex`: picks min for lower-is-better, max for higher; ties.
- Tier-progress geometry helper (athlete marker position within tiers; "to next" text).
- Radar data adapter (athlete.percentiles → MultiMetricData).

**Integration:**
- `report-service.getBenchmarkComparisons()` unchanged after extraction (existing
  report tests stay green).
- New `GET /api/analytics/benchmark-tiers` returns correct `BenchmarkComparison` for
  a seeded athlete/metric; 404/empty when no benchmark.

**E2E:**
- Individual report with ≥3 metrics shows radar; shows tier-progress bars; trend shows
  PB markers. Public link + PDF include them (screenshots desktop + mobile).
- Coach Analytics: selecting an athlete + metric offers/render tier-progress.

**UI screenshots** per project convention.

## Success criteria

1. Individual report renders radar (≥3 metrics), tier-progress bars, and PB/crossing
   markers on trends — in interactive view, public link, and PDF.
2. Coach Analytics offers a tier-progress chart for a single athlete+metric, using the
   shared tier service.
3. Tier logic has one shared implementation; existing report behavior unchanged.
4. All new logic covered by unit + integration + E2E tests.

## Future direction (not built here)

Once the shared tier service + pure chart components exist, the athlete/parent
dashboards and coach dashboard can consume the same service and components as thin
"glanceable" compositions (radar snapshot, latest trend, tier progress; team
rollups with per-athlete drill-in). The common `BenchmarkComparison`/`MetricTrend`
contract in `packages/shared` is what keeps that cheap. D (peer distribution) is the
next data addition and also belongs in the shared service.

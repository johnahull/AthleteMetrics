# Design: Time-Range "Progress" View for Individual Reports

- **Date:** 2026-06-26
- **Status:** Approved (design phase) — ready for implementation planning
- **Author:** John Hull (with Claude Code)

## Problem

Coaches want to send athletes and parents a report that shows **performance over a
time range** (a graph of progress), while still **comparing against benchmarks** —
delivered the same way today's reports are: as a **web page and a PDF**.

Coach Analytics already shows trends interactively, but it cannot be shared or
exported. Reports own the distribution pipeline (snapshots, public links, PDF), so
the time-range/trend view belongs **inside Reports**, not Analytics.

## Audience & Use Case

- **Primary:** athlete / parent self-view — "am I improving, and where do I stand
  against the benchmark?" Motivational, shareable.
- **Secondary (future):** program-wide / team evaluation.
- **Explicitly not** the driver: coach progress tracking (already covered by Coach
  Analytics) and recruiting/external polish.

## Scope

**In scope (this build):**
- Individual reports only.
- A per-report toggle that adds a trend layout: narrative summary → at-a-glance
  progress cards → one benchmark-zone chart per selected metric.
- Renders in the interactive report, the public shared page, and the PDF export.

**Out of scope (designed for, not built):**
- Team / program-wide aggregate trends (avg/median line over time). The data
  contract is kept general so this slots in later without rework.
- Time-bucketing/aggregation (week/month). First build plots **every measurement**
  (raw) in the window.
- Percentile-over-time. Percentile stays a current-standing number on the summary
  cards, not a trend line.

## Key Decisions (from brainstorming)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Report context | Both eventually; **individual first** | Simplest anchor; team contract kept general |
| Granularity | **Every measurement (raw)** | Truest picture; matches existing Analytics charts; least new logic |
| Enablement | **Toggle on existing individual report** | Reuses reports list, sharing, PDF; fewest new concepts |
| Visualization | **Progress cards (header) + shaded benchmark-zone trend charts (detail)** | Cards = at-a-glance "is my kid improving"; zones = intuitive "climb into the green" |
| PDF charts | **Client captures chart → embed in jsPDF** | Reuses existing `html2canvas`/`Chart.js`/`jsPDF`; no new deps; no Railway build risk |

## Visualization Direction

Approved layout (mocked during brainstorming):

1. **Branded header** — org logo, athlete name, "Season Progress Report," date
   range, and which benchmark set the report compares against.
2. **Plain-language narrative box** — one sentence summarizing the story for parents
   who won't read charts.
3. **At-a-glance progress cards** (one per metric) — current value, sparkline,
   headline improvement (e.g. ▲ +42%), and current tier badge.
4. **Detail benchmark-zone charts** (one per metric) — athlete's raw measurements
   as a line over the window, with benchmark **tiers as shaded background zones**.
5. **Benchmark legend** at the foot.

**Metric direction handling:** For lower-is-better metrics (e.g. 40-yd dash,
agility), the y-axis is **flipped so "up" always means improvement**, keeping the
visual story consistent across every metric. This is presentation-only; stored data
is unchanged. Direction comes from the existing `+`/`-` "best performance" logic in
`report-service.ts`.

## Architecture

### Data contract (backend — `packages/api/services/report-service.ts`)

`generateIndividualReport()` (≈ line 331) already fetches in-window measurements via
`getFilteredMeasurements()` (≈ line 1137) over the window from `calculateDateRange()`
(≈ line 1092), then collapses each metric to its best value. We **add** a `trends`
field to `IndividualReportData`, populated **only when the toggle is on**:

```ts
trends?: Record<MetricCode, {
  series: { date: string; value: number }[];   // every measurement, ascending by date
  direction: 'higher' | 'lower';               // higher-is-better vs lower-is-better
  delta: { from: number; to: number; pct: number };
  benchmark: BenchmarkOverlay;                  // see Benchmark Overlay Rules
}>
```

```ts
type BenchmarkOverlay =
  | { kind: 'tiers'; tiers: { name: string; min: number | null; max: number | null; color: string }[] }
  | { kind: 'thresholds'; lines: { name: string; value: number; color: string }[] }
  | { kind: 'none' };
```

The existing `measurements` / `percentiles` / `benchmarkComparisons` fields are
**unchanged** — they feed the summary cards (current standing). Trends are
**additive**, not a rewrite. This keeps existing reports byte-for-byte identical.

### Report config

Add a `showTrends: boolean` flag to the individual report config (the report's
stored `config` JSON; surfaced in `ReportWizard`). Default `false`.

### Frontend rendering

- **New component `BenchmarkTrendChart.tsx`** (`packages/web/src/components/charts/`).
  Builds on the existing `LineChart.tsx` (which already draws an athlete line plus
  dashed `benchmarks` lines) and adds:
  - **Shaded tier zones** as a chart background (Chart.js background-band plugin or
    filled range datasets).
  - **Per-metric axis flip** for lower-is-better metrics.
- **`IndividualReportView.tsx`** gains a `<TrendSection>` (cards + charts) rendered
  only when `data.trends` is present.
- **`public-report.tsx`** renders from the same snapshot JSON through the same
  components, so the shared public link gets charts with no extra work.

### PDF & sharing path

- **Web view + public link:** charts render natively (no work beyond the component).
- **Snapshots** store report **JSON data** (not pre-rendered HTML); the public page
  re-renders React from that JSON — confirmed by current pipeline.
- **PDF:** "Download PDF" captures each rendered chart via `Chart.js
  toBase64Image()` (fallback `html2canvas`, already wired in `lib/chartExport.ts`).
  The PDF endpoints — `GET /api/reports/:id/pdf` and public
  `GET /api/public/reports/:token/pdf` in `packages/api/routes/report-routes.ts`
  (≈ lines 1313 / 1390) — are adjusted to **accept chart PNGs in the request** and
  embed them in `generatePDF()` (≈ line 3532) via the existing `jsPDF.addImage()`
  pattern. The public download button captures from the already-rendered public page
  before calling the endpoint. (Endpoints that currently take no body will accept the
  images, e.g. via POST or query-attached payload — exact transport decided in the
  implementation plan.)

## Benchmark Overlay Rules

Per metric, given the benchmarks configured on the report:
- **Tiered benchmark present** → render shaded zones (`kind: 'tiers'`).
- **Single-value benchmark(s) only** → render dashed threshold line(s)
  (`kind: 'thresholds'`) — already supported by `LineChart`.
- **Both / multiple sets** → prefer the **tiered** set as zones; otherwise stack the
  dashed lines.
- **No benchmark** for the metric → `kind: 'none'`, line only.

## Edge Cases

- **< 2 measurements** in the window for a metric → no trend line; show the summary
  card only, with a small "not enough data to chart" note.
- **Lower-is-better metrics** → axis flipped (above).
- **Toggle off** → no `trends` in payload; report identical to today.
- **Empty window** (no measurements at all) → existing empty-report behavior.

## Testing (TDD — mandatory per project policy)

**Unit** (`packages/*/src/**/*.test.ts`):
- `report-service` trend assembly: series ascending order; `delta`/`pct` math;
  `direction` resolution; benchmark-overlay selection (tiered vs single vs both vs
  none); `< 2`-point case yields no series.
- Chart util: axis-flip selection by direction; tier-zone min/max → background-band
  mapping.

**Integration** (`tests/integration/`):
- `POST /api/reports/:id/generate` returns `trends` **only** when `showTrends` is on,
  and never alters the existing single-value fields when off.
- PDF endpoint accepts chart images and produces a non-empty PDF containing them.

**E2E** (`tests/e2e/`):
- Toggle on → trend section (cards + charts) renders in the report.
- Public shared link renders the charts.
- "Download PDF" produces a non-empty file.

**UI screenshot verification** (per project convention): capture the trend report at
desktop (1280×720) and mobile (375×667) into `screenshots/`.

## Reusable Building Blocks (already in the codebase)

| Need | Existing asset |
|------|----------------|
| Athlete line + dashed benchmark lines | `components/charts/LineChart.tsx` |
| In-window measurement fetch + date range | `report-service.ts` `getFilteredMeasurements()`, `calculateDateRange()` |
| Metric direction (+/-) | best-performance logic in `report-service.ts` |
| Chart → PNG | `lib/chartExport.ts` (`html2canvas`) + `Chart.js toBase64Image()` |
| PDF assembly | `report-routes.ts` `generatePDF()` (`jsPDF` + `jspdf-autotable`) |
| Share / public render | snapshot JSON + `public-report.tsx` (same React components) |

No new dependencies required (Chart.js 4.5, react-chartjs-2 5.3, html2canvas 1.4,
jsPDF 4.2 already installed).

## Success Criteria

1. Toggling "Show progress over time" on an individual report produces the approved
   layout (narrative → cards → benchmark-zone charts) in the interactive view.
2. The same report, shared via public link, renders the charts.
3. The PDF export contains the trend charts (not blank/placeholder) for both the
   authenticated and public download paths.
4. Lower-is-better metrics display with "up = improvement."
5. Reports with the toggle **off** are unchanged from current behavior.
6. All new logic covered by unit + integration + E2E tests (TDD).

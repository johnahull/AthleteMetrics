# Design: Report Chart Selection + "You Are Here" Distribution (+ userDefined cleanup)

- **Date:** 2026-06-30
- **Status:** Approved (design phase) — pending user review of this doc
- **Author:** John Hull (with Claude Code)
- **Builds on:** `2026-06-26-report-time-range-trends-design.md`, `2026-06-28-individual-report-charts-design.md` (both merged)

## Problem

The individual report now has several visual charts (radar, benchmark standing,
trend lines), but the report creator has no control over which appear — only a
single "Show progress over time" toggle. We want the creator to choose which
charts to include. We also want the deferred **"you are here" distribution**
chart (peer spread with the athlete marked), and to clean up a dead config path.

## Scope

**In scope (this increment, individual reports only):**
- **Chart selection** in the report wizard: per-chart on/off toggles for Radar,
  Benchmark standing, Trends, and Distribution, replacing the lone `showTrends`
  checkbox. Default all-on for new reports.
- **"You are here" distribution** chart (box + dots, athlete highlighted),
  rendered in the live report, public page, and PDF.
- **Cleanup:** remove the dead `userDefined` benchmark path from the individual
  report config.

**Out of scope (deferred / unchanged):**
- Team reports (their sections are untouched; chart selection is individual-only).
- Demographic-cohort or team-only peer sets for the distribution (org-wide only).
- Per-chart styling options beyond the chosen distribution style.

## Key Decisions (from brainstorming)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Selectable charts | **All four visual charts** individually toggleable | Unified, consistent control; replaces the lone showTrends toggle |
| New-report default | **All charts ON (opt-out)** | "Show everything, trim down"; each chart self-hides without data |
| Existing reports | **Back-compat: absent config → today's behavior** | No data migration; saved reports look unchanged |
| Distribution peer set | **Same org-wide set as the percentile** | The distribution visually matches the stated percentile |
| Distribution style | **Box + dots combo** (`box_swarm_combo`) | Reuses the analytics component; crowd + stats; legible to parents and coaches |
| userDefined path | **Remove** from individual config | Dead (nothing writes `reportBenchmarks`); site/custom benchmarks already cover single-value targets |
| Report scope | **Individual only** | All four charts are individual-athlete visuals |

## Architecture

### 1. Chart selection model + resolver

Add a `charts` object to the individual report config:
```ts
charts?: {
  radar?: boolean;
  benchmarkStanding?: boolean;
  trends?: boolean;
  distribution?: boolean;
};
```
The legacy `showTrends?: boolean` stays in the type for reading old reports but the
wizard no longer writes it (it writes `charts`).

**Resolver** (pure, unit-tested) — the single source of truth for "is chart X on?":
```ts
function resolveChartSelection(config): {
  radar: boolean; benchmarkStanding: boolean; trends: boolean; distribution: boolean;
}
```
- If `config.charts` is present → use its booleans (missing keys default `false`).
- If `config.charts` is absent (legacy report) → back-compat defaults:
  `radar: true`, `benchmarkStanding: true`, `trends: config.showTrends ?? false`,
  `distribution: false`.

Lives in `packages/shared` (or a shared util) so backend + frontend resolve
identically. Both `IndividualReportView` and `public-report` call it.

**Render rule:** each section renders only when `resolveChartSelection(...)[chart]`
is true **AND** the chart's data is present (radar: ≥3 percentiles;
benchmarkStanding: any benchmark comparisons; trends: present `trends` payload;
distribution: present `distributions` payload). Sections remain self-guarding, so
a toggle never yields a broken/empty chart.

### 2. Distribution data (backend)

In `report-service.generateIndividualReport`, when `resolveChartSelection(config).distribution`
is true, add a `distributions` field to `IndividualReportData`:
```ts
distributions?: Record<string /*metricCode*/, {
  values: number[];          // peer best-performances (sampled for display; see below)
  athleteValue: number;      // this athlete's best for the metric
  stats: { min: number; q1: number; median: number; q3: number; max: number }; // from the FULL set
}>;
```
- **Peer set:** the same org-wide peer best-performances already gathered by
  `calculatePercentilesAndAverages` (which computes the report's percentiles). Capture
  those values per metric rather than issuing a new query where possible; if the
  existing helper discards them, extend it to return them (kept internal).
- **Stats** (`min/q1/median/q3/max`) are computed from the **full** peer set.
- **Sampling:** `values` for display is capped at `MAX_DISTRIBUTION_POINTS` (≈150).
  When the peer count exceeds the cap, sample evenly (deterministic) down to the
  cap; always include the athlete's own value position context via `athleteValue`.
  The box/stats are unaffected (computed from the full set).
- The field is **only** populated when the distribution chart is enabled (additive,
  like `trends`).

### 3. Distribution chart (frontend)

- **New** `packages/web/src/components/reports/DistributionSection.tsx`: renders one
  box-and-dots chart per metric from `distributions`, reusing the existing
  `box_swarm_combo` rendering (`BoxPlotChart` with `rawData` = peer values +
  `highlightAthlete`/marker for `athleteValue`, `statistics` from `stats`). Includes
  a plain-language caption ("Each dot is an athlete in your group; you're the blue
  one — farther right is better*" with the metric's direction) and a
  `data-report-chart="dist:${metricCode}"` + `data-report-chart-title` capture hook
  so it flows into the public page and PDF like the other report charts.
- Rendered in `IndividualReportView` and `public-report` (from top-level
  `snapshotData.distributions`), gated by the resolver + presence of `distributions`.

### 4. Wizard chart-selection step

In `ReportWizard`, for individual reports, replace the single `showTrends` checkbox
with a **chart-selection** group: four labeled, described checkboxes (Radar,
Benchmark standing, Trends, Distribution), defaulting all `true`. The submitted
`config.charts` carries the four booleans. Remove the `showTrends` form field and
the `userDefined` benchmark inputs (see §5). Mirror the existing checkbox pattern.

### 5. userDefined cleanup

Remove `userDefined` from the individual report path:
- `IndividualReportConfig` (`report-types.ts`), backend `ReportConfig`
  (`report-service.ts`), and the `insertReportSchema`/`updateReportSchema` config
  zod (`schema-original.ts`) — drop the `userDefined` array from the individual
  config shape. (If the same `benchmarks` shape is shared with team config, keep it
  where team still uses it; only remove from the individual path. Confirm at
  implementation time whether team uses `userDefined` — team's `getBenchmarksForReport`
  DOES read `config.benchmarks.userDefined`, so if the shape is shared, leave the
  type but remove it from the individual wizard + document it as team-only.)
- Remove any `userDefined` inputs from the wizard's individual flow.
- `getBenchmarkComparisons` already reads userDefined from the `reportBenchmarks`
  table (empty), so removing the inert config input changes no runtime behavior for
  individual reports.

## Data contract changes

- `IndividualReportConfig` / `ReportConfig`: add `charts?`, keep `showTrends?` (legacy
  read-only), remove individual `benchmarks.userDefined` (or document team-only).
- `IndividualReportData`: add `distributions?` (additive, only when enabled).
- `insertReportSchema`/`updateReportSchema`: add `charts` object; remove/keep
  `userDefined` per the team-shared determination above.

## Edge cases

- **Legacy report (no `charts`)** → resolver back-compat; appearance unchanged.
- **Distribution enabled but metric has no peers / only the athlete** → omit that
  metric's distribution (need ≥2 peers for a meaningful box); section hides if none.
- **Large org (hundreds of peers)** → dots sampled to the cap; stats from full set.
- **Chart toggled on but data absent** (e.g. radar with 2 metrics) → section hides.
- **All charts toggled off** → report shows the Performance Summary table only (valid).
- **PDF** → distribution carries a capture hook; charts already flow ~2/page.

## Testing (TDD)

**Unit:**
- `resolveChartSelection`: new-config booleans; missing keys → false; legacy absent
  config → back-compat defaults (incl. `showTrends` mapping).
- Distribution stats helper: `min/q1/median/q3/max` correctness; even sampling caps
  to `MAX_DISTRIBUTION_POINTS` and is deterministic; `<2` peers → omitted.

**Integration:**
- `generateIndividualReport` returns `distributions` only when the distribution chart
  is enabled; values/stats correct against seeded peers; sampling applied past the cap.
- Back-compat: a report with no `charts` (and/or legacy `showTrends`) generates the
  same payload shape as today; existing report tests stay green.
- Removing `userDefined` from individual config doesn't break generation.

**E2E:**
- Wizard: toggling each chart on/off controls whether its section appears in the
  generated report. Distribution renders (box + dots + athlete marker) on the live
  report and the public link; PDF download is non-empty and includes it.
- Screenshots (desktop 1280×720, mobile 375×667) → `screenshots/`.

## Success criteria

1. Report creator can toggle Radar / Benchmark standing / Trends / Distribution per
   individual report; defaults all-on for new reports.
2. Each chart appears only when enabled AND its data exists; toggles never produce
   empty/broken sections.
3. The distribution chart shows the org-wide peer spread (box + dots) with the
   athlete marked, consistent with the stated percentile — in live view, public link,
   and PDF.
4. Existing saved reports render exactly as before (no migration).
5. The dead `userDefined` individual path is removed with no behavior change.
6. All new logic covered by unit + integration + E2E tests.

## Future direction (not built here)

Team-report chart selection; demographic-cohort or team-only peer sets for the
distribution (would also move the percentile to that cohort for consistency).

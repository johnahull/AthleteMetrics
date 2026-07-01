# Report Chart Selection + "You Are Here" Distribution — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Let the creator toggle which charts an individual report includes (radar / benchmark-standing / trends / distribution), add a "you are here" org-wide distribution chart (box + dots, athlete marked), and remove the dead individual `userDefined` config field.

**Architecture:** A pure `resolveChartSelection(config)` (shared) decides which sections render, with no-migration back-compat for legacy reports. The backend adds an additive `distributions` payload (reusing the org-wide peer best-values the percentile already queries) only when that chart is enabled. A `DistributionSection` renders box+dots via the existing `box_swarm_combo` path. Each section stays gated on (toggle ON AND data present).

**Tech Stack:** TypeScript, Drizzle/Postgres, Express, React 18, react-chartjs-2/Chart.js, simple-statistics, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-06-30-report-distribution-and-chart-selection-design.md`

**Branch:** `feature/report-distribution-and-chart-selection` (off develop).

**Test commands:** unit `npx vitest run --config vitest.unit.config.ts <path>` (only `__tests__/` dirs are collected — put unit tests there); integration `npx dotenv -e .env.local -- npx vitest run --config vitest.integration.config.ts <path>`; E2E `npx dotenv -e .env.local -- npx playwright test <path> --config=playwright.config.ts`; typecheck `npm run check`. Stage only named files (never `git add -A`).

---

## File Structure

**Create:**
- `packages/shared/report-charts.ts` — `ChartSelection` type + pure `resolveChartSelection()`.
- `packages/shared/__tests__/report-charts.test.ts` — unit tests.
- `packages/api/services/report-distributions.ts` — pure `computeDistribution()` (stats + sampling).
- `packages/api/services/__tests__/report-distributions.test.ts` — unit tests.
- `packages/web/src/components/reports/DistributionSection.tsx` — box+dots report chart.
- `tests/integration/report-chart-selection.test.ts` — generate-payload integration tests.
- `tests/e2e/report-chart-selection.spec.ts` — E2E + screenshots.

**Modify:**
- `packages/shared/report-trends-types.ts` (or a new shared types file) — add `MetricDistribution` type.
- `packages/api/services/report-service.ts` — `ReportConfig.charts`; `IndividualReportData.distributions`; `calculateDistributions()`; wire into `generateIndividualReport`.
- `packages/web/src/types/report-types.ts` — `IndividualReportConfig.charts`; `IndividualReportData.distributions`; remove individual `benchmarks.userDefined`.
- `packages/shared/schema-original.ts` — add `charts` to report config zod.
- `packages/web/src/components/reports/ReportWizard.tsx` — chart-selection step (replace `showTrends` checkbox).
- `packages/web/src/components/reports/IndividualReportView.tsx` — gate sections via resolver; render `DistributionSection`.
- `packages/web/src/pages/public-report.tsx` — same.

---

## Task 1: `resolveChartSelection` (shared resolver)

**Files:** Create `packages/shared/report-charts.ts`, `packages/shared/__tests__/report-charts.test.ts`.

- [ ] **Step 1: Write the failing test**

```typescript
// packages/shared/__tests__/report-charts.test.ts
import { describe, it, expect } from 'vitest';
import { resolveChartSelection } from '../report-charts';

describe('resolveChartSelection', () => {
  it('uses explicit charts config when present (missing keys -> false)', () => {
    expect(resolveChartSelection({ charts: { radar: true, distribution: true } })).toEqual({
      radar: true, benchmarkStanding: false, trends: false, distribution: true,
    });
  });

  it('back-compat: absent charts -> radar+benchmark on, trends from showTrends, distribution off', () => {
    expect(resolveChartSelection({ showTrends: true })).toEqual({
      radar: true, benchmarkStanding: true, trends: true, distribution: false,
    });
    expect(resolveChartSelection({})).toEqual({
      radar: true, benchmarkStanding: true, trends: false, distribution: false,
    });
  });

  it('explicit charts overrides legacy showTrends', () => {
    expect(resolveChartSelection({ showTrends: true, charts: { trends: false } }).trends).toBe(false);
  });
});
```

- [ ] **Step 2: Run it — confirm RED**

Run: `npx vitest run --config vitest.unit.config.ts packages/shared/__tests__/report-charts.test.ts`
Expected: FAIL ("Cannot find module '../report-charts'").

- [ ] **Step 3: Implement**

```typescript
// packages/shared/report-charts.ts

export interface ChartSelection {
  radar: boolean;
  benchmarkStanding: boolean;
  trends: boolean;
  distribution: boolean;
}

/** Config subset this resolver reads. */
interface ChartConfigInput {
  charts?: Partial<ChartSelection>;
  showTrends?: boolean;
}

/**
 * Resolve which report charts are enabled. New reports carry `charts`; legacy
 * reports (no `charts`) fall back to historical behavior: radar + benchmark
 * standing on, trends driven by the old `showTrends` flag, distribution off.
 */
export function resolveChartSelection(config: ChartConfigInput | undefined | null): ChartSelection {
  const c = config?.charts;
  if (c) {
    return {
      radar: c.radar ?? false,
      benchmarkStanding: c.benchmarkStanding ?? false,
      trends: c.trends ?? false,
      distribution: c.distribution ?? false,
    };
  }
  return {
    radar: true,
    benchmarkStanding: true,
    trends: config?.showTrends ?? false,
    distribution: false,
  };
}
```

- [ ] **Step 4: Run — confirm GREEN.** `npx vitest run --config vitest.unit.config.ts packages/shared/__tests__/report-charts.test.ts` → 3 pass. `npm run check` → pass.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/report-charts.ts packages/shared/__tests__/report-charts.test.ts
git commit -m "feat(reports): shared resolveChartSelection with back-compat defaults"
```

---

## Task 2: `computeDistribution` (stats + sampling)

**Files:** Create `packages/api/services/report-distributions.ts`, `packages/api/services/__tests__/report-distributions.test.ts`. Add the shared `MetricDistribution` type to `packages/shared/report-trends-types.ts`.

- [ ] **Step 1: Add the shared type.** Append to `packages/shared/report-trends-types.ts`:

```typescript
/** Peer distribution for one metric (org-wide), with the athlete's own value. */
export interface MetricDistribution {
  values: number[];   // peer best-performances, sampled for display (<= cap)
  athleteValue: number;
  stats: { min: number; q1: number; median: number; q3: number; max: number }; // from the FULL set
}

/** Map of metric code -> distribution. Present only when the distribution chart is enabled. */
export type ReportDistributions = Record<string, MetricDistribution>;
```

- [ ] **Step 2: Write the failing test**

```typescript
// packages/api/services/__tests__/report-distributions.test.ts
import { describe, it, expect } from 'vitest';
import { computeDistribution, MAX_DISTRIBUTION_POINTS } from '../report-distributions';

describe('computeDistribution', () => {
  it('computes five-number stats from the full set', () => {
    const d = computeDistribution([10, 20, 30, 40, 50], 30, 100)!;
    expect(d.stats.min).toBe(10);
    expect(d.stats.max).toBe(50);
    expect(d.stats.median).toBe(30);
    expect(d.stats.q1).toBeCloseTo(20, 5);
    expect(d.stats.q3).toBeCloseTo(40, 5);
    expect(d.athleteValue).toBe(30);
    expect(d.values).toHaveLength(5);
  });

  it('returns null for fewer than 2 peers', () => {
    expect(computeDistribution([42], 42, 100)).toBeNull();
    expect(computeDistribution([], 1, 100)).toBeNull();
  });

  it('samples values deterministically down to the cap; stats use the full set', () => {
    const full = Array.from({ length: 1000 }, (_, i) => i + 1); // 1..1000
    const d = computeDistribution(full, 500, 150)!;
    expect(d.values.length).toBeLessThanOrEqual(150);
    expect(d.stats.min).toBe(1);
    expect(d.stats.max).toBe(1000);
    // deterministic: same input -> same sample
    expect(computeDistribution(full, 500, 150)!.values).toEqual(d.values);
  });

  it('does not sample when under the cap', () => {
    const d = computeDistribution([1, 2, 3, 4], 3, 150)!;
    expect(d.values).toEqual([1, 2, 3, 4]);
  });
});
```

- [ ] **Step 3: Run — confirm RED.** `npx vitest run --config vitest.unit.config.ts packages/api/services/__tests__/report-distributions.test.ts` → FAIL.

- [ ] **Step 4: Implement**

```typescript
// packages/api/services/report-distributions.ts
import { quantile } from 'simple-statistics';
import type { MetricDistribution } from '@shared/report-trends-types';

export const MAX_DISTRIBUTION_POINTS = 150;

/**
 * Build a peer distribution for one metric. Stats are computed from the FULL
 * peer set; `values` is evenly sampled down to `maxPoints` for display.
 * Returns null when there are fewer than 2 peers (no meaningful box).
 */
export function computeDistribution(
  peerValues: number[],
  athleteValue: number,
  maxPoints: number = MAX_DISTRIBUTION_POINTS,
): MetricDistribution | null {
  if (!peerValues || peerValues.length < 2) return null;

  const sorted = [...peerValues].sort((a, b) => a - b);
  const stats = {
    min: sorted[0],
    q1: quantile(sorted, 0.25),
    median: quantile(sorted, 0.5),
    q3: quantile(sorted, 0.75),
    max: sorted[sorted.length - 1],
  };

  let values = peerValues;
  if (peerValues.length > maxPoints) {
    // Even, deterministic down-sampling of the sorted set.
    const step = peerValues.length / maxPoints;
    values = Array.from({ length: maxPoints }, (_, i) => sorted[Math.floor(i * step)]);
  }

  return { values, athleteValue, stats };
}
```

- [ ] **Step 5: Run — confirm GREEN** (4 tests). `npm run check` → pass.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/report-trends-types.ts packages/api/services/report-distributions.ts packages/api/services/__tests__/report-distributions.test.ts
git commit -m "feat(reports): pure computeDistribution (five-number stats + deterministic sampling)"
```

---

## Task 3: backend `calculateDistributions` + wire into generate

**Files:** Modify `packages/api/services/report-service.ts`.

- [ ] **Step 1: Add imports + config/data types.** Near the other imports:

```typescript
import { computeDistribution } from './report-distributions';
import { resolveChartSelection } from '@shared/report-charts';
import type { ReportDistributions } from '@shared/report-trends-types';
```
In `interface ReportConfig` add:
```typescript
  charts?: { radar?: boolean; benchmarkStanding?: boolean; trends?: boolean; distribution?: boolean };
```
In `interface IndividualReportData` add:
```typescript
  distributions?: ReportDistributions;
```

- [ ] **Step 2: Add `calculateDistributions` method.** Place near `calculatePercentilesAndAverages` (≈ line 615). It mirrors that method's org-wide peer best-value query, then calls `computeDistribution`:

```typescript
  /** Org-wide peer distribution per metric (same peer set as the percentile). */
  async calculateDistributions(
    organizationId: string,
    metrics: string[],
    athletePerformances: Record<string, number>,
    startDate: string,
    endDate: string,
  ): Promise<ReportDistributions> {
    const distributions: ReportDistributions = {};
    for (const metric of metrics) {
      const athleteValue = athletePerformances[metric];
      if (athleteValue === undefined) continue;

      const rows = await db
        .select({ value: measurements.value, userId: measurements.userId })
        .from(measurements)
        .where(and(
          eq(measurements.organizationId, organizationId),
          eq(measurements.metric, metric),
          gte(measurements.date, startDate),
          lte(measurements.date, endDate),
        ));

      // Best performance per athlete (same rule as calculatePercentilesAndAverages).
      const info = await this.getMetricInfo(metric);
      const bestMap = new Map<string, number>();
      for (const r of rows) {
        const v = parseFloat(r.value);
        const cur = bestMap.get(r.userId);
        if (cur === undefined) bestMap.set(r.userId, v);
        else if (info.lowerIsBetter ? v < cur : v > cur) bestMap.set(r.userId, v);
      }

      const dist = computeDistribution(Array.from(bestMap.values()), athleteValue);
      if (dist) distributions[metric] = dist;
    }
    return distributions;
  }
```

- [ ] **Step 3: Wire into `generateIndividualReport`.** After `benchmarkComparisons` / `trends` are built and before the `athletePerformance`/return, add:

```typescript
    const chartSelection = resolveChartSelection(config);
    let distributions: ReportDistributions | undefined;
    if (chartSelection.distribution) {
      distributions = await this.calculateDistributions(
        report.organizationId, config.metrics, bestPerformances, startDate, endDate,
      );
    }
```
Add `distributions` to the returned object (alongside `trends`).

Note: the existing `trends` block is gated on `config.showTrends`. Change that gate to `if (resolveChartSelection(config).trends)` so the trends payload honors the new selection (compute `chartSelection` once and reuse). This keeps legacy `showTrends` working (resolver maps it) and lets the new `charts.trends` toggle control it.

- [ ] **Step 4: Verify** `npm run check` → pass.

- [ ] **Step 5: Commit**

```bash
git add packages/api/services/report-service.ts
git commit -m "feat(reports): compute org-wide distributions when the distribution chart is enabled"
```

---

## Task 4: frontend config types + zod

**Files:** Modify `packages/web/src/types/report-types.ts`, `packages/shared/schema-original.ts`.

- [ ] **Step 1: Frontend types.** In `IndividualReportConfig` (report-types.ts): add `charts?: { radar?: boolean; benchmarkStanding?: boolean; trends?: boolean; distribution?: boolean };`, keep `showTrends?: boolean`, and REMOVE the `userDefined` sub-field from `benchmarks` (individual reports can't use it — it's the dead path). In `IndividualReportData` add `distributions?: ReportDistributions;` with `import type { ReportDistributions } from '@shared/report-trends-types';`.

- [ ] **Step 2: Zod.** In `insertReportSchema` (and `updateReportSchema`) config object in `schema-original.ts`, add:
```typescript
    charts: z.object({
      radar: z.boolean().optional(),
      benchmarkStanding: z.boolean().optional(),
      trends: z.boolean().optional(),
      distribution: z.boolean().optional(),
    }).optional(),
```
Leave `benchmarks.userDefined` in the zod (the shared config shape is still used by **team** reports' `getBenchmarksForReport`). Add a one-line comment: `// benchmarks.userDefined applies to team reports only`.

- [ ] **Step 3: Verify** `npm run check` → pass.

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/types/report-types.ts packages/shared/schema-original.ts
git commit -m "feat(reports): add charts selection to config schema; drop dead individual userDefined type"
```

---

## Task 5: `DistributionSection` component

**Files:** Create `packages/web/src/components/reports/DistributionSection.tsx`.

This reuses the box+dots (`box_swarm_combo`) visual via `BoxPlotChart`. READ `packages/web/src/components/charts/BoxPlotChart.tsx` FIRST to confirm: (a) whether it derives the box from `rawData`/`data` when `statistics` is omitted, or requires a `StatisticalSummary`; (b) the exact `ChartDataPoint` fields it reads; (c) whether it renders analytics-only chrome (stats expander, athlete-name toggle) that should be suppressed for a report — if so, add a minimal `compact` prop to BoxPlotChart (mirroring the radar `compact` fix already in the codebase) and pass it. Then:

- [ ] **Step 1: Implement** (per-metric box+dots from `distributions`)

```tsx
// packages/web/src/components/reports/DistributionSection.tsx
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BoxPlotChart } from '@/components/charts/BoxPlotChart';
import type { ReportDistributions } from '@shared/report-trends-types';

interface Props {
  athleteId: string;
  athleteName: string;
  distributions: ReportDistributions;
  metricLabels?: Record<string, string>;
  metricUnits?: Record<string, string>;
}

export function DistributionSection({ athleteId, athleteName, distributions, metricLabels = {}, metricUnits = {} }: Props) {
  const entries = Object.entries(distributions);
  if (entries.length === 0) return null;
  return (
    <Card data-report-chart="distribution" data-report-chart-title="Distribution vs peers">
      <CardHeader><CardTitle>Where You Stand (vs your group)</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        <p className="text-sm text-muted-foreground">
          Each dot is an athlete in your organization with this test; you are the blue dot.
        </p>
        {entries.map(([code, dist]) => {
          const label = metricLabels[code] || code;
          // Build ChartDataPoint[]: anonymous peers + the athlete (real id, highlighted).
          const points = dist.values.map((v, i) => ({
            athleteId: `peer-${i}`, athleteName: '', value: v, date: new Date(), metric: code,
          }));
          points.push({ athleteId, athleteName, value: dist.athleteValue, date: new Date(), metric: code });
          return (
            <div key={code} data-report-chart={`dist:${code}`} data-report-chart-title={`${label} — distribution`} className="h-[260px]">
              <BoxPlotChart
                data={points}
                rawData={points}
                highlightAthlete={athleteId}
                showAllPoints
                config={{ type: 'box_swarm_combo', title: label, showLegend: false, showTooltips: true, responsive: true }}
                /* compact  // add if BoxPlotChart exposes it after the read above */
              />
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
export default DistributionSection;
```
Adjust the props you pass to BoxPlotChart to match what the read in this task established (e.g. if it needs a `statistics` map, build one per metric from `dist.stats` filling the required `StatisticalSummary` fields: `count`, `mean`, `median`, `min`, `max`, `std`, `variance`, and `percentiles` with `p25=q1`, `p50=median`, `p75=q3`). If it derives the box from points, omit `statistics`.

- [ ] **Step 2: Verify** `npm run check` → pass.

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/components/reports/DistributionSection.tsx
git commit -m "feat(reports): DistributionSection (box + dots, athlete highlighted)"
```

---

## Task 6: wizard chart-selection step

**Files:** Modify `packages/web/src/components/reports/ReportWizard.tsx`.

- [ ] **Step 1: Form schema + defaults.** Replace the `showTrends: z.boolean().default(false)` field with a `charts` group:
```typescript
charts: z.object({
  radar: z.boolean().default(true),
  benchmarkStanding: z.boolean().default(true),
  trends: z.boolean().default(true),
  distribution: z.boolean().default(true),
}).default({ radar: true, benchmarkStanding: true, trends: true, distribution: true }),
```
Update `defaultValues` accordingly (remove `showTrends: false`; add the `charts` default object). Update the `watch` (replace `const showTrends = watch('showTrends')` with `const charts = watch('charts')`).

- [ ] **Step 2: Replace the checkbox UI.** Where the "Show progress over time" card is (individual step 8), render four described checkboxes, one per chart, mirroring the existing card style:
```tsx
{([
  ['radar', 'All-around profile (radar)', 'Percentile shape across all metrics (needs ≥3 metrics)'],
  ['benchmarkStanding', 'Benchmark standing', 'Where the athlete sits vs each benchmark'],
  ['trends', 'Progress over time', 'Trend line per metric (needs ≥2 measurements)'],
  ['distribution', 'Where you stand (distribution)', 'The group spread with the athlete marked'],
] as const).map(([key, title, desc]) => (
  <div key={key} className="flex items-start space-x-2">
    <Checkbox id={`chart-${key}`} checked={charts?.[key] ?? true}
      onCheckedChange={(v) => setValue(`charts.${key}` as const, v as boolean)} className="mt-1" />
    <div>
      <Label htmlFor={`chart-${key}`} className="cursor-pointer font-medium">{title}</Label>
      <p className="text-sm text-muted-foreground">{desc}</p>
    </div>
  </div>
))}
```

- [ ] **Step 3: Submit config.** In `onSubmit`, replace `config.showTrends = data.showTrends` with `config.charts = data.charts;`. Remove any `showTrends` from the submitted config.

- [ ] **Step 4: Verify** `npm run check` → pass.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/components/reports/ReportWizard.tsx
git commit -m "feat(reports): per-chart selection step in the report wizard (default all on)"
```

---

## Task 7: render gating + distribution in report views

**Files:** Modify `packages/web/src/components/reports/IndividualReportView.tsx`, `packages/web/src/pages/public-report.tsx`.

- [ ] **Step 1: Live view.** Import `resolveChartSelection` from `@shared/report-charts` and `DistributionSection`. Compute `const sel = resolveChartSelection(reportData.reportConfig)` (confirm the generated data exposes `reportConfig`; the backend returns it). Gate each existing section by `sel.<chart> && <existing data guard>`:
  - radar section: `sel.radar && athlete.percentiles && Object.keys(...).length >= 3`
  - benchmark-standing: `sel.benchmarkStanding && <existing comparisons guard>`
  - trends (`TrendSection`): `sel.trends && trends && Object.keys(trends).length > 0`
  - distribution (new): `sel.distribution && distributions && Object.keys(distributions).length > 0` → render `<DistributionSection athleteId={athlete.userId} athleteName={athlete.userName} distributions={distributions} metricLabels={metricLabels} metricUnits={metricUnits} />` (destructure `distributions` from `reportData`).

- [ ] **Step 2: Public page.** Same gating using `snapshotData` (config at `snapshotData.reportConfig`, distributions at top-level `snapshotData.distributions`, athlete at `snapshotData.athlete`). Render the same four gated sections.

- [ ] **Step 3: Verify** `npm run check` → pass; manual: a report with all charts on shows radar/benchmark/trends/distribution; toggling distribution off removes it.

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/components/reports/IndividualReportView.tsx packages/web/src/pages/public-report.tsx
git commit -m "feat(reports): gate report sections by chart selection; render distribution (live + public)"
```

---

## Task 8: integration tests

**Files:** Create `tests/integration/report-chart-selection.test.ts` (model harness on `tests/integration/report-trends.test.ts`).

- [ ] **Step 1: Tests** (reuse the sibling harness: app build, login, seed org/team/athlete/measurements; seed a SECOND athlete so peers exist for the distribution):
  - `generate` with `config.charts.distribution = true` returns `data.distributions[METRIC]` with `values`/`stats`/`athleteValue`; with distribution off (or legacy config), `data.distributions` is undefined.
  - `config.charts.trends=false` → `data.trends` undefined; `charts.trends=true` → present.
  - Back-compat: a report with NO `charts` and legacy `showTrends:true` → `data.trends` present, `data.distributions` undefined (matches `resolveChartSelection`).
  - Distribution omits a metric with `<2` peers.

- [ ] **Step 2: Run** `npx dotenv -e .env.local -- npx vitest run --config vitest.integration.config.ts tests/integration/report-chart-selection.test.ts` → PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/integration/report-chart-selection.test.ts
git commit -m "test(reports): integration coverage for chart selection + distribution payload"
```

---

## Task 9: E2E + verification

**Files:** Create `tests/e2e/report-chart-selection.spec.ts` (model on `tests/e2e/individual-report-charts.spec.ts`).

- [ ] **Step 1: E2E** — seed an athlete (≥3 metrics, ≥2 measurements) PLUS a few peer athletes with the same metrics (so the distribution has a group). Create a report with `config.charts` all true. Assert: radar, `[data-testid="trend-section"]`, `[data-report-chart="distribution"]`, and a `[data-report-chart^="dist:"]` chart are visible. Create a second report with `charts.distribution=false` and assert `[data-report-chart="distribution"]` is NOT present. Verify the public link shows the distribution. Capture `screenshots/report-chart-selection-desktop.png` and `-mobile.png`.

- [ ] **Step 2: Run** the E2E → PASS; screenshots generated. **View the desktop screenshot** to confirm the box+dots renders with the athlete marked and no overflowing analytics chrome (apply a `compact` prop to BoxPlotChart if chrome intrudes — same pattern as the radar fix).

- [ ] **Step 3: Full verification**

Run: `npm run check` → PASS.
Run: `npm run test:unit` → PASS (new `report-charts`, `report-distributions` tests included; list any pre-existing unrelated failures separately).
Run integration: `npx dotenv -e .env.local -- npx vitest run --config vitest.integration.config.ts tests/integration/report-chart-selection.test.ts tests/integration/report-trends.test.ts` → PASS (back-compat: report-trends still green).

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/report-chart-selection.spec.ts
git commit -m "test(reports): E2E for chart selection + distribution (live + public) with screenshots"
```

---

## Self-Review Notes (spec coverage)

- Chart selection (all four toggleable, default on) → Tasks 1 (resolver), 4 (zod), 6 (wizard), 7 (gating).
- Back-compat / no migration → Task 1 resolver + Tasks 3/7 using it; asserted in Task 8.
- Distribution (org-wide peer reuse, box+dots, sampling) → Tasks 2 (stats/sampling), 3 (backend query), 5 (component), 7 (render).
- Distribution data matches the percentile peer set → Task 3 mirrors `calculatePercentilesAndAverages`'s org-wide best-per-athlete query.
- userDefined cleanup (individual only; team keeps it) → Task 4 (drop from individual frontend type; zod kept for team with comment).
- PDF capture → DistributionSection carries `data-report-chart` hooks; the capture/embed path (generalized in the merged trends work) handles them; verified in Task 9.
- Tests: unit (1,2), integration (8), E2E (9). Existing report behavior guarded (Task 8 back-compat, Task 9 report-trends).

**Known implementation-time read (not a placeholder):** Task 5 requires reading `BoxPlotChart` to finalize how points/statistics are fed and whether a `compact` prop is needed — the data contract (`MetricDistribution`) is fully specified; only the analytics-component wiring is established at implementation time, with a screenshot-verification gate in Task 9.

**Deferred (out of scope):** team-report chart selection; demographic/team peer sets for the distribution.

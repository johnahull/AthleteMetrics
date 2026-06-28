# Additional Individual-Report Charts — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Add a radar percentile profile, a tier-progress chart, and personal-best/benchmark-crossing markers to the individual report; surface the tier-progress chart in Coach Analytics too; and extract tier-comparison logic into a shared service.

**Architecture:** A shared, pure tier-evaluation module (lifted from `report-service`) becomes the single source of truth, consumed by the report service and a new analytics endpoint. Pure/presentational React chart components (`TierProgressChart`, reused `RadarChart`, enhanced `BenchmarkTrendChart`) are fed by each surface. `BenchmarkComparison` moves to `packages/shared` as the common contract.

**Tech Stack:** TypeScript, Drizzle/Postgres, Express, React 18, react-chartjs-2/Chart.js 4 + chartjs-plugin-annotation, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-06-28-individual-report-charts-design.md`

**Branch:** `feature/individual-report-charts` (stacked on `feature/report-time-range-trends` / PR #442; base the eventual PR there or rebase onto `develop` after #442 merges).

**Test commands:** unit `npx vitest run <path>`; integration `npx dotenv -e .env.local -- npx vitest run --config vitest.integration.config.ts <path>`; E2E `npx dotenv -e .env.local -- npx playwright test <path> --config=playwright.config.ts`; typecheck `npm run check`.

---

## File Structure

**Create:**
- `packages/shared/benchmark-types.ts` — shared `BenchmarkComparison` (+ `TierInfo`) type.
- `packages/api/services/benchmark-tiers.ts` — pure `evaluateTierBenchmark(value, lowerIsBetter, allTiers)` + `deriveTierGroupName`.
- `packages/api/services/benchmark-tiers.test.ts` — unit tests.
- `packages/web/src/components/charts/TierProgressChart.tsx` — new chart.
- `packages/web/src/components/charts/tier-progress-utils.ts` — pure geometry/label helpers.
- `packages/web/src/components/charts/tier-progress-utils.test.ts` — unit tests.
- `packages/web/src/components/reports/PercentileRadarSection.tsx` — radar wrapper for reports.
- `tests/integration/analytics-benchmark-tiers.test.ts` — endpoint test.
- `tests/e2e/individual-report-charts.spec.ts` — E2E + screenshots.

**Modify:**
- `packages/api/services/report-service.ts` — import shared type + call extracted module.
- `packages/web/src/types/report-types.ts` — import shared `BenchmarkComparison`.
- `packages/web/src/components/charts/trend-utils.ts` (+ test) — `personalBestIndex`, `radarDataFromPercentiles`.
- `packages/web/src/components/charts/BenchmarkTrendChart.tsx` — PB + crossing markers.
- `packages/web/src/components/reports/IndividualReportView.tsx` — radar + tier-progress sections.
- `packages/web/src/pages/public-report.tsx` — same sections.
- `packages/web/src/lib/chartExport.ts` — capture radar/tier wrappers too.
- `packages/api/routes/report-routes.ts` — PDF embeds use chart label.
- `packages/shared/analytics-types.ts` — add `'tier_progress'` to `ChartType`.
- `packages/web/src/components/charts/ChartContainer.tsx` — register `tier_progress`.
- `packages/api/routes/analytics-routes.ts` — `GET /api/analytics/benchmark-tiers`.
- `packages/web/src/components/analytics/BaseAnalyticsView.tsx` — fetch + render tier-progress.

---

## Phase 1 — Shared tier service + type consolidation

### Task 1: Shared `BenchmarkComparison` type

**Files:** Create `packages/shared/benchmark-types.ts`; Modify `report-service.ts`, `report-types.ts`.

- [ ] **Step 1: Create the shared type** (copy the exact interface currently in `report-service.ts` lines 104–132).

```typescript
// packages/shared/benchmark-types.ts

/** One tier band in a tier group. */
export interface TierInfo {
  tierName: string;
  tierColor: string;
  tierOrder: number;
  minValue: number | null;
  maxValue: number | null;
}

/** Result of comparing an athlete value to a benchmark (single-value or tiered). */
export interface BenchmarkComparison {
  benchmarkName: string;
  benchmarkValue: number;
  athleteValue: number;
  meetsOrExceeds: boolean;
  percentageDiff: number;
  comparisonOperator: string;
  tierName?: string;
  tierColor?: string;
  tierOrder?: number;
  tierGroupName?: string;
  distanceToNextTier?: number | null;
  nextTierName?: string | null;
  isBestTier?: boolean;
  coachingNote?: string | null;
  allTiers?: TierInfo[];
}
```

- [ ] **Step 2: Use it in `report-service.ts`.** Delete the local `interface BenchmarkComparison { ... }` (lines ~104–132) and add to the imports:

```typescript
import type { BenchmarkComparison } from '@shared/benchmark-types';
```

- [ ] **Step 3: Use it in `report-types.ts`.** Find the frontend `BenchmarkComparison` interface (≈ lines 32–54) and replace it with a re-export so existing imports keep working:

```typescript
export type { BenchmarkComparison } from '@shared/benchmark-types';
```

- [ ] **Step 4: Verify**

Run: `npm run check`
Expected: PASS (if any field mismatch surfaces between the two old definitions, align call sites to the shared shape — the shared shape is the superset above).

- [ ] **Step 5: Commit**

```bash
git add packages/shared/benchmark-types.ts packages/api/services/report-service.ts packages/web/src/types/report-types.ts
git commit -m "refactor(reports): move BenchmarkComparison to shared types"
```

### Task 2: Extract pure `evaluateTierBenchmark`

**Files:** Create `packages/api/services/benchmark-tiers.ts` (+ test); Modify `report-service.ts`.

- [ ] **Step 1: Write the failing test**

```typescript
// packages/api/services/benchmark-tiers.test.ts
import { describe, it, expect } from 'vitest';
import { evaluateTierBenchmark } from './benchmark-tiers';

const tiers = [
  { tierName: 'Elite', tierColor: '#fbbf24', tierOrder: 1, minValue: '28', maxValue: '40', name: 'VJ Elite' },
  { tierName: 'Varsity', tierColor: '#86efac', tierOrder: 2, minValue: '24', maxValue: '28', name: 'VJ Varsity' },
  { tierName: 'JV', tierColor: '#fde68a', tierOrder: 3, minValue: '20', maxValue: '24', name: 'VJ JV' },
];

describe('evaluateTierBenchmark', () => {
  it('matches the tier a higher-is-better value falls into and distance to next', () => {
    const c = evaluateTierBenchmark(25.5, false, tiers)!;
    expect(c.tierName).toBe('Varsity');
    expect(c.nextTierName).toBe('Elite');
    expect(c.distanceToNextTier).toBeCloseTo(2.5); // 28 - 25.5
    expect(c.isBestTier).toBe(false);
    expect(c.allTiers).toHaveLength(3);
  });

  it('flags the best tier with no next', () => {
    const c = evaluateTierBenchmark(30, false, tiers)!;
    expect(c.tierName).toBe('Elite');
    expect(c.isBestTier).toBe(true);
    expect(c.distanceToNextTier).toBeNull();
  });

  it('computes distance for lower-is-better (time) metrics', () => {
    const timeTiers = [
      { tierName: 'Elite', tierColor: '#a', tierOrder: 1, minValue: '1.00', maxValue: '1.20', name: 'Fly Elite' },
      { tierName: 'Varsity', tierColor: '#b', tierOrder: 2, minValue: '1.20', maxValue: '1.40', name: 'Fly Varsity' },
    ];
    const c = evaluateTierBenchmark(1.32, true, timeTiers)!;
    expect(c.tierName).toBe('Varsity');
    expect(c.distanceToNextTier).toBeCloseTo(0.12); // 1.32 - 1.20
  });

  it('returns null for empty tiers', () => {
    expect(evaluateTierBenchmark(10, false, [])).toBeNull();
  });
});
```

- [ ] **Step 2: Run it, confirm RED**

Run: `npx vitest run packages/api/services/benchmark-tiers.test.ts`
Expected: FAIL ("Cannot find module './benchmark-tiers'").

- [ ] **Step 3: Implement by moving the existing logic.** Create `benchmark-tiers.ts` containing `deriveTierGroupName` (move it from wherever it currently lives in report-service's module scope) and a pure `evaluateTierBenchmark` that is the body of `report-service.ts` lines 1604–1751 **with one change**: it takes `lowerIsBetter: boolean` as a parameter instead of calling `this.getMetricInfo`. Signature:

```typescript
// packages/api/services/benchmark-tiers.ts
import type { BenchmarkComparison } from '@shared/benchmark-types';

export function deriveTierGroupName(name: string): string {
  // (move the exact existing implementation from report-service module scope)
}

export function evaluateTierBenchmark(
  athleteValue: number,
  lowerIsBetter: boolean,
  allTiers: any[],
): BenchmarkComparison | null {
  if (allTiers.length === 0) return null;
  // ... paste the body of the current evaluateTierBenchmark VERBATIM from
  //     report-service.ts lines 1609–1751, deleting the two lines that compute
  //     metricInfo/lowerIsBetter (1606–1607) since lowerIsBetter is now a param.
}
```

- [ ] **Step 4: Refactor `report-service.ts` to call it.** Replace the private method body (or the method entirely) so its single caller computes `lowerIsBetter` and delegates:

```typescript
// where evaluateTierBenchmark was called (line ~877 and ~1482), keep call sites
// but route through the shared fn. Simplest: keep a thin private wrapper:
private async evaluateTierBenchmark(athleteValue: number, metricCode: string, allTiers: any[]) {
  const info = await this.getMetricInfo(metricCode);
  return evaluateTierBenchmark(athleteValue, info.lowerIsBetter, allTiers);
}
```
Add `import { evaluateTierBenchmark, deriveTierGroupName } from './benchmark-tiers';` and remove the now-moved `deriveTierGroupName` definition + the old method body. (Keep the thin wrapper so existing call sites are untouched.)

- [ ] **Step 5: Verify**

Run: `npx vitest run packages/api/services/benchmark-tiers.test.ts` → PASS (4).
Run: `npx dotenv -e .env.local -- npx vitest run --config vitest.integration.config.ts tests/integration/report-trends.test.ts` → existing report tests still PASS (behavior unchanged).
Run: `npm run check` → PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/api/services/benchmark-tiers.ts packages/api/services/benchmark-tiers.test.ts packages/api/services/report-service.ts
git commit -m "refactor(reports): extract pure evaluateTierBenchmark into shared module"
```

---

## Phase 2 — Report charts

### Task 3: Pure helpers (`trend-utils` + `tier-progress-utils`)

**Files:** Modify `trend-utils.ts` (+ test); Create `tier-progress-utils.ts` (+ test).

- [ ] **Step 1: Write failing tests for `trend-utils` additions**

Append to `packages/web/src/components/charts/trend-utils.test.ts`:

```typescript
import { personalBestIndex, radarDataFromPercentiles } from './trend-utils';

describe('personalBestIndex', () => {
  it('returns the max index for higher-is-better', () => {
    expect(personalBestIndex([{date:'a',value:18},{date:'b',value:25},{date:'c',value:22}], 'higher')).toBe(1);
  });
  it('returns the min index for lower-is-better', () => {
    expect(personalBestIndex([{date:'a',value:1.4},{date:'b',value:1.22},{date:'c',value:1.3}], 'lower')).toBe(1);
  });
});

describe('radarDataFromPercentiles', () => {
  it('builds one MultiMetricData series with precomputed percentileRanks', () => {
    const md = radarDataFromPercentiles('u1', 'Jordan', { VJ: 80, DASH: 65 }, { VJ: 25.5, DASH: 4.9 });
    expect(md.athleteId).toBe('u1');
    expect(md.percentileRanks).toEqual({ VJ: 80, DASH: 65 });
    expect(md.metrics).toEqual({ VJ: 25.5, DASH: 4.9 });
  });
});
```

- [ ] **Step 2: Run, confirm RED.** `npx vitest run packages/web/src/components/charts/trend-utils.test.ts` → FAIL (missing exports).

- [ ] **Step 3: Implement in `trend-utils.ts`**

```typescript
import type { TrendPoint } from '@shared/report-trends-types';
import type { MultiMetricData } from '@shared/analytics-types';

/** Index of the personal-best point (min for lower-is-better, max otherwise). */
export function personalBestIndex(series: TrendPoint[], direction: 'higher' | 'lower'): number {
  if (series.length === 0) return -1;
  let bestIdx = 0;
  for (let i = 1; i < series.length; i++) {
    const better = direction === 'lower' ? series[i].value < series[bestIdx].value
                                         : series[i].value > series[bestIdx].value;
    if (better) bestIdx = i;
  }
  return bestIdx;
}

/** Adapt the report's precomputed percentiles into RadarChart's MultiMetricData. */
export function radarDataFromPercentiles(
  athleteId: string,
  athleteName: string,
  percentiles: Record<string, number>,
  measurements: Record<string, number>,
): MultiMetricData {
  return { athleteId, athleteName, metrics: { ...measurements }, percentileRanks: { ...percentiles } };
}
```

- [ ] **Step 4: Write failing tests for `tier-progress-utils`**

```typescript
// packages/web/src/components/charts/tier-progress-utils.test.ts
import { describe, it, expect } from 'vitest';
import { tierSegments, athletePositionPct, nextTierCaption } from './tier-progress-utils';
import type { BenchmarkComparison } from '@shared/benchmark-types';

const cmp: BenchmarkComparison = {
  benchmarkName: 'VJ', benchmarkValue: 26, athleteValue: 25.5, meetsOrExceeds: true,
  percentageDiff: 0, comparisonOperator: 'range', tierName: 'Varsity', tierColor: '#86efac',
  tierOrder: 2, distanceToNextTier: 2.5, nextTierName: 'Elite', isBestTier: false,
  allTiers: [
    { tierName: 'JV', tierColor: '#fde68a', tierOrder: 3, minValue: 20, maxValue: 24 },
    { tierName: 'Varsity', tierColor: '#86efac', tierOrder: 2, minValue: 24, maxValue: 28 },
    { tierName: 'Elite', tierColor: '#fbbf24', tierOrder: 1, minValue: 28, maxValue: 32 },
  ],
};

describe('tier-progress-utils', () => {
  it('orders segments worst→best for left→right display', () => {
    const segs = tierSegments(cmp);
    expect(segs.map(s => s.tierName)).toEqual(['JV', 'Varsity', 'Elite']);
  });
  it('positions the athlete within the overall value range (0..1)', () => {
    // range 20..32, athlete 25.5 -> (25.5-20)/(32-20) = 0.458
    expect(athletePositionPct(cmp)).toBeCloseTo(0.458, 2);
  });
  it('captions distance to next tier', () => {
    expect(nextTierCaption(cmp, 'in')).toBe('2.5 in to Elite');
    expect(nextTierCaption({ ...cmp, isBestTier: true, nextTierName: null, distanceToNextTier: null }, 'in'))
      .toBe('Top tier ✓');
  });
});
```

- [ ] **Step 5: Run, confirm RED**, then **implement `tier-progress-utils.ts`**:

```typescript
// packages/web/src/components/charts/tier-progress-utils.ts
import type { BenchmarkComparison, TierInfo } from '@shared/benchmark-types';

/** Tiers ordered worst→best (descending tierOrder) for left→right bars. */
export function tierSegments(cmp: BenchmarkComparison): TierInfo[] {
  return [...(cmp.allTiers ?? [])].sort((a, b) => b.tierOrder - a.tierOrder);
}

/** Athlete position 0..1 across the combined min..max of all tier bands. */
export function athletePositionPct(cmp: BenchmarkComparison): number {
  const segs = tierSegments(cmp);
  const mins = segs.map(s => s.minValue).filter((v): v is number => v != null);
  const maxs = segs.map(s => s.maxValue).filter((v): v is number => v != null);
  if (!mins.length || !maxs.length) return 0;
  const lo = Math.min(...mins), hi = Math.max(...maxs);
  if (hi === lo) return 0;
  return Math.max(0, Math.min(1, (cmp.athleteValue - lo) / (hi - lo)));
}

/** "2.5 in to Elite" / "Top tier ✓". */
export function nextTierCaption(cmp: BenchmarkComparison, unit?: string): string {
  if (cmp.isBestTier || !cmp.nextTierName || cmp.distanceToNextTier == null) return 'Top tier ✓';
  const u = unit ? ` ${unit}` : '';
  return `${Math.round(cmp.distanceToNextTier * 100) / 100}${u} to ${cmp.nextTierName}`;
}
```

- [ ] **Step 6: Verify** both test files pass; `npm run check` passes.

- [ ] **Step 7: Commit**

```bash
git add packages/web/src/components/charts/trend-utils.ts packages/web/src/components/charts/trend-utils.test.ts packages/web/src/components/charts/tier-progress-utils.ts packages/web/src/components/charts/tier-progress-utils.test.ts
git commit -m "feat(charts): pure helpers for PB index, radar adapter, tier-progress geometry"
```

### Task 4: `TierProgressChart` component

**Files:** Create `packages/web/src/components/charts/TierProgressChart.tsx`.

- [ ] **Step 1: Implement** (presentational SVG; carries `data-report-chart` for PDF capture).

```tsx
// packages/web/src/components/charts/TierProgressChart.tsx
import type { BenchmarkComparison } from '@shared/benchmark-types';
import { tierSegments, athletePositionPct, nextTierCaption } from './tier-progress-utils';

interface TierProgressChartProps {
  label: string;
  comparison: BenchmarkComparison;
  unit?: string;
}

export function TierProgressChart({ label, comparison, unit }: TierProgressChartProps) {
  const segs = tierSegments(comparison);
  if (segs.length === 0) return null;
  const pos = athletePositionPct(comparison);
  const caption = nextTierCaption(comparison, unit);

  return (
    <div data-report-chart={`tier:${label}`} data-report-chart-title={`${label} — tier`} className="w-full">
      <div className="text-sm font-medium mb-1">{label}</div>
      <div className="relative h-6 w-full flex rounded overflow-hidden border">
        {segs.map((t) => (
          <div key={t.tierName} className="flex-1 flex items-center justify-center text-[10px] text-slate-700"
               style={{ backgroundColor: t.tierColor || '#e2e8f0' }}>
            {t.tierName}
          </div>
        ))}
        {/* athlete marker */}
        <div className="absolute top-0 h-6 w-0.5 bg-slate-900" style={{ left: `${pos * 100}%` }} aria-hidden="true" />
      </div>
      <div className="mt-1 text-xs text-muted-foreground">
        You: {comparison.athleteValue}{unit ? ` ${unit}` : ''} · {comparison.tierName} · {caption}
      </div>
    </div>
  );
}

export default TierProgressChart;
```

- [ ] **Step 2: Verify** `npm run check` passes.

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/components/charts/TierProgressChart.tsx
git commit -m "feat(charts): TierProgressChart (tiered bar + you-are-here marker)"
```

### Task 5: PB + benchmark-crossing markers on `BenchmarkTrendChart`

**Files:** Modify `BenchmarkTrendChart.tsx`.

- [ ] **Step 1: Add PB point styling + crossing annotation.** Use `personalBestIndex(trend.series, trend.direction)` to enlarge/star the PB point via per-point `pointRadius`/`pointStyle` on the dataset, and add a point annotation (or vertical line) at the first index whose value enters the best-so-far tier band (derive from `currentTierName` over `trend.benchmark`). Concretely:

```tsx
import { buildTrendChartData, overlayToAnnotations, directionCue, personalBestIndex, currentTierName } from './trend-utils';
// ...
const pbIdx = useMemo(() => personalBestIndex(trend.series, trend.direction), [trend.series, trend.direction]);
// after buildTrendChartData(...) returns `data`, override point styling:
const ds = data.datasets[0] as any;
ds.pointRadius = trend.series.map((_, i) => (i === pbIdx ? 6 : 3));
ds.pointStyle = trend.series.map((_, i) => (i === pbIdx ? 'star' : 'circle'));
```

For the crossing flag, compute the first index where `currentTierName(trend.benchmark, series[i].value)` differs (improves) from the previous point's tier, and add a label annotation there merged into `annotations` (key `crossing`). Keep it simple; if `trend.benchmark.kind !== 'tiers'`, skip the crossing flag.

- [ ] **Step 2: Verify** `npm run check` passes; existing `trend-utils` tests still green.

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/components/charts/BenchmarkTrendChart.tsx
git commit -m "feat(charts): mark personal best and benchmark crossing on trend"
```

### Task 6: Radar + tier-progress sections in the report (live + public)

**Files:** Create `PercentileRadarSection.tsx`; Modify `IndividualReportView.tsx`, `public-report.tsx`.

- [ ] **Step 1: Create `PercentileRadarSection.tsx`** — renders `RadarChart` from the athlete, only when ≥3 metrics have a percentile:

```tsx
// packages/web/src/components/reports/PercentileRadarSection.tsx
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { RadarChart } from '@/components/charts/RadarChart';
import { radarDataFromPercentiles } from '@/components/charts/trend-utils';

interface Props {
  athleteId: string; athleteName: string;
  percentiles: Record<string, number>;
  measurements: Record<string, number>;
}
export function PercentileRadarSection({ athleteId, athleteName, percentiles, measurements }: Props) {
  const metricCount = Object.keys(percentiles || {}).length;
  if (metricCount < 3) return null;
  const data = [radarDataFromPercentiles(athleteId, athleteName, percentiles, measurements)];
  return (
    <Card data-report-chart="radar" data-report-chart-title="All-around profile">
      <CardHeader><CardTitle>All-Around Profile (percentiles)</CardTitle></CardHeader>
      <CardContent>
        <div className="h-[340px]">
          <RadarChart data={data} config={{ type: 'radar_chart', title: '', showLegend: false, showTooltips: true, responsive: true }} highlightAthlete={athleteId} />
        </div>
      </CardContent>
    </Card>
  );
}
export default PercentileRadarSection;
```
(Confirm `RadarChart`'s required `config` fields against its `ChartConfiguration` type; fill required props minimally.)

- [ ] **Step 2: Render in `IndividualReportView.tsx`** after the performance table, before TrendSection:

```tsx
import { PercentileRadarSection } from '@/components/reports/PercentileRadarSection';
import { TierProgressChart } from '@/components/charts/TierProgressChart';
// ...
{athlete.percentiles && (
  <PercentileRadarSection athleteId={athlete.userId} athleteName={athlete.userName}
    percentiles={athlete.percentiles} measurements={athlete.measurements} />
)}
{/* Benchmark standing */}
{athlete.benchmarkComparisons && Object.entries(athlete.benchmarkComparisons).some(([, cs]) => cs.some(c => c.allTiers?.length)) && (
  <Card>
    <CardHeader><CardTitle>Benchmark Standing</CardTitle></CardHeader>
    <CardContent className="space-y-4">
      {Object.entries(athlete.benchmarkComparisons).map(([code, comps]) => {
        const tiered = comps.find(c => c.allTiers && c.allTiers.length > 0);
        if (!tiered) return null;
        return <TierProgressChart key={code} label={metricLabels?.[code] || code} comparison={tiered} unit={metricUnits?.[code]} />;
      })}
    </CardContent>
  </Card>
)}
```

- [ ] **Step 3: Render the same two sections in `public-report.tsx`** inside the `snapshotData.reportType === 'individual'` area (athlete fields are top-level `snapshotData.athlete` per the prior fix). Reuse `athlete.userName`, `athlete.percentiles`, `athlete.measurements`, `athlete.benchmarkComparisons`, `snapshotData.metricLabels`, `snapshotData.metricUnits`.

- [ ] **Step 4: Verify** `npm run check`; manual: report with ≥3 metrics shows radar + tier bars.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/components/reports/PercentileRadarSection.tsx packages/web/src/components/reports/IndividualReportView.tsx packages/web/src/pages/public-report.tsx
git commit -m "feat(reports): radar profile + benchmark-standing sections (live + public)"
```

### Task 7: Capture radar + tier-progress into the PDF

**Files:** Modify `chartExport.ts`, `report-routes.ts`.

- [ ] **Step 1: Generalize capture.** In `chartExport.ts` `captureTrendCharts()`, also select `[data-report-chart]` elements and return a `title` from `data-report-chart-title`:

```typescript
export async function captureTrendCharts(): Promise<Array<{ metricCode: string; dataUrl: string; title?: string }>> {
  const nodes = Array.from(document.querySelectorAll<HTMLElement>('[data-chart-metric], [data-report-chart]'));
  const out: Array<{ metricCode: string; dataUrl: string; title?: string }> = [];
  for (const node of nodes) {
    const metricCode = node.getAttribute('data-chart-metric') || node.getAttribute('data-report-chart') || '';
    if (!metricCode) continue;
    const title = node.getAttribute('data-report-chart-title') || undefined;
    out.push({ metricCode, dataUrl: await getChartPngDataUrl(node), title });
  }
  return out;
}
```

- [ ] **Step 2: Use the title in the PDF.** In `report-routes.ts` `addTrendChartsToPdf`, change the type to accept `title?` and prefer it: `doc.text(img.title || metricLabels[img.metricCode] || img.metricCode, margin, yPos)`. (Charts now flow ~2/page already.)

- [ ] **Step 3: Verify** `npm run check`; existing PDF integration test still passes.

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/lib/chartExport.ts packages/api/routes/report-routes.ts
git commit -m "feat(reports): capture radar + tier-progress charts into PDF"
```

---

## Phase 3 — Coach Analytics tier-progress

### Task 8: Register `tier_progress` chart type

**Files:** Modify `analytics-types.ts`, `ChartContainer.tsx`.

- [ ] **Step 1: Add to the union** in `packages/shared/analytics-types.ts` (after `'violin_plot'`):

```typescript
  | 'violin_plot'
  | 'tier_progress';
```

- [ ] **Step 2: Register in `ChartContainer.tsx`** — lazy import `TierProgressChart`, add a `case 'tier_progress'` to the component switch, and (if it needs custom data wiring like radar/line) handle it explicitly. It renders per-metric tier bars from a `BenchmarkComparison`; in analytics it shows the selected metric for the highlighted athlete (fed by Task 10). Add a height constant if the file uses one.

- [ ] **Step 3: Offer it in selection** — in `getRecommendedChartType()` / `CHART_SELECTION_MATRIX`, make `tier_progress` an available (not necessarily default) option for `analysis_type: 'individual'` + single metric, so the toolbar lists it.

- [ ] **Step 4: Verify** `npm run check`.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/analytics-types.ts packages/web/src/components/charts/ChartContainer.tsx
git commit -m "feat(analytics): register tier_progress chart type"
```

### Task 9: `GET /api/analytics/benchmark-tiers` endpoint

**Files:** Modify `analytics-routes.ts`; Create `tests/integration/analytics-benchmark-tiers.test.ts`.

- [ ] **Step 1: Add the endpoint**, mirroring an existing analytics GET handler (e.g. `/api/analytics/athletes/:userId/stats`, line 63 — same `analyticsLimiter, requireAuth`, same org/access checks). It reads `athleteId`, `metric`, resolves the org's active tier benchmarks for that metric (reuse the report path's benchmark fetch, or `getBenchmarksForReport`-style lookup scoped to org defaults), computes the athlete's best value for the metric, and calls the shared `evaluateTierBenchmark(value, lowerIsBetter, allTiers)`. Returns `BenchmarkComparison | null`.

```typescript
app.get("/api/analytics/benchmark-tiers", analyticsLimiter, requireAuth, async (req, res) => {
  try {
    const athleteId = req.query.athleteId as string;
    const metric = req.query.metric as string;
    if (!athleteId || !metric) return res.status(400).json({ message: "athleteId and metric required" });
    // resolve org from the authed user / athlete (mirror sibling handler's access check)
    // fetch active tier benchmarks for (org, metric); compute athlete best value;
    // const info = await getMetricInfo(metric);
    // const comparison = evaluateTierBenchmark(bestValue, info.lowerIsBetter, allTiers);
    res.json({ comparison }); // comparison may be null
  } catch (err) {
    console.error('[GET /api/analytics/benchmark-tiers]', err);
    res.status(500).json({ message: "Failed to compute benchmark tiers" });
  }
});
```
Fill the benchmark-fetch + best-value computation using the same helpers the report path uses (extract a small shared fetch if needed; keep it scoped). Confirm exact helper names while implementing.

- [ ] **Step 2: Integration test** (`tests/integration/analytics-benchmark-tiers.test.ts`) modeled on `tests/integration/report-trends.test.ts` harness: seed an athlete with a measurement + a tier benchmark for the metric; assert the endpoint returns a `comparison` with the expected `tierName`/`distanceToNextTier`; assert `comparison` is null (or 200 with null) when no benchmark exists.

- [ ] **Step 3: Verify** the integration test passes; `npm run check`.

- [ ] **Step 4: Commit**

```bash
git add packages/api/routes/analytics-routes.ts tests/integration/analytics-benchmark-tiers.test.ts
git commit -m "feat(analytics): benchmark-tiers endpoint via shared tier service"
```

### Task 10: Render tier-progress in `BaseAnalyticsView`

**Files:** Modify `BaseAnalyticsView.tsx`.

- [ ] **Step 1: Fetch + render.** When the selected chart type is `tier_progress` and analysis is individual with a single metric + a highlighted athlete, fetch `GET /api/analytics/benchmark-tiers?athleteId=..&metric=..` (React Query) and render `<TierProgressChart label={metricLabel} comparison={comparison} unit={unit} />` in place of the generic `ChartContainer` chart (or pass the comparison through to the registered case). If `comparison` is null, show a "no benchmark configured" state and fall back to the recommended chart.

- [ ] **Step 2: Verify** `npm run check`; manual: in Coach Analytics, pick an athlete + metric, choose Tier Progress → bar renders.

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/components/analytics/BaseAnalyticsView.tsx
git commit -m "feat(analytics): show tier-progress chart for single athlete+metric"
```

---

## Phase 4 — Verification

### Task 11: E2E + full verification

**Files:** Create `tests/e2e/individual-report-charts.spec.ts`.

- [ ] **Step 1: E2E spec** (model on `tests/e2e/report-trends.spec.ts`): seed an athlete with ≥3 metrics, ≥2 measurements each, and a tier benchmark; open the individual report and assert the radar section, a `[data-report-chart^="tier:"]` element, and a PB star are present; verify the public link shows them; capture `screenshots/individual-report-charts-desktop.png` and `-mobile.png`. Add a Coach Analytics check: select athlete+metric, choose Tier Progress, assert the bar renders.

- [ ] **Step 2: Run E2E** → PASS; screenshots created.

- [ ] **Step 3: Full verification**

Run: `npm run check` → PASS.
Run: `npm run test:unit` → PASS (new unit tests green; no regressions).
Run: `npx dotenv -e .env.local -- npx vitest run --config vitest.integration.config.ts tests/integration/report-trends.test.ts tests/integration/analytics-benchmark-tiers.test.ts` → PASS.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/individual-report-charts.spec.ts screenshots/individual-report-charts-*.png
git commit -m "test(reports): E2E for radar, tier-progress, PB markers (report + analytics)"
```

---

## Self-Review Notes (spec coverage)

- A radar on report → Tasks 3 (adapter), 6 (section). Reuses `RadarChart`.
- B tier-progress on report → Tasks 1–2 (shared type+service), 3–4 (helpers+component), 6 (section).
- B tier-progress in Coach Analytics → Tasks 8 (chart type), 9 (endpoint), 10 (render).
- C PB/crossing markers → Tasks 3 (`personalBestIndex`), 5 (chart).
- Shared tier service (keystone) → Tasks 1–2; reused by Task 9.
- PDF capture of new charts → Task 7.
- Tests: unit (2,3), integration (2,9), E2E (11). Existing report tests guarded in Task 2/7.

**Deferred (not in this plan):** D peer-distribution chart; dashboard wiring (athlete/coach) — both ride on the shared service + pure components established here.

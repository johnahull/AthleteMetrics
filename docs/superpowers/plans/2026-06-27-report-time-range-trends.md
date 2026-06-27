# Time-Range Progress View for Individual Reports — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-report "Show progress over time" toggle to individual reports that renders each metric's raw measurements over the report window as a benchmark-zone trend chart (plus at-a-glance progress cards), delivered in the interactive view, the public shared page, and the PDF export.

**Architecture:** A pure `assembleTrends()` function builds an additive `trends` field on the existing individual-report payload (only when the toggle is on). Shared trend types live in `packages/shared`. One reusable `TrendSection` React component renders the cards + charts and is used by both the live report view and the public page (which today have separate render paths). The PDF gets charts via client-side capture (`html2canvas` → PNG dataURL) POSTed to new POST PDF routes that embed the images with `jsPDF.addImage`.

**Tech Stack:** TypeScript, Drizzle/Postgres, Express, React 18, react-chartjs-2 / Chart.js 4 + `chartjs-plugin-annotation`, `html2canvas`, `jsPDF`, Vitest, Playwright. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-06-26-report-time-range-trends-design.md`

**Test commands:** unit/integration `npm run test`; single file `npx vitest run <path>`; E2E `npx playwright test <path> --config=playwright.staging.config.ts`.

---

## File Structure

**Create:**
- `packages/shared/report-trends-types.ts` — shared trend/overlay types (imported by API + web).
- `packages/api/services/report-trends.ts` — pure `assembleTrends()` + `deriveOverlay()`.
- `packages/api/services/report-trends.test.ts` — unit tests for the above.
- `packages/web/src/components/charts/trend-utils.ts` — pure chart helpers (axis flip, delta format, overlay→annotations, current tier).
- `packages/web/src/components/charts/trend-utils.test.ts` — unit tests.
- `packages/web/src/components/charts/BenchmarkTrendChart.tsx` — single-metric trend chart with tier zones + axis flip.
- `packages/web/src/components/reports/TrendSection.tsx` — progress cards + per-metric charts (reused by live + public).
- `tests/integration/report-trends.test.ts` — generate + PDF POST integration.
- `tests/e2e/report-trends.spec.ts` — E2E toggle/render/public/PDF.

**Modify:**
- `packages/shared/schema-original.ts` — add `showTrends` to `insertReportSchema` config zod.
- `packages/api/services/report-service.ts` — `ReportConfig.showTrends`, `IndividualReportData.trends`, call `assembleTrends`.
- `packages/web/src/types/report-types.ts` — `IndividualReportConfig.showTrends`, `IndividualReportData.trends`.
- `packages/web/src/components/reports/IndividualReportView.tsx` — render `<TrendSection>`.
- `packages/web/src/pages/public-report.tsx` — render `<TrendSection>`.
- `packages/web/src/components/reports/ReportWizard.tsx` — `showTrends` checkbox.
- `packages/web/src/lib/chartExport.ts` — `getChartPngDataUrl()` + `captureTrendCharts()`.
- `packages/api/routes/report-routes.ts` — POST PDF routes + `generatePDF` `chartImages` param + `addTrendChartsToPdf()`.
- `packages/web/src/hooks/use-report-pdf.ts` — POST with captured chart images.

---

## Task 1: Shared trend types

**Files:**
- Create: `packages/shared/report-trends-types.ts`

- [ ] **Step 1: Create the shared types file**

```typescript
// packages/shared/report-trends-types.ts

/** One point on an athlete's metric trend line. ISO date (YYYY-MM-DD). */
export interface TrendPoint {
  date: string;
  value: number;
}

/** A tiered benchmark band (e.g. JV / Varsity / Elite). null = open-ended. */
export interface TierBand {
  name: string;
  min: number | null;
  max: number | null;
  color: string;
}

/** A single-value benchmark threshold line. */
export interface ThresholdLine {
  name: string;
  value: number;
  color: string;
}

/** How benchmarks render on a metric's trend chart. */
export type BenchmarkOverlay =
  | { kind: 'tiers'; tiers: TierBand[] }
  | { kind: 'thresholds'; lines: ThresholdLine[] }
  | { kind: 'none' };

/** Trend data for one metric over the report window. */
export interface MetricTrend {
  series: TrendPoint[];                  // ascending by date, >= 2 points
  direction: 'higher' | 'lower';         // higher-is-better vs lower-is-better
  delta: { from: number; to: number; pct: number }; // pct > 0 = improvement
  benchmark: BenchmarkOverlay;
}

/** Map of metric code -> trend. Present on a report only when showTrends is on. */
export type ReportTrends = Record<string, MetricTrend>;
```

- [ ] **Step 2: Verify it type-checks**

Run: `npm run check`
Expected: PASS (no new errors from this file).

- [ ] **Step 3: Commit**

```bash
git add packages/shared/report-trends-types.ts
git commit -m "feat(reports): add shared trend/overlay types"
```

---

## Task 2: Pure trend assembly (`assembleTrends`)

**Files:**
- Create: `packages/api/services/report-trends.ts`
- Test: `packages/api/services/report-trends.test.ts`

This is the core logic, kept DB-free so it is unit-testable. It receives raw measurement rows, the metric list, per-metric direction, and the already-computed benchmark comparisons, and returns the `trends` map.

- [ ] **Step 1: Write the failing test**

```typescript
// packages/api/services/report-trends.test.ts
import { describe, it, expect } from 'vitest';
import { assembleTrends, deriveOverlay } from './report-trends';

// Minimal shape of a measurement row used by assembleTrends.
const m = (metric: string, date: string, value: number) => ({ metric, date, value: String(value) });

describe('assembleTrends', () => {
  it('builds an ascending series with delta for a higher-is-better metric', () => {
    const rows = [m('VJ', '2026-02-01', 25.5), m('VJ', '2025-09-01', 18)]; // unordered
    const trends = assembleTrends(
      rows,
      ['VJ'],
      { VJ: 'higher' },
      { VJ: [] },
    );
    expect(trends.VJ.series.map(p => p.date)).toEqual(['2025-09-01', '2026-02-01']);
    expect(trends.VJ.series.map(p => p.value)).toEqual([18, 25.5]);
    expect(trends.VJ.direction).toBe('higher');
    expect(trends.VJ.delta.from).toBe(18);
    expect(trends.VJ.delta.to).toBe(25.5);
    expect(Math.round(trends.VJ.delta.pct)).toBe(42); // (25.5-18)/18*100
  });

  it('computes positive improvement pct for a lower-is-better metric', () => {
    const rows = [m('DASH', '2026-02-01', 4.92), m('DASH', '2025-09-01', 5.6)];
    const trends = assembleTrends(rows, ['DASH'], { DASH: 'lower' }, { DASH: [] });
    expect(trends.DASH.direction).toBe('lower');
    expect(trends.DASH.delta.from).toBe(5.6);
    expect(trends.DASH.delta.to).toBe(4.92);
    expect(Math.round(trends.DASH.delta.pct)).toBe(12); // (5.6-4.92)/5.6*100
  });

  it('omits metrics with fewer than 2 measurements', () => {
    const rows = [m('VJ', '2025-09-01', 18)];
    const trends = assembleTrends(rows, ['VJ'], { VJ: 'higher' }, { VJ: [] });
    expect(trends.VJ).toBeUndefined();
  });

  it('derives tier zones when comparisons carry allTiers', () => {
    const overlay = deriveOverlay([
      {
        benchmarkName: 'HS', benchmarkValue: 24, athleteValue: 25.5, meetsOrExceeds: true,
        percentageDiff: 0, comparisonOperator: 'range',
        allTiers: [
          { tierName: 'JV', tierColor: '#fde68a', tierOrder: 1, minValue: 20, maxValue: 24 },
          { tierName: 'Varsity', tierColor: '#86efac', tierOrder: 2, minValue: 24, maxValue: 28 },
        ],
      } as any,
    ]);
    expect(overlay.kind).toBe('tiers');
    if (overlay.kind === 'tiers') {
      expect(overlay.tiers).toHaveLength(2);
      expect(overlay.tiers[0]).toEqual({ name: 'JV', min: 20, max: 24, color: '#fde68a' });
    }
  });

  it('derives threshold lines for single-value comparisons', () => {
    const overlay = deriveOverlay([
      { benchmarkName: 'Target', benchmarkValue: 24, athleteValue: 25, meetsOrExceeds: true,
        percentageDiff: 0, comparisonOperator: 'gte' } as any,
    ]);
    expect(overlay).toEqual({ kind: 'thresholds', lines: [{ name: 'Target', value: 24, color: '#ef4444' }] });
  });

  it('returns none when there are no comparisons', () => {
    expect(deriveOverlay([])).toEqual({ kind: 'none' });
    expect(deriveOverlay(undefined)).toEqual({ kind: 'none' });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run packages/api/services/report-trends.test.ts`
Expected: FAIL with "Cannot find module './report-trends'".

- [ ] **Step 3: Implement `report-trends.ts`**

```typescript
// packages/api/services/report-trends.ts
import type {
  BenchmarkOverlay, MetricTrend, ReportTrends, TierBand, ThresholdLine,
} from '@shared/report-trends-types';

/** Minimal measurement row shape needed here (value is a decimal string). */
interface TrendMeasurementRow {
  metric: string;
  date: string;   // YYYY-MM-DD
  value: string;
}

/** Subset of a benchmark comparison we read for overlays. */
interface ComparisonLike {
  benchmarkName: string;
  benchmarkValue: number;
  allTiers?: Array<{
    tierName: string; tierColor: string; tierOrder: number;
    minValue: number | null; maxValue: number | null;
  }>;
}

const DEFAULT_THRESHOLD_COLOR = '#ef4444';

/** Convert a metric's benchmark comparisons into a chart overlay. */
export function deriveOverlay(comparisons: ComparisonLike[] | undefined): BenchmarkOverlay {
  if (!comparisons || comparisons.length === 0) return { kind: 'none' };

  const tiered = comparisons.find(c => c.allTiers && c.allTiers.length > 0);
  if (tiered?.allTiers) {
    const tiers: TierBand[] = tiered.allTiers
      .slice()
      .sort((a, b) => a.tierOrder - b.tierOrder)
      .map(t => ({ name: t.tierName, min: t.minValue, max: t.maxValue, color: t.tierColor }));
    return { kind: 'tiers', tiers };
  }

  const lines: ThresholdLine[] = comparisons.map(c => ({
    name: c.benchmarkName,
    value: c.benchmarkValue,
    color: DEFAULT_THRESHOLD_COLOR,
  }));
  return { kind: 'thresholds', lines };
}

/**
 * Build the per-metric trend map. Pure: no DB access.
 * @param rows           all in-window measurements for the athlete (any order)
 * @param metrics        metric codes selected on the report
 * @param directions     metric code -> 'higher' | 'lower' (lower = lower-is-better)
 * @param comparisons    metric code -> benchmark comparisons (from getBenchmarkComparisons)
 */
export function assembleTrends(
  rows: TrendMeasurementRow[],
  metrics: string[],
  directions: Record<string, 'higher' | 'lower'>,
  comparisons: Record<string, ComparisonLike[]>,
): ReportTrends {
  const trends: ReportTrends = {};

  for (const metric of metrics) {
    const series = rows
      .filter(r => r.metric === metric)
      .map(r => ({ date: r.date, value: parseFloat(r.value) }))
      .sort((a, b) => a.date.localeCompare(b.date));

    if (series.length < 2) continue;

    const direction = directions[metric] ?? 'higher';
    const from = series[0].value;
    const to = series[series.length - 1].value;
    const pct = from === 0 ? 0
      : direction === 'lower' ? ((from - to) / from) * 100
      : ((to - from) / from) * 100;

    const trend: MetricTrend = {
      series,
      direction,
      delta: { from, to, pct },
      benchmark: deriveOverlay(comparisons[metric]),
    };
    trends[metric] = trend;
  }

  return trends;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run packages/api/services/report-trends.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/api/services/report-trends.ts packages/api/services/report-trends.test.ts
git commit -m "feat(reports): pure assembleTrends + deriveOverlay with tests"
```

---

## Task 3: Wire `assembleTrends` into the backend report payload

**Files:**
- Modify: `packages/api/services/report-service.ts:51-67` (ReportConfig), `:161-171` (IndividualReportData), `:409-517` (generateIndividualReport body / return)

- [ ] **Step 1: Add `showTrends` to the `ReportConfig` interface**

In `packages/api/services/report-service.ts`, inside `interface ReportConfig` (ends at line 67), add before the closing brace:

```typescript
  showTrends?: boolean; // when true, individual reports include time-series trends
```

- [ ] **Step 2: Add `trends` to `IndividualReportData` and import the type**

At the top of the file with the other imports add:

```typescript
import { assembleTrends } from './report-trends';
import type { ReportTrends } from '@shared/report-trends-types';
```

In `interface IndividualReportData` (lines 161-171) add before the closing brace:

```typescript
  trends?: ReportTrends; // present only when reportConfig.showTrends is true
```

- [ ] **Step 3: Build trends in `generateIndividualReport` and add to the return**

In `generateIndividualReport`, after `benchmarkComparisons` is computed (line 449-455) and before the `athletePerformance` object, insert:

```typescript
    // Build time-series trends when the report opts in (additive; off by default)
    let trends: ReportTrends | undefined;
    if (config.showTrends) {
      const directions: Record<string, 'higher' | 'lower'> = {};
      for (const metric of config.metrics) {
        const info = await this.getMetricInfo(metric);
        directions[metric] = info.lowerIsBetter ? 'lower' : 'higher';
      }
      trends = assembleTrends(
        athleteMeasurements.map(m => ({
          metric: m.metric,
          date: typeof m.date === 'string' ? m.date : new Date(m.date).toISOString().split('T')[0],
          value: m.value,
        })),
        config.metrics,
        directions,
        benchmarkComparisons,
      );
    }
```

Then add `trends` to the returned object (currently lines 508-517):

```typescript
    return {
      reportType: 'individual',
      reportConfig: config,
      athlete: athletePerformance,
      generatedAt: new Date().toISOString(),
      metricLabels,
      metricUnits,
      metricExplanations,
      eventContext,
      trends,
    };
```

- [ ] **Step 4: Verify type-check passes**

Run: `npm run check`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/api/services/report-service.ts
git commit -m "feat(reports): populate trends in generateIndividualReport when showTrends is on"
```

---

## Task 4: Add `showTrends` to the report config zod schema

**Files:**
- Modify: `packages/shared/schema-original.ts:2176-2217` (insertReportSchema config object)

- [ ] **Step 1: Add the field to the zod config object**

In `insertReportSchema`, inside the `config: z.object({ ... })` (the object that already lists `metrics`, `benchmarks`, `compositeIndex`, `filters`, `athleteIds`, `athleteId`, `audience`), add:

```typescript
    showTrends: z.boolean().optional(),
```

- [ ] **Step 2: Verify type-check passes**

Run: `npm run check`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/shared/schema-original.ts
git commit -m "feat(reports): allow showTrends in report config schema"
```

---

## Task 5: Frontend report types

**Files:**
- Modify: `packages/web/src/types/report-types.ts:99-114` (IndividualReportConfig), `:135-155` (IndividualReportData)

- [ ] **Step 1: Add `showTrends` and `trends` to the frontend types**

At the top of `packages/web/src/types/report-types.ts` add:

```typescript
import type { ReportTrends } from '@shared/report-trends-types';
```

In `interface IndividualReportConfig` (lines 99-114) add:

```typescript
  showTrends?: boolean;
```

In `interface IndividualReportData` (lines 135-155) add:

```typescript
  trends?: ReportTrends;
```

- [ ] **Step 2: Verify type-check passes**

Run: `npm run check`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/types/report-types.ts
git commit -m "feat(reports): add showTrends/trends to frontend report types"
```

---

## Task 6: Pure chart helpers (`trend-utils.ts`)

**Files:**
- Create: `packages/web/src/components/charts/trend-utils.ts`
- Test: `packages/web/src/components/charts/trend-utils.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/web/src/components/charts/trend-utils.test.ts
import { describe, it, expect } from 'vitest';
import { shouldReverseYAxis, formatDelta, currentTierName } from './trend-utils';
import type { BenchmarkOverlay } from '@shared/report-trends-types';

describe('trend-utils', () => {
  it('reverses the y-axis only for lower-is-better metrics', () => {
    expect(shouldReverseYAxis('lower')).toBe(true);
    expect(shouldReverseYAxis('higher')).toBe(false);
  });

  it('formats improvement with an up arrow and rounded percent', () => {
    expect(formatDelta({ from: 18, to: 25.5, pct: 41.7 })).toBe('▲ +42%');
  });

  it('formats a decline with a down arrow', () => {
    expect(formatDelta({ from: 25, to: 20, pct: -20 })).toBe('▼ 20%');
  });

  it('finds the tier a value falls into', () => {
    const overlay: BenchmarkOverlay = {
      kind: 'tiers',
      tiers: [
        { name: 'JV', min: 20, max: 24, color: '#a' },
        { name: 'Varsity', min: 24, max: 28, color: '#b' },
      ],
    };
    expect(currentTierName(overlay, 25.5)).toBe('Varsity');
    expect(currentTierName(overlay, 21)).toBe('JV');
    expect(currentTierName(overlay, 30)).toBe('Varsity'); // above top -> best tier
    expect(currentTierName({ kind: 'none' }, 10)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run packages/web/src/components/charts/trend-utils.test.ts`
Expected: FAIL with "Cannot find module './trend-utils'".

- [ ] **Step 3: Implement `trend-utils.ts`**

```typescript
// packages/web/src/components/charts/trend-utils.ts
import type { AnnotationOptions } from 'chartjs-plugin-annotation';
import type { BenchmarkOverlay, MetricTrend } from '@shared/report-trends-types';
import { parseColorToRgba } from '@/lib/color-utils';

export function shouldReverseYAxis(direction: 'higher' | 'lower'): boolean {
  return direction === 'lower';
}

export function formatDelta(delta: { pct: number }): string {
  const rounded = Math.round(delta.pct);
  if (rounded > 0) return `▲ +${rounded}%`;
  if (rounded < 0) return `▼ ${Math.abs(rounded)}%`;
  return '→ 0%';
}

/** Which tier does `value` fall in? Above the top band counts as the best tier. */
export function currentTierName(overlay: BenchmarkOverlay, value: number): string | null {
  if (overlay.kind !== 'tiers' || overlay.tiers.length === 0) return null;
  for (const t of overlay.tiers) {
    const aboveMin = t.min == null || value >= t.min;
    const belowMax = t.max == null || value < t.max;
    if (aboveMin && belowMax) return t.name;
  }
  // Above the highest max -> best (last) tier
  const top = overlay.tiers[overlay.tiers.length - 1];
  if (top.max != null && value >= top.max) return top.name;
  return null;
}

/** Build Chart.js annotation map (tier boxes or threshold lines) for an overlay. */
export function overlayToAnnotations(overlay: BenchmarkOverlay): Record<string, AnnotationOptions> {
  const out: Record<string, AnnotationOptions> = {};
  if (overlay.kind === 'tiers') {
    overlay.tiers.forEach((t, i) => {
      out[`tier-${i}`] = {
        type: 'box',
        yMin: t.min ?? undefined,
        yMax: t.max ?? undefined,
        backgroundColor: parseColorToRgba(t.color, 0.35),
        borderWidth: 0,
        label: { display: true, content: t.name, position: 'start', color: '#475569', font: { size: 10 } },
      } as AnnotationOptions;
    });
  } else if (overlay.kind === 'thresholds') {
    overlay.lines.forEach((l, i) => {
      out[`line-${i}`] = {
        type: 'line',
        yMin: l.value,
        yMax: l.value,
        borderColor: l.color,
        borderWidth: 2,
        borderDash: [5, 5],
        label: { display: true, content: l.name, position: 'end', backgroundColor: l.color, color: 'white', padding: 4, font: { size: 10 } },
      } as AnnotationOptions;
    });
  }
  return out;
}

/** Build a single-series Chart.js dataset config from a metric trend. */
export function buildTrendChartData(trend: MetricTrend, label: string) {
  return {
    labels: trend.series.map(p => new Date(p.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })),
    datasets: [
      {
        label,
        data: trend.series.map(p => p.value),
        borderColor: 'rgba(37, 99, 235, 1)',
        backgroundColor: 'rgba(37, 99, 235, 0.1)',
        borderWidth: 2.5,
        pointRadius: 3,
        pointBackgroundColor: 'rgba(37, 99, 235, 1)',
        fill: false,
        tension: 0.1,
      },
    ],
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run packages/web/src/components/charts/trend-utils.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/components/charts/trend-utils.ts packages/web/src/components/charts/trend-utils.test.ts
git commit -m "feat(charts): pure trend-utils (axis flip, delta, tiers, annotations) with tests"
```

---

## Task 7: `BenchmarkTrendChart` component

**Files:**
- Create: `packages/web/src/components/charts/BenchmarkTrendChart.tsx`

Renders one metric's trend as a Chart.js line with tier zones / threshold lines and the per-metric axis flip. The wrapper carries `data-chart-metric` so the PDF capture step can find it.

- [ ] **Step 1: Create the component**

```tsx
// packages/web/src/components/charts/BenchmarkTrendChart.tsx
import { useMemo } from 'react';
import type { ChartOptions } from 'chart.js';
import type { AnnotationOptions } from 'chartjs-plugin-annotation';
import { Line } from 'react-chartjs-2';
import type { MetricTrend } from '@shared/report-trends-types';
import { buildTrendChartData, overlayToAnnotations, shouldReverseYAxis } from './trend-utils';

// Chart.js + annotation plugin are registered globally in lib/chart-setup.ts

interface BenchmarkTrendChartProps {
  metricCode: string;
  trend: MetricTrend;
  label: string;
  unit?: string;
}

export function BenchmarkTrendChart({ metricCode, trend, label, unit }: BenchmarkTrendChartProps) {
  const data = useMemo(() => buildTrendChartData(trend, label), [trend, label]);
  const annotations = useMemo<Record<string, AnnotationOptions>>(
    () => overlayToAnnotations(trend.benchmark),
    [trend.benchmark],
  );

  const options: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false, // deterministic render for PDF capture
    plugins: {
      legend: { display: false },
      title: { display: true, text: label, font: { size: 14, weight: 'bold' } },
      subtitle: {
        display: true,
        text: trend.direction === 'lower' ? 'Lower is better · axis flipped so up = improvement' : 'Higher is better',
        font: { size: 10 },
      },
      annotation: Object.keys(annotations).length > 0 ? { annotations } : undefined,
    },
    scales: {
      x: { title: { display: true, text: 'Date' } },
      y: {
        reverse: shouldReverseYAxis(trend.direction),
        title: { display: true, text: unit ? `${label} (${unit})` : label },
      },
    },
  };

  return (
    <div
      data-chart-metric={metricCode}
      className="w-full h-[300px]"
      role="img"
      aria-label={`Progress over time for ${label}`}
    >
      <Line data={data} options={options} />
    </div>
  );
}

export default BenchmarkTrendChart;
```

- [ ] **Step 2: Verify type-check passes**

Run: `npm run check`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/components/charts/BenchmarkTrendChart.tsx
git commit -m "feat(charts): BenchmarkTrendChart with tier zones and axis flip"
```

---

## Task 8: `TrendSection` component (cards + charts, reused by both views)

**Files:**
- Create: `packages/web/src/components/reports/TrendSection.tsx`

- [ ] **Step 1: Create the component**

```tsx
// packages/web/src/components/reports/TrendSection.tsx
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { ReportTrends } from '@shared/report-trends-types';
import { BenchmarkTrendChart } from '@/components/charts/BenchmarkTrendChart';
import { formatDelta, currentTierName } from '@/components/charts/trend-utils';

interface TrendSectionProps {
  trends: ReportTrends;
  metricLabels?: Record<string, string>;
  metricUnits?: Record<string, string>;
}

export function TrendSection({ trends, metricLabels = {}, metricUnits = {} }: TrendSectionProps) {
  const entries = Object.entries(trends);
  if (entries.length === 0) return null;

  return (
    <Card data-testid="trend-section">
      <CardHeader>
        <CardTitle>Progress Over Time</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* At-a-glance cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {entries.map(([code, trend]) => {
            const label = metricLabels[code] || code;
            const unit = metricUnits[code] || '';
            const tier = currentTierName(trend.benchmark, trend.delta.to);
            const improving = trend.delta.pct > 0;
            return (
              <div key={code} className="border rounded-lg p-3">
                <div className="text-xs text-muted-foreground">{label}</div>
                <div className="text-xl font-bold">{trend.delta.to}{unit ? ` ${unit}` : ''}</div>
                <div className="flex flex-wrap gap-1 mt-1">
                  <Badge variant={improving ? 'default' : 'secondary'}>{formatDelta(trend.delta)}</Badge>
                  {tier && <Badge variant="outline">{tier}</Badge>}
                </div>
              </div>
            );
          })}
        </div>

        {/* Detail charts */}
        <div className="space-y-8">
          {entries.map(([code, trend]) => (
            <BenchmarkTrendChart
              key={code}
              metricCode={code}
              trend={trend}
              label={metricLabels[code] || code}
              unit={metricUnits[code]}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export default TrendSection;
```

- [ ] **Step 2: Verify type-check passes**

Run: `npm run check`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/components/reports/TrendSection.tsx
git commit -m "feat(reports): reusable TrendSection (progress cards + charts)"
```

---

## Task 9: Render `TrendSection` in the live individual report view

**Files:**
- Modify: `packages/web/src/components/reports/IndividualReportView.tsx:111` (destructure) and the section list (after the Performance Table, ~line 250)

- [ ] **Step 1: Import and destructure trends**

Add the import near the other component imports:

```typescript
import { TrendSection } from '@/components/reports/TrendSection';
```

Update the destructure at line 111 to also pull `trends`:

```typescript
const { athlete, metricLabels, metricUnits, metricExplanations, trends } = reportData;
```

- [ ] **Step 2: Render the section after the Performance Table**

Immediately after the Performance Table `Card` closes (around line 250, before the metrics glossary), add:

```tsx
{trends && Object.keys(trends).length > 0 && (
  <TrendSection trends={trends} metricLabels={metricLabels} metricUnits={metricUnits} />
)}
```

- [ ] **Step 3: Verify type-check + build the web app**

Run: `npm run check`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/components/reports/IndividualReportView.tsx
git commit -m "feat(reports): show TrendSection in live individual report view"
```

---

## Task 10: Render `TrendSection` on the public report page

**Files:**
- Modify: `packages/web/src/pages/public-report.tsx:57` (destructure) and the individual-render block (~lines 250-358)

Note: the public page reads `snapshotData` (the snapshotted output of `generateIndividualReport`). `trends` rides inside it. Confirm the access path against the file: the trends live at `snapshotData.trends` (mirrors how `metricExplanations` is read at line 58).

- [ ] **Step 1: Import and read trends from the snapshot**

Add import:

```typescript
import { TrendSection } from '@/components/reports/TrendSection';
import type { ReportTrends } from '@shared/report-trends-types';
```

Where `metricExplanations` is read (line 58), add:

```typescript
const trends = (snapshotData.trends ?? undefined) as ReportTrends | undefined;
const metricLabels = (snapshotData.metricLabels ?? {}) as Record<string, string>;
const metricUnits = (snapshotData.metricUnits ?? {}) as Record<string, string>;
```

- [ ] **Step 2: Render the section inside the individual block**

Inside the `reportConfig.reportType === "individual"` block (after the Performance Table card, ~line 350), add:

```tsx
{trends && Object.keys(trends).length > 0 && (
  <TrendSection trends={trends} metricLabels={metricLabels} metricUnits={metricUnits} />
)}
```

- [ ] **Step 3: Verify type-check passes**

Run: `npm run check`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/pages/public-report.tsx
git commit -m "feat(reports): show TrendSection on public report page"
```

---

## Task 11: `showTrends` toggle in the report wizard

**Files:**
- Modify: `packages/web/src/components/reports/ReportWizard.tsx:58` (schema), `:128` (watch), `:841-850` (checkbox region), config assembly in `onSubmit` (~line 322)

Mirror the existing `enableCompositeIndex` pattern exactly.

- [ ] **Step 1: Add to the form schema**

Near line 58 (with `enableCompositeIndex`):

```typescript
showTrends: z.boolean().default(false),
```

- [ ] **Step 2: Watch the value**

Near line 128:

```typescript
const showTrends = watch("showTrends");
```

- [ ] **Step 3: Render the checkbox**

Copy the `enableCompositeIndex` checkbox block (lines 841-850) and adapt. Place it in the same options area, ideally gated to individual reports (where `reportType === 'individual'`):

```tsx
<div className="flex items-center space-x-2">
  <Checkbox
    id="showTrends"
    checked={showTrends}
    onCheckedChange={(checked) => setValue("showTrends", checked as boolean)}
  />
  <Label htmlFor="showTrends" className="cursor-pointer">
    Show progress over time
  </Label>
</div>
```

- [ ] **Step 4: Include it in the submitted config**

In `onSubmit` where the `config` object is assembled (~line 322), add `showTrends` to the config payload:

```typescript
showTrends: data.showTrends,
```

- [ ] **Step 5: Verify type-check passes**

Run: `npm run check`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/web/src/components/reports/ReportWizard.tsx
git commit -m "feat(reports): add 'Show progress over time' toggle to report wizard"
```

---

## Task 12: Chart-to-PNG capture helpers

**Files:**
- Modify: `packages/web/src/lib/chartExport.ts` (add two exports near the existing `exportChartAsPNG`, ~line 135)

- [ ] **Step 1: Add `getChartPngDataUrl` and `captureTrendCharts`**

```typescript
/**
 * Render a DOM element (e.g. a chart card) to a PNG data URL via html2canvas.
 * Returns the data URL string (does not trigger a download).
 */
export async function getChartPngDataUrl(containerElement: HTMLElement): Promise<string> {
  const html2canvas = (await import('html2canvas')).default;
  const canvas = await html2canvas(containerElement, {
    backgroundColor: '#ffffff',
    scale: 2,
    logging: false,
    useCORS: true,
  });
  return canvas.toDataURL('image/png');
}

/**
 * Capture every BenchmarkTrendChart currently in the DOM.
 * Each chart wrapper carries data-chart-metric={metricCode}.
 */
export async function captureTrendCharts(): Promise<Array<{ metricCode: string; dataUrl: string }>> {
  const nodes = Array.from(document.querySelectorAll<HTMLElement>('[data-chart-metric]'));
  const out: Array<{ metricCode: string; dataUrl: string }> = [];
  for (const node of nodes) {
    const metricCode = node.getAttribute('data-chart-metric');
    if (!metricCode) continue;
    out.push({ metricCode, dataUrl: await getChartPngDataUrl(node) });
  }
  return out;
}
```

- [ ] **Step 2: Verify type-check passes**

Run: `npm run check`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/lib/chartExport.ts
git commit -m "feat(charts): add getChartPngDataUrl + captureTrendCharts helpers"
```

---

## Task 13: Embed chart images in the PDF (backend)

**Files:**
- Modify: `packages/api/routes/report-routes.ts` — `generatePDF` (line 3532) signature + new helper `addTrendChartsToPdf`; add POST routes after the GET routes (after line 1437)

- [ ] **Step 1: Add the `chartImages` param to `generatePDF`**

Change the signature (line 3532):

```typescript
async function generatePDF(
  report: any,
  reportData: any,
  format: 'visual' | 'simplified' = 'simplified',
  org?: ReportOrg,
  chartImages: Array<{ metricCode: string; dataUrl: string }> = [],
): Promise<jsPDF> {
```

- [ ] **Step 2: Add the `addTrendChartsToPdf` helper**

Add this function just above `generatePDF` (before line 3532). It uses the same jsPDF APIs already in the file (`addPage`, `addImage`, `getImageProperties`, `pageWidth`).

```typescript
function addTrendChartsToPdf(
  doc: jsPDF,
  chartImages: Array<{ metricCode: string; dataUrl: string }>,
  metricLabels: Record<string, string> = {},
): void {
  if (!chartImages.length) return;
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 14;
  const imgWidth = pageWidth - margin * 2;

  for (const img of chartImages) {
    doc.addPage();
    doc.setFontSize(16);
    doc.setTextColor(40, 40, 40);
    doc.text(metricLabels[img.metricCode] || img.metricCode, margin, 20);

    // Preserve aspect ratio from the captured PNG
    const props = doc.getImageProperties(img.dataUrl);
    const imgHeight = (props.height / props.width) * imgWidth;
    doc.addImage(img.dataUrl, 'PNG', margin, 28, imgWidth, imgHeight);
  }
}
```

- [ ] **Step 3: Call the helper at the end of the individual report path**

Near the end of `generatePDF`, after the individual report content is rendered and before the function returns the doc, add:

```typescript
  if (reportData.reportType === 'individual' && chartImages.length > 0) {
    addTrendChartsToPdf(doc, chartImages, reportData.metricLabels || {});
  }
```

- [ ] **Step 4: Add POST PDF routes that accept chart images**

After the existing `GET /api/public/reports/:token/pdf` handler (ends ~line 1437), add the two POST handlers. They mirror the GET handlers but read `chartImages` from the body.

```typescript
// Authenticated PDF with client-captured chart images
app.post(
  "/api/reports/:id/pdf",
  reportGenerationLimiter,
  requireAuth,
  async (req, res) => {
    try {
      const reportId = req.params.id;
      const { athleteId, format = 'simplified', chartImages = [] } = req.body || {};
      const report = await reportService.getReportById(reportId, (req.user as any).id);
      if (!report) return res.status(404).json({ message: "Report not found" });
      const reportData = report.reportType === 'team'
        ? await reportService.generateTeamReport(reportId, (req.user as any).id)
        : await reportService.generateIndividualReport(reportId, (req.user as any).id, athleteId);
      const org = await getReportOrg(report.organizationId);
      const pdf = await generatePDF(report, reportData, format, org, chartImages);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${sanitizeFilename(report.name)}.pdf"`);
      res.send(Buffer.from(pdf.output("arraybuffer")));
    } catch (err) {
      console.error('[POST /api/reports/:id/pdf]', err);
      res.status(500).json({ message: "Failed to generate PDF" });
    }
  }
);

// Public PDF with client-captured chart images
app.post(
  "/api/public/reports/:token/pdf",
  publicSnapshotLimiter,
  async (req, res) => {
    try {
      const token = req.params.token;
      const { format = 'simplified', chartImages = [] } = req.body || {};
      const snapshot = await reportService.getPublicSnapshot(token);
      if (!snapshot) return res.status(404).json({ message: "Report not found" });
      const report = snapshot.report ?? { name: snapshot.snapshotData?.athlete?.userName || 'Report', reportType: 'individual', organizationId: snapshot.organizationId };
      const org = await getReportOrg(report.organizationId);
      const pdf = await generatePDF(report, snapshot.snapshotData, format, org, chartImages);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${sanitizeFilename(report.name)}.pdf"`);
      res.send(Buffer.from(pdf.output("arraybuffer")));
    } catch (err) {
      console.error('[POST /api/public/reports/:token/pdf]', err);
      res.status(500).json({ message: "Failed to generate PDF" });
    }
  }
);
```

Note: match the exact helper names already used by the GET handlers in this file (`getReportOrg`, `reportService.getReportById`, `reportService.getPublicSnapshot`, `sanitizeFilename`). If a GET handler uses a slightly different accessor (e.g. inlines the org lookup), copy that exact code rather than the names above.

- [ ] **Step 5: Verify type-check passes**

Run: `npm run check`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/api/routes/report-routes.ts
git commit -m "feat(reports): POST PDF routes that embed client-captured trend charts"
```

---

## Task 14: Send captured charts from the client PDF download

**Files:**
- Modify: `packages/web/src/hooks/use-report-pdf.ts:61-108` (downloadPdf)

- [ ] **Step 1: Capture charts and POST them**

Replace the `fetch` GET call (line 78) so it captures any rendered trend charts and POSTs them. Add the import at top:

```typescript
import { captureTrendCharts } from '@/lib/chartExport';
```

Replace the request block inside `downloadPdf`:

```typescript
    const chartImages = await captureTrendCharts();

    const response = await fetch(`/api/reports/${reportId}/pdf`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ format, athleteId, chartImages }),
    });
```

The rest of the function (blob → download link) is unchanged.

- [ ] **Step 2: Wire the public page "Download PDF" button**

In `packages/web/src/pages/public-report.tsx`, find the existing PDF download handler (grep `pdf` in this file). Change it to capture charts and POST:

```typescript
import { captureTrendCharts } from '@/lib/chartExport';

async function handleDownloadPdf() {
  const chartImages = await captureTrendCharts();
  const res = await fetch(`/api/public/reports/${token}/pdf`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ format: 'visual', chartImages }),
  });
  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'report.pdf';
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(url);
  document.body.removeChild(a);
}
```

(If the public page does not yet have a download button, add one that calls `handleDownloadPdf`.)

- [ ] **Step 3: Verify type-check passes**

Run: `npm run check`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/hooks/use-report-pdf.ts packages/web/src/pages/public-report.tsx
git commit -m "feat(reports): capture and POST trend charts for PDF export (live + public)"
```

---

## Task 15: Integration test — generate + PDF

**Files:**
- Create: `tests/integration/report-trends.test.ts`

Follow the existing integration-test setup in `tests/integration/` (DB/test-app harness). Use the helpers/fixtures already present there — open a sibling test (e.g. an existing `report*.test.ts`) and copy its app/auth/seed bootstrap. The two behaviors to assert:

- [ ] **Step 1: Write the tests**

```typescript
// tests/integration/report-trends.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
// import { buildTestApp, seedAthleteWithMeasurements, authedAgent } from './helpers'; // match existing harness

describe('report trends integration', () => {
  // Reuse the existing integration bootstrap (see sibling report tests for exact helpers).

  it('includes trends only when showTrends is true', async () => {
    // Seed an athlete with >= 2 VERTICAL_JUMP measurements on different dates in the window.
    // Create a report with config.showTrends = true and generate it:
    const withTrends = await authedAgent
      .post(`/api/reports/${reportIdWithTrends}/generate`)
      .send({ athleteId });
    expect(withTrends.body.data.trends).toBeDefined();
    expect(withTrends.body.data.trends.VERTICAL_JUMP.series.length).toBeGreaterThanOrEqual(2);

    // A second report with showTrends omitted/false must NOT include trends and
    // must keep the existing single-value fields unchanged.
    const withoutTrends = await authedAgent
      .post(`/api/reports/${reportIdNoTrends}/generate`)
      .send({ athleteId });
    expect(withoutTrends.body.data.trends).toBeUndefined();
    expect(withoutTrends.body.data.athlete.measurements).toBeDefined();
  });

  it('POST /api/reports/:id/pdf embeds chart images and returns a PDF', async () => {
    // 1x1 transparent PNG data URL
    const px = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const res = await authedAgent
      .post(`/api/reports/${reportIdWithTrends}/pdf`)
      .send({ athleteId, format: 'visual', chartImages: [{ metricCode: 'VERTICAL_JUMP', dataUrl: px }] });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
    expect(res.body.length || res.text.length).toBeGreaterThan(1000); // non-empty PDF
  });
});
```

- [ ] **Step 2: Fill in the harness bootstrap**

Open an existing `tests/integration/report*.test.ts`, copy its exact app-build / auth / seeding helpers into this file (replace the commented import and the `reportIdWithTrends` / `reportIdNoTrends` / `athleteId` / `authedAgent` placeholders with real setup). Do not invent helpers — use what the sibling test uses.

- [ ] **Step 3: Run the test**

Run: `npx vitest run tests/integration/report-trends.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add tests/integration/report-trends.test.ts
git commit -m "test(reports): integration coverage for trends payload + PDF embedding"
```

---

## Task 16: E2E test + screenshots

**Files:**
- Create: `tests/e2e/report-trends.spec.ts`

Model this on an existing report E2E spec (copy login/setup from a sibling `tests/e2e/*report*.spec.ts` or `tests/e2e/athlete-crud.spec.ts`).

- [ ] **Step 1: Write the E2E spec**

```typescript
// tests/e2e/report-trends.spec.ts
import { test, expect } from '@playwright/test';
// import { login, seedReportWithTrends } from './helpers'; // match existing E2E helpers

test.describe('individual report trends', () => {
  test('toggle on shows the trend section and charts', async ({ page }) => {
    // login + navigate to an individual report that has showTrends enabled and an athlete with >=2 measurements
    await page.goto('/reports'); // adjust to the report view route used in the app
    // open the report, generate for an athlete...
    await expect(page.getByTestId('trend-section')).toBeVisible();
    await expect(page.locator('[data-chart-metric]').first()).toBeVisible();

    // Screenshots (project convention)
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.screenshot({ path: 'screenshots/report-trends-desktop.png', fullPage: true });
    await page.setViewportSize({ width: 375, height: 667 });
    await page.screenshot({ path: 'screenshots/report-trends-mobile.png', fullPage: true });
  });

  test('public shared link renders the trend charts', async ({ page }) => {
    // create/share snapshot, open the public token URL
    // await page.goto(`/public/reports/${token}`);
    await expect(page.locator('[data-chart-metric]').first()).toBeVisible();
  });
});
```

- [ ] **Step 2: Fill in helpers from a sibling spec**

Replace the commented helper imports and setup with the real login/seed/share flow used by an existing report E2E spec.

- [ ] **Step 3: Run the E2E spec**

Run: `npx playwright test tests/e2e/report-trends.spec.ts --config=playwright.staging.config.ts`
Expected: PASS; `screenshots/report-trends-desktop.png` and `screenshots/report-trends-mobile.png` created.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/report-trends.spec.ts screenshots/report-trends-desktop.png screenshots/report-trends-mobile.png
git commit -m "test(reports): E2E for trend section (live + public) with screenshots"
```

---

## Task 17: Full verification

- [ ] **Step 1: Type-check the whole repo**

Run: `npm run check`
Expected: PASS.

- [ ] **Step 2: Run unit + integration suite**

Run: `npm run test`
Expected: PASS, including `report-trends`, `trend-utils`, and the new integration test.

- [ ] **Step 3: Manual smoke (per UI screenshot convention)**

Start the app (`npm run dev`), create an individual report with "Show progress over time" on for an athlete with ≥2 measurements across dates, confirm: cards + zone charts render; lower-is-better metric shows axis flipped; share link renders charts; "Download PDF" produces a PDF whose later pages contain the charts.

- [ ] **Step 4: Final commit (if any cleanup)**

```bash
git add -A
git commit -m "chore(reports): finalize time-range progress view"
```

---

## Self-Review Notes (spec coverage)

- Toggle on existing individual report → Tasks 4, 5, 11.
- Raw measurements, ascending, <2-point fallback → Task 2 (assembleTrends).
- Progress cards + zone charts, axis flip for lower-is-better → Tasks 6, 7, 8.
- Benchmark overlay rules (tiers vs thresholds vs none) → Task 2 (deriveOverlay) + Task 6 (annotations).
- Additive payload, existing reports unchanged when off → Task 3 (gated on `config.showTrends`), asserted in Task 15.
- Web view + public page render (two separate paths) → Tasks 9, 10 via shared TrendSection.
- PDF via client capture + embed (live + public) → Tasks 12, 13, 14.
- TDD layers (unit/integration/E2E) + screenshots → Tasks 2, 6, 15, 16.

**Known follow-ups (out of scope, by design):** team/program-wide aggregate trends; time-bucketing; percentile-over-time. The shared `MetricTrend` contract and `TrendSection` are general enough to extend to team trends later.

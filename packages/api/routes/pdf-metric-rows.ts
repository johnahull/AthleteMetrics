// packages/api/routes/pdf-metric-rows.ts
import type { MetricGroup } from '@shared/metric-order';

export type PdfCell = string | { content: string; colSpan: number; styles: { fontStyle: 'bold'; fillColor: [number, number, number] } };
export type PdfRow = PdfCell[];
type DurationText = (metric: string, value: number) => string | null;

const headingRow = (label: string, colSpan: number): PdfRow => [
  { content: label, colSpan, styles: { fontStyle: 'bold', fillColor: [241, 245, 249] } },
];

/**
 * Walks the metrics present in `data` in group order, calling `build` per metric. Each group that produced
 * rows gets a heading first and `onRows` receives that group's rows (so callers can track per-row metadata).
 * Without `metricGroups` (data from before grouping) it keeps entry order and adds no headings.
 */
function groupedRows<T, R>(
  data: Record<string, T>,
  metricGroups: MetricGroup[] | undefined,
  colSpan: number,
  build: (metric: string, value: T) => R[],
  onRows: (rows: R[], heading: PdfRow | null) => void,
): void {
  const groups = metricGroups?.length
    ? metricGroups.map((g) => ({ label: g.label as string | null, codes: g.codes }))
    : [{ label: null, codes: Object.keys(data) }];
  for (const { label, codes } of groups) {
    const rows = codes.filter((c) => c in data).flatMap((c) => build(c, data[c]));
    if (rows.length > 0) onRows(rows, label ? headingRow(label, colSpan) : null);
  }
}

export function buildMeasurementRows(args: {
  measurements: Record<string, number>;
  percentiles: Record<string, number>;
  labels: Record<string, string>;
  units: Record<string, string>;
  showPercentile: boolean;
  durationText: DurationText;
  metricGroups?: MetricGroup[];
}): PdfRow[] {
  const { measurements, percentiles, labels, units, showPercentile, durationText, metricGroups } = args;
  const out: PdfRow[] = [];
  groupedRows(measurements, metricGroups, showPercentile ? 3 : 2, (metric, value) => {
    const label = labels[metric] || metric;
    const unit = units[metric] || '';
    const formatted = durationText(metric, value) ?? `${value.toFixed(2)}${unit ? ` ${unit}` : ''}`;
    return [showPercentile ? [label, formatted, percentiles?.[metric]?.toFixed(1) || 'N/A'] : [label, formatted]];
  }, (rows, heading) => out.push(...(heading ? [heading] : []), ...rows));
  return out;
}

/** Tier rows carry a parallel `tierColors` array (null for heading rows) for the table's didParseCell. */
export function buildBenchmarkRows(args: {
  benchmarkComparisons: Record<string, any[]>;
  labels: Record<string, string>;
  units: Record<string, string>;
  durationText: DurationText;
  metricGroups?: MetricGroup[];
}): { tierRows: PdfRow[]; tierColors: Array<string | null>; singleRows: PdfRow[] } {
  const { benchmarkComparisons, labels, units, durationText, metricGroups } = args;
  const tierRows: PdfRow[] = [];
  const tierColors: Array<string | null> = [];
  const singleRows: PdfRow[] = [];

  const fmt = (metric: string, value: number, unit: string) =>
    durationText(metric, value) ?? `${value.toFixed(2)}${unit ? ` ${unit}` : ''}`;

  const tierItems = (metric: string, comparisons: any[]): Array<{ row: PdfRow; color: string }> => {
    const label = labels[metric] || metric;
    const unit = units[metric] || '';
    const items: Array<{ row: PdfRow; color: string }> = [];
    for (const comp of comparisons) {
      if (!comp.tierName) continue;
      let tierLabel = comp.tierName;
      if (comp.isBestTier) {
        tierLabel += ' [Best]';
      } else if (comp.distanceToNextTier != null && comp.nextTierName) {
        const dist = comp.distanceToNextTier < 1
          ? comp.distanceToNextTier.toFixed(2)
          : comp.distanceToNextTier.toFixed(1);
        tierLabel += ` (${durationText(metric, comp.distanceToNextTier) ?? `${dist}${unit ? ` ${unit}` : ''}`} to ${comp.nextTierName})`;
      }
      const rankPrefix = comp.tierOrder ? `#${comp.tierOrder} ` : '';
      // Newline-separated so autoTable wraps the per-tier coaching note (migration 0137) below the label
      const tierCellText = comp.coachingNote
        ? `${rankPrefix}${tierLabel}\n${comp.coachingNote}`
        : `${rankPrefix}${tierLabel}`;
      items.push({
        row: [label, comp.tierGroupName || comp.benchmarkName, tierCellText, fmt(metric, comp.athleteValue, unit)],
        color: comp.tierColor || 'gray',
      });
    }
    return items;
  };

  const singleItems = (metric: string, comparisons: any[]): PdfRow[] => {
    const label = labels[metric] || metric;
    const unit = units[metric] || '';
    return comparisons.filter((comp) => !comp.tierName).map((comp) => [
      label,
      comp.benchmarkName,
      fmt(metric, comp.benchmarkValue, unit),
      fmt(metric, comp.athleteValue, unit),
      comp.meetsOrExceeds ? 'Yes' : 'No',
    ]);
  };

  groupedRows(benchmarkComparisons, metricGroups, 4, tierItems, (items, heading) => {
    if (heading) { tierRows.push(heading); tierColors.push(null); }
    for (const { row, color } of items) { tierRows.push(row); tierColors.push(color); }
  });
  groupedRows(benchmarkComparisons, metricGroups, 5, singleItems, (rows, heading) => {
    singleRows.push(...(heading ? [heading] : []), ...rows);
  });
  return { tierRows, tierColors, singleRows };
}

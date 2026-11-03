import { groupMetricCodes, type MetricGroup } from '@shared/metric-order';

export interface DisplayGroup {
  group: string | null;
  label: string | null;
  codes: string[];
}

/**
 * Splits metric codes into the server's `metricGroups`, in group order. Codes the server did not group, and
 * data from before grouping existed, form one unlabelled group (no heading) so nothing is dropped.
 */
export function groupedCodes(codes: string[], metricGroups?: MetricGroup[]): DisplayGroup[] {
  if (codes.length === 0) return [];
  if (!metricGroups?.length) return [{ group: null, label: null, codes }];
  const present = new Set(codes);
  const known = new Set(metricGroups.flatMap((g) => g.codes));
  const out: DisplayGroup[] = metricGroups
    .map((g) => ({ group: g.group as string, label: g.label as string, codes: g.codes.filter((c) => present.has(c)) }))
    .filter((g) => g.codes.length > 0);
  const rest = codes.filter((c) => !known.has(c));
  if (rest.length > 0) out.push({ group: null, label: null, codes: rest });
  return out;
}

interface PickerMetric {
  metricCode: string;
  customLabel?: string | null;
  siteMetric: { label: string; category?: string | null };
}

const naturalCompare = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
// "5-0-5 Agility (m, Left)" -> "5-0-5 Agility": the qualifier must not decide the order, or ")" vs "," puts Left before the base test
const sortKey = (label: string) => label.replace(/\s*\([^)]*\)\s*$/, '');

/**
 * Metrics for a picker, grouped like the generated report (fixed group order) and sorted by label inside each
 * group, numbers compared as numbers. The sort is stable, so labels that tie keep the built-in order
 * (base test, then Left, then Right).
 */
export function groupPickerMetrics<T extends PickerMetric>(metrics: T[]): { group: string; label: string; metrics: T[] }[] {
  const byCode = new Map(metrics.map((m) => [m.metricCode, m]));
  const categories = Object.fromEntries(metrics.map((m) => [m.metricCode, m.siteMetric.category]));
  const display = (m: T) => m.customLabel || m.siteMetric.label;
  return groupMetricCodes([...byCode.keys()], categories).map((g) => ({
    group: g.group,
    label: g.label,
    metrics: g.codes.map((c) => byCode.get(c)!).sort((a, b) => naturalCompare(sortKey(display(a)), sortKey(display(b)))),
  }));
}

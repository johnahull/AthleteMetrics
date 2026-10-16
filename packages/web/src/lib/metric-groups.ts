import type { MetricGroup } from '@shared/metric-order';

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

/** code -> its group id and label, for charts that put a heading at each group change. */
export function groupLookup(metricGroups?: MetricGroup[]): (code: string) => { group: string; label: string } | undefined {
  const map = new Map<string, { group: string; label: string }>();
  for (const g of metricGroups ?? []) for (const c of g.codes) map.set(c, { group: g.group, label: g.label });
  return (code) => map.get(code);
}

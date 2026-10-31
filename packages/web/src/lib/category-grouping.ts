/**
 * Pure grouping of metrics / benchmarks by metric category for the list pages.
 * Category text is free-form in the DB, so it is normalized with the same rules reports use.
 */
import { METRIC_GROUP_ORDER, normalizeCategory } from "@shared/metric-order";

export interface CategoryGroupResult<T> {
  id: string;
  label: string;
  items: T[];
}

export interface MetricSubgroup<T> {
  metricCode: string;
  items: T[];
}

export interface CategoryMetricGroup<T> extends CategoryGroupResult<MetricSubgroup<T>> {
  /** Number of leaf items in the category, across all its metrics. */
  count: number;
}

const OTHER_ID = "other";

/**
 * Known categories in METRIC_GROUP_ORDER, then unrecognised non-empty ones (first-seen order,
 * case-insensitive), with "Other" (null / empty) always last. Empty groups are never returned.
 */
export function groupByCategory<T>(
  items: T[],
  getCategory: (item: T) => string | null | undefined,
): CategoryGroupResult<T>[] {
  const known = new Map<string, T[]>();
  const push = (key: string, item: T) => {
    const list = known.get(key);
    if (list) list.push(item);
    else known.set(key, [item]);
  };
  const unknown = new Map<string, { label: string; items: T[] }>();

  for (const item of items) {
    const raw = getCategory(item)?.trim();
    const group = normalizeCategory(raw);
    if (group) {
      push(group, item);
    } else if (raw) {
      const key = raw.toLowerCase();
      const entry = unknown.get(key) ?? { label: raw, items: [] };
      entry.items.push(item);
      unknown.set(key, entry);
    } else {
      push(OTHER_ID, item);
    }
  }

  const result: CategoryGroupResult<T>[] = [];
  for (const { id, label } of METRIC_GROUP_ORDER) {
    if (id === OTHER_ID) continue;
    const list = known.get(id);
    if (list) result.push({ id, label, items: list });
  }
  const usedIds = new Set<string>();
  for (const [key, { label, items: list }] of unknown) {
    const slug = key.replace(/[^a-z0-9_-]+/g, "-");
    let id = `custom--${slug}`;
    for (let n = 2; usedIds.has(id); n++) id = `custom--${slug}-${n}`;
    usedIds.add(id);
    result.push({ id, label, items: list });
  }
  const other = known.get(OTHER_ID);
  if (other) {
    const label = METRIC_GROUP_ORDER.find((g) => g.id === OTHER_ID)?.label ?? "Other";
    result.push({ id: OTHER_ID, label, items: other });
  }
  return result;
}

interface Tiered {
  tierGroupId?: string | null;
  tierOrder?: number | null;
}

/** Members of one tier group stay together (at the first member's position), ordered by tierOrder. */
function clusterTiers<T extends Tiered>(items: T[]): T[] {
  const byTier = new Map<string, T[]>();
  for (const item of items) {
    if (!item.tierGroupId) continue;
    const list = byTier.get(item.tierGroupId);
    if (list) list.push(item);
    else byTier.set(item.tierGroupId, [item]);
  }
  const emitted = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    const id = item.tierGroupId;
    if (!id) {
      out.push(item);
    } else if (!emitted.has(id)) {
      emitted.add(id);
      out.push(...[...byTier.get(id)!].sort((a, b) => (a.tierOrder ?? 0) - (b.tierOrder ?? 0)));
    }
  }
  return out;
}

/** Category -> metric -> benchmarks. Metrics keep first-seen order inside a category. */
export function groupByCategoryThenMetric<T extends Tiered>(
  items: T[],
  getMetricCode: (item: T) => string,
  getCategoryForMetric: (metricCode: string) => string | null | undefined,
): CategoryMetricGroup<T>[] {
  return groupByCategory(items, (item) => getCategoryForMetric(getMetricCode(item))).map((group) => {
    const byMetric = new Map<string, T[]>();
    for (const item of group.items) {
      const code = getMetricCode(item);
      const list = byMetric.get(code);
      if (list) list.push(item);
      else byMetric.set(code, [item]);
    }
    return {
      id: group.id,
      label: group.label,
      count: group.items.length,
      items: [...byMetric].map(([metricCode, list]) => ({ metricCode, items: clusterTiers(list) })),
    };
  });
}

/**
 * Duplicate rules of a device import commit (DeviceImportService.commitBatch), without database access.
 *
 * The unit is one run: (athlete, date, event, drill metric, runAt). The event is applied by the caller's pre-fetch.
 */
import { MetricType } from '@shared/schema/constants';

/** Earlier device rows of one run: every row id (drill row + splits) and the drill rows' values */
export interface EarlierRun {
  ids: string[];
  drillValues: number[];
}
export type EarlierRuns = Map<string, EarlierRun>;

export interface ExistingDeviceRow {
  id: string;
  userId: string;
  date: string;
  metric: string;
  value: string | number;
  calculationMetadata: unknown;
  notes: string | null;
}

export interface DuplicateDrill {
  metric: string;
  value: number;
  runAt?: string;
  derivedFrom?: string;
  splits?: unknown[];
}

/** insert: insert the run after deleting deleteIds (replace only). skip: count `skipped` rows and insert nothing. */
export type DuplicateDecision = { kind: 'insert'; deleteIds: string[] } | { kind: 'skip'; skipped: number };

// measurements.value is decimal(10,3)
const sameValue = (a: number, b: number) => Math.round(a * 1000) === Math.round(b * 1000);

/**
 * Earlier device rows per run "userId|date|drill metric|runAt". A drill row counts under its own metric,
 * a split row under its parent drill: calculationMetadata.parentMetric, or the notes for data imported before
 * that field existed. So a 20 yd import never matches the DASH_10YD / DASH_20YD splits of a 30 yd run.
 * Rows without a runAt (imported before every run was kept) share the legacy bucket "userId|date|drill metric|";
 * a new run without a runAt is looked up in that same bucket.
 * drillValues holds the drill rows' values: the legacy rule and the one-value-per-day rule compare them.
 */
export function groupEarlierRuns(rows: ExistingDeviceRow[]): EarlierRuns {
  const earlierByRun: EarlierRuns = new Map();
  for (const r of rows) {
    const meta = r.calculationMetadata as Record<string, any> | null;
    const parentMetric = meta?.parentMetric
      || r.notes?.match(/^Split from (\S+)/)?.[1];
    const key = `${r.userId}|${r.date}|${parentMetric ?? r.metric}|${meta?.runAt ?? ''}`;
    if (!earlierByRun.has(key)) earlierByRun.set(key, { ids: [], drillValues: [] });
    const bucket = earlierByRun.get(key)!;
    bucket.ids.push(r.id);
    if (!parentMetric) bucket.drillValues.push(Number(r.value));
  }
  return earlierByRun;
}

/**
 * Decide what to do with one new run. On a replace match it removes the matched keys from earlierByRun and adds
 * them to consumedKeys (run keys already replaced in this commit: a later run with the same key is inserted, not
 * matched again).
 */
export function decideDuplicate(args: {
  earlierByRun: EarlierRuns;
  consumedKeys: Set<string>;
  athleteId: string;
  date: string;
  drill: DuplicateDrill;
  strategy: 'skip' | 'replace';
  higherIsBetter: (code: string) => boolean;
}): DuplicateDecision {
  const { earlierByRun, consumedKeys, athleteId, date, drill, strategy } = args;
  const drillKey = `${athleteId}|${date}|${drill.metric}|`;
  let matchedKeys: string[];
  const onePerDay = !!drill.derivedFrom || drill.metric === MetricType.RSI;
  if (onePerDay) {
    // A derived fly or the RSI is one value per day computed from the session's runs: every earlier row
    // of the code counts, whatever its runAt
    matchedKeys = [...earlierByRun.keys()].filter(k => k.startsWith(drillKey));
  } else if (drill.runAt && consumedKeys.has(drillKey + drill.runAt)) {
    matchedKeys = [];
  } else if (drill.runAt && earlierByRun.has(drillKey + drill.runAt)) {
    matchedKeys = [drillKey + drill.runAt];
  } else {
    // No earlier row of this run time (or no runAt): a legacy group is the same session only when its
    // drill row has the run's value; otherwise it is another session and is left alone
    const legacy = earlierByRun.get(drillKey);
    matchedKeys = legacy?.drillValues.some(v => sameValue(v, drill.value)) ? [drillKey] : [];
  }
  const earlier = matchedKeys.map(k => earlierByRun.get(k)!);
  // A skipped run is the drill row and every split
  const skip: DuplicateDecision = { kind: 'skip', skipped: 1 + (drill.splits?.length ?? 0) };

  if (earlier.length > 0) {
    if (onePerDay) {
      const higher = args.higherIsBetter(drill.metric);
      const better = (a: number, b: number) => (higher ? a > b : a < b);
      // drillValues holds drill rows only (a derived fly has no splits), so a split value never enters this comparison
      const earlierValues = earlier.flatMap(e => e.drillValues);
      // Skip: add the new value only when it beats every earlier one, delete nothing.
      // Replace: only a strictly better earlier value is kept; an equal one is replaced like any re-import
      const keepEarlier = strategy === 'skip'
        ? !earlierValues.every(v => better(drill.value, v))
        : earlierValues.some(v => better(v, drill.value));
      if (keepEarlier) return skip;
    } else if (strategy === 'skip') {
      return skip;
    }
    if (strategy === 'replace') {
      // Delete exactly the earlier rows of the matched run(s) (drill row + its splits, including splits
      // the new run no longer has), once: a later run with the same key finds it consumed and is inserted
      for (const k of matchedKeys) {
        earlierByRun.delete(k);
        consumedKeys.add(k);
      }
      return { kind: 'insert', deleteIds: earlier.flatMap(e => e.ids) };
    }
  }
  return { kind: 'insert', deleteIds: [] };
}

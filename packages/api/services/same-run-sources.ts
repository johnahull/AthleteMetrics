/** The fields of a measurement row the selection reads; a Measurement and the eval report's rows both fit. */
export interface SameRunRow {
  metric: string;
  value: string | number;
  createdAt?: Date | string;
  calculationMetadata?: unknown;
}

/**
 * Same-run source selection for derived metrics (calculationConfig.sameRunInputs).
 *
 * Device imports write `calculationMetadata.runId` on a drill row and on each of its split rows. Splits
 * of one run are clocks of one sprint, so a formula that combines them must not take one split from
 * one run and another from a different run.
 */

/** Rows without a run id (manual entry, imports before run ids) share one pool: the old best-of-each rule. */
const NO_RUN = '';

export function sameRunKey(m: Pick<SameRunRow, 'calculationMetadata'>): string {
  const runId = (m.calculationMetadata as { runId?: unknown } | null)?.runId;
  return typeof runId === 'string' ? runId : NO_RUN;
}

const isGateSplit = (m: Pick<SameRunRow, 'calculationMetadata'>) =>
  (m.calculationMetadata as { formula?: unknown } | null)?.formula === 'direct_import_split';

/**
 * Picks one run that has a row for every code and returns each code's row from it, or null when no run is complete.
 * Within a run (or the no-run pool) each code takes its best row (direction-aware, newest on a tie); in a run,
 * a gate split row beats the drill's Final Time row.
 * Runs are ranked by those values in `codes` order, then by newest row.
 *
 * @param rows candidate rows of the codes (already filtered for user, date, verification and visibility)
 */
export function selectSameRunSources<T extends SameRunRow>(
  rows: readonly T[],
  codes: string[],
  higherIsBetter: (code: string) => boolean
): Map<string, T> | null {
  const runs = new Map<string, T[]>();
  for (const r of rows) {
    const key = sameRunKey(r);
    runs.set(key, [...(runs.get(key) ?? []), r]);
  }

  const num = (r: SameRunRow) => (typeof r.value === 'number' ? r.value : parseFloat(r.value));
  const time = (r: SameRunRow) => (r.createdAt ? new Date(r.createdAt).getTime() : 0);

  const better = (code: string, a: T, b: T) => {
    const d = num(a) - num(b);
    if (d !== 0) return higherIsBetter(code) ? d > 0 : d < 0;
    return time(a) > time(b);
  };

  const beats = (a: Map<string, T>, b: Map<string, T>) => {
    for (const code of codes) {
      const d = num(a.get(code)!) - num(b.get(code)!);
      if (d !== 0) return higherIsBetter(code) ? d > 0 : d < 0;
    }
    const newest = (m: Map<string, T>) => [...m.values()].reduce((latest, r) => Math.max(latest, time(r)), 0);
    return newest(a) > newest(b);
  };

  let best: Map<string, T> | null = null;
  for (const [runKey, runRows] of runs) {
    const sources = new Map<string, T>();
    for (const code of codes) {
      const ofCode = runRows.filter((r) => r.metric === code);
      // A run's drill row carries the Final Time and its split row the gate time: two clocks that differ
      // by milliseconds. Take the gate when the run has one, so the inputs never mix the two.
      const gates = ofCode.filter((r) => isGateSplit(r));
      for (const r of runKey !== NO_RUN && gates.length > 0 ? gates : ofCode) {
        const current = sources.get(code);
        if (!current || better(code, r, current)) sources.set(code, r);
      }
    }
    if (sources.size < codes.length) continue;
    if (!best || beats(sources, best)) best = sources;
  }
  return best;
}

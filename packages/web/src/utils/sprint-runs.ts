import type { Measurement } from '@shared/schema';

export type SprintUnit = 'YD' | 'M';

export type SprintRunMeasurement = Pick<
  Measurement,
  'id' | 'metric' | 'value' | 'date' | 'isVerified' | 'organizationId' | 'importBatchId' | 'calculationMetadata'
>;

export interface SprintGate {
  distance: number;
  time: number;
}

export interface SprintInterval {
  from: number;
  to: number;
  time: number;
  /** Run-in (yd) of a 10 yd fly: set for 10-yd spans starting at 10, 20 or 30, yards only */
  runInYd?: number;
}

export interface SprintRun {
  key: string;
  date: string;
  unit: SprintUnit;
  /** The drill row's distance, else the largest gate */
  finalDistance: number;
  /** False for partial runs and pooled rows: no drill row (Final Time) was stored */
  hasFinal: boolean;
  gates: SprintGate[];
  intervals: SprintInterval[];
  /** Rows with no run or batch id (manual entry): fastest gate per distance, no intervals */
  pooled: boolean;
}

const DASH_METRIC = /^DASH_(\d+)(YD|M)$/;
const RUN_IN_STARTS_YD = [10, 20, 30];

const round3 = (n: number) => parseFloat(n.toFixed(3));

interface RunDraft {
  key: string;
  date: string;
  pooled: boolean;
  gates: Map<number, number>;
  drillDistance?: number;
  drillTime?: number;
}

function keepFastest(map: Map<number, number>, distance: number, time: number) {
  const cur = map.get(distance);
  if (cur === undefined || time < cur) map.set(distance, time);
}

/**
 * Group an athlete's device-imported dash rows into runs, newest first.
 *
 * A run is a drill row (Final Time) plus its split rows. Rows are keyed by calculationMetadata.runId; older
 * imports (no runId) by importBatchId + date + drill (a split's parentMetric); rows with neither (manual entry)
 * are pooled per organization and date. Only verified rows in the requested unit are used. The unit comes from
 * the metric code suffix (the stored `units` is 's').
 */
export function groupSprintRuns(measurements: SprintRunMeasurement[], unit: SprintUnit): SprintRun[] {
  const drafts = new Map<string, RunDraft>();

  for (const row of measurements) {
    if (!row.isVerified) continue;
    const match = DASH_METRIC.exec(row.metric);
    if (!match || match[2] !== unit) continue;
    const time = parseFloat(row.value);
    if (!Number.isFinite(time) || time <= 0) continue;

    const distance = Number(match[1]);
    const meta = row.calculationMetadata;
    const isSplit = meta?.formula === 'direct_import_split';

    let key: string;
    let pooled = false;
    if (meta?.runId) {
      key = `run|${meta.runId}`;
    } else if (row.importBatchId) {
      key = `batch|${row.importBatchId}|${row.date}|${meta?.parentMetric ?? row.metric}`;
    } else {
      key = `pool|${row.organizationId ?? ''}|${row.date}`;
      pooled = true;
    }

    let draft = drafts.get(key);
    if (!draft) {
      draft = { key, date: row.date, pooled, gates: new Map() };
      drafts.set(key, draft);
    }

    if (isSplit || pooled) {
      keepFastest(draft.gates, distance, time);
    } else if (draft.drillTime === undefined || time < draft.drillTime) {
      draft.drillDistance = distance;
      draft.drillTime = time;
    }
  }

  const runs: SprintRun[] = [];
  for (const draft of drafts.values()) {
    // The drill's Final Time is the gate at its own distance only when no split has one
    if (draft.drillDistance !== undefined && draft.drillTime !== undefined && !draft.gates.has(draft.drillDistance)) {
      draft.gates.set(draft.drillDistance, draft.drillTime);
    }
    if (draft.gates.size === 0) continue;

    const gates = [...draft.gates].map(([distance, time]) => ({ distance, time })).sort((a, b) => a.distance - b.distance);
    const intervals: SprintInterval[] = [];
    if (!draft.pooled) {
      for (let i = 1; i < gates.length; i++) {
        const from = gates[i - 1].distance;
        const to = gates[i].distance;
        const time = round3(gates[i].time - gates[i - 1].time);
        if (time <= 0) continue;
        const runInYd = unit === 'YD' && to - from === 10 && RUN_IN_STARTS_YD.includes(from) ? from : undefined;
        intervals.push({ from, to, time, ...(runInYd !== undefined ? { runInYd } : {}) });
      }
    }

    runs.push({
      key: draft.key,
      date: draft.date,
      unit,
      finalDistance: draft.drillDistance ?? gates[gates.length - 1].distance,
      hasFinal: draft.drillDistance !== undefined,
      gates,
      intervals,
      pooled: draft.pooled,
    });
  }

  return runs.sort((a, b) => b.date.localeCompare(a.date) || a.key.localeCompare(b.key));
}

export interface SprintSummary {
  runCount: number;
  firstDate: string | null;
  lastDate: string | null;
  /** Fastest Final Time at the distance with most runs; delta is best minus the first run's time (null when best is the first) */
  bestFinal: { distance: number; time: number; delta: number | null; sinceDate: string } | null;
  /** Fastest 10 yd fly of the run-in with most runs (ties: 20, then 10, then 30 yd) */
  bestFly: { runInYd: number; time: number; delta: number | null; sinceDate: string } | null;
  /** The interval that improved most between its first and latest run */
  biggestGain: { from: number; to: number; gain: number } | null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const RUN_IN_PREFERENCE = [20, 10, 30];

/** Best of a group of timed runs (newest first), with the change since the oldest one */
function bestOf<T extends { time: number; date: string }>(group: T[]) {
  const best = group.reduce((a, b) => (b.time < a.time ? b : a));
  const first = group[group.length - 1];
  return { best, first, delta: best === first ? null : round2(best.time - first.time) };
}

/**
 * Headline numbers for a list of runs from groupSprintRuns (newest first, one unit). Pooled rows count as
 * runs but are left out of the bests: they may mix attempts and have no Final Time or intervals.
 */
export function summarizeSprintRuns(runs: SprintRun[]): SprintSummary {
  const measured = runs.filter(r => !r.pooled);

  let bestFinal: SprintSummary['bestFinal'] = null;
  const byDistance = new Map<number, { time: number; date: string }[]>();
  for (const run of measured) {
    const time = run.gates.find(g => g.distance === run.finalDistance)?.time;
    if (!run.hasFinal || time === undefined) continue;
    byDistance.set(run.finalDistance, [...(byDistance.get(run.finalDistance) ?? []), { time, date: run.date }]);
  }
  const distance = [...byDistance].sort((a, b) => b[1].length - a[1].length || b[0] - a[0])[0];
  if (distance) {
    const { best, first, delta } = bestOf(distance[1]);
    bestFinal = { distance: distance[0], time: best.time, delta, sinceDate: first.date };
  }

  let bestFly: SprintSummary['bestFly'] = null;
  const byRunIn = new Map<number, { time: number; date: string }[]>();
  for (const run of measured) {
    for (const i of run.intervals) {
      if (i.runInYd !== undefined) byRunIn.set(i.runInYd, [...(byRunIn.get(i.runInYd) ?? []), { time: i.time, date: run.date }]);
    }
  }
  const runIn = [...byRunIn].sort(
    (a, b) => b[1].length - a[1].length || RUN_IN_PREFERENCE.indexOf(a[0]) - RUN_IN_PREFERENCE.indexOf(b[0]),
  )[0];
  if (runIn) {
    const { best, first, delta } = bestOf(runIn[1]);
    bestFly = { runInYd: runIn[0], time: best.time, delta, sinceDate: first.date };
  }

  let biggestGain: SprintSummary['biggestGain'] = null;
  const byInterval = new Map<string, { from: number; to: number; times: number[] }>();
  for (const run of measured) {
    for (const i of run.intervals) {
      const key = `${i.from}-${i.to}`;
      const entry = byInterval.get(key) ?? { from: i.from, to: i.to, times: [] };
      entry.times.push(i.time);
      byInterval.set(key, entry);
    }
  }
  for (const { from, to, times } of byInterval.values()) {
    if (times.length < 2) continue;
    const gain = round2(times[times.length - 1] - times[0]);
    if (gain > 0 && (!biggestGain || gain > biggestGain.gain)) biggestGain = { from, to, gain };
  }

  return {
    runCount: runs.length,
    firstDate: runs.length ? runs[runs.length - 1].date : null,
    lastDate: runs.length ? runs[0].date : null,
    bestFinal,
    bestFly,
    biggestGain,
  };
}

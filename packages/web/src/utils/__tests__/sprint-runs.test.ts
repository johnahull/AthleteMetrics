import { describe, it, expect } from 'vitest';
import {
  describeInterval,
  filterRunsByRange,
  groupSprintRuns,
  localDateString,
  summarizeSprintRuns,
  type SprintRunMeasurement,
} from '../sprint-runs';

let n = 0;
function m(o: {
  metric: string;
  value: number | string;
  date?: string;
  runId?: string;
  split?: boolean;
  parentMetric?: string;
  batch?: string;
  verified?: boolean;
  org?: string | null;
  notes?: string;
  formula?: string;
}): SprintRunMeasurement {
  n += 1;
  return {
    id: `m${n}`,
    metric: o.metric,
    value: String(o.value),
    date: o.date ?? '2026-10-17',
    isVerified: o.verified ?? true,
    organizationId: o.org === undefined ? 'org-1' : o.org,
    importBatchId: o.batch ?? null,
    notes: o.notes ?? null,
    calculationMetadata: o.runId || o.split || o.parentMetric || o.formula
      ? {
          formula: o.formula ?? (o.split ? 'direct_import_split' : 'direct_import'),
          sourceValues: {},
          calculatedAt: '2026-10-17T00:00:00Z',
          ...(o.runId ? { runId: o.runId } : {}),
          ...(o.parentMetric ? { parentMetric: o.parentMetric } : {}),
        }
      : null,
  };
}

/** A 40 yd dash as the importer stores it: drill row + split rows, one runId */
function dash40(runId: string, date: string, times: [number, number, number, number]) {
  return [
    m({ metric: 'DASH_40YD', value: times[3], date, runId }),
    m({ metric: 'DASH_10YD', value: times[0], date, runId, split: true, parentMetric: 'DASH_40YD' }),
    m({ metric: 'DASH_20YD', value: times[1], date, runId, split: true, parentMetric: 'DASH_40YD' }),
    m({ metric: 'DASH_30YD', value: times[2], date, runId, split: true, parentMetric: 'DASH_40YD' }),
  ];
}

describe('groupSprintRuns', () => {
  it('groups a drill row and its splits into one run with gates and intervals', () => {
    const runs = groupSprintRuns(dash40('r1', '2026-10-17', [1.85, 3.15, 4.35, 5.49]), 'YD');
    expect(runs).toHaveLength(1);
    const run = runs[0];
    expect(run.gates).toEqual([
      { distance: 10, time: 1.85 },
      { distance: 20, time: 3.15 },
      { distance: 30, time: 4.35 },
      { distance: 40, time: 5.49 },
    ]);
    expect(run.finalDistance).toBe(40);
    expect(run.hasFinal).toBe(true);
    expect(run.pooled).toBe(false);
    expect(run.intervals).toEqual([
      { from: 10, to: 20, time: 1.3, runInYd: 10 },
      { from: 20, to: 30, time: 1.2, runInYd: 20 },
      { from: 30, to: 40, time: 1.14, runInYd: 30 },
    ]);
  });

  it('sorts runs newest first and keeps runs apart by runId', () => {
    const runs = groupSprintRuns(
      [...dash40('old', '2026-08-29', [1.92, 3.28, 4.52, 5.71]), ...dash40('new', '2026-10-17', [1.85, 3.15, 4.35, 5.49])],
      'YD',
    );
    expect(runs.map(r => r.date)).toEqual(['2026-10-17', '2026-08-29']);
  });

  it('prefers the split gate over the drill Final Time at the dash distance', () => {
    const runs = groupSprintRuns(
      [
        m({ metric: 'DASH_20YD', value: 3.2, runId: 'r' }),
        m({ metric: 'DASH_10YD', value: 1.87, runId: 'r', split: true, parentMetric: 'DASH_20YD' }),
        m({ metric: 'DASH_20YD', value: 3.19, runId: 'r', split: true, parentMetric: 'DASH_20YD' }),
      ],
      'YD',
    );
    expect(runs[0].gates.find(g => g.distance === 20)?.time).toBe(3.19);
  });

  it('uses the drill Final Time as the gate when no split has that distance', () => {
    const runs = groupSprintRuns(
      [m({ metric: 'DASH_20YD', value: 3.2, runId: 'r' }), m({ metric: 'DASH_10YD', value: 1.87, runId: 'r', split: true, parentMetric: 'DASH_20YD' })],
      'YD',
    );
    expect(runs[0].gates).toEqual([{ distance: 10, time: 1.87 }, { distance: 20, time: 3.2 }]);
  });

  it('keeps the fastest of two gates at the same distance in one run', () => {
    const runs = groupSprintRuns(
      [
        m({ metric: 'DASH_20YD', value: 3.3, runId: 'r' }),
        m({ metric: 'DASH_10YD', value: 1.9, runId: 'r', split: true, parentMetric: 'DASH_20YD' }),
        m({ metric: 'DASH_10YD', value: 1.87, runId: 'r', split: true, parentMetric: 'DASH_20YD' }),
      ],
      'YD',
    );
    expect(runs[0].gates[0]).toEqual({ distance: 10, time: 1.87 });
  });

  it('labels run-ins only for 10 yd spans starting at 10, 20 or 30', () => {
    const runs = groupSprintRuns(
      [
        m({ metric: 'DASH_30YD', value: 4.5, runId: 'r' }),
        m({ metric: 'DASH_5YD', value: 1.1, runId: 'r', split: true, parentMetric: 'DASH_30YD' }),
        m({ metric: 'DASH_10YD', value: 1.87, runId: 'r', split: true, parentMetric: 'DASH_30YD' }),
        m({ metric: 'DASH_20YD', value: 3.19, runId: 'r', split: true, parentMetric: 'DASH_30YD' }),
      ],
      'YD',
    );
    expect(runs[0].intervals).toEqual([
      { from: 5, to: 10, time: 0.77 },
      { from: 10, to: 20, time: 1.32, runInYd: 10 },
      { from: 20, to: 30, time: 1.31, runInYd: 20 },
    ]);
  });

  it('has no intervals for a single-gate run', () => {
    const runs = groupSprintRuns([m({ metric: 'DASH_40YD', value: 5.5, runId: 'r' })], 'YD');
    expect(runs[0].intervals).toEqual([]);
    expect(runs[0].gates).toEqual([{ distance: 40, time: 5.5 }]);
  });

  it('a partial run (no drill row) takes its final distance from the largest gate and has no final', () => {
    const runs = groupSprintRuns(
      [
        m({ metric: 'DASH_20YD', value: 3.2, runId: 'r', split: true, parentMetric: 'DASH_40YD' }),
        m({ metric: 'DASH_30YD', value: 4.4, runId: 'r', split: true, parentMetric: 'DASH_40YD' }),
      ],
      'YD',
    );
    expect(runs[0].finalDistance).toBe(30);
    expect(runs[0].hasFinal).toBe(false);
  });

  it('groups older imports (no runId) by batch, date and drill: two drills the same day stay separate', () => {
    const rows = [
      m({ metric: 'DASH_20YD', value: 3.2, batch: 'b1' }),
      m({ metric: 'DASH_10YD', value: 1.87, batch: 'b1', split: true, parentMetric: 'DASH_20YD' }),
      m({ metric: 'DASH_40YD', value: 5.5, batch: 'b1' }),
      m({ metric: 'DASH_10YD', value: 1.9, batch: 'b1', split: true, parentMetric: 'DASH_40YD' }),
      m({ metric: 'DASH_30YD', value: 4.4, batch: 'b1', split: true, parentMetric: 'DASH_40YD' }),
    ];
    const runs = groupSprintRuns(rows, 'YD');
    expect(runs).toHaveLength(2);
    const r20 = runs.find(r => r.finalDistance === 20)!;
    const r40 = runs.find(r => r.finalDistance === 40)!;
    expect(r20.gates).toEqual([{ distance: 10, time: 1.87 }, { distance: 20, time: 3.2 }]);
    expect(r40.gates.map(g => g.distance)).toEqual([10, 30, 40]);
    expect(r20.pooled).toBe(false);
  });

  it('pools rows with neither runId nor batch by organization and date: fastest per distance, no intervals', () => {
    const runs = groupSprintRuns(
      [
        m({ metric: 'DASH_40YD', value: 5.7 }),
        m({ metric: 'DASH_40YD', value: 5.6 }),
        m({ metric: 'DASH_20YD', value: 3.3 }),
        m({ metric: 'DASH_40YD', value: 5.9, org: 'org-2' }),
      ],
      'YD',
    );
    expect(runs).toHaveLength(2);
    const org1 = runs.find(r => r.gates.some(g => g.time === 5.6))!;
    expect(org1.pooled).toBe(true);
    expect(org1.intervals).toEqual([]);
    expect(org1.hasFinal).toBe(false);
    expect(org1.gates).toEqual([{ distance: 20, time: 3.3 }, { distance: 40, time: 5.6 }]);
  });

  it('separates yards from meters by the metric code suffix', () => {
    const rows = [
      m({ metric: 'DASH_40YD', value: 5.5, runId: 'y' }),
      m({ metric: 'DASH_40M', value: 5.9, runId: 'm' }),
      m({ metric: 'DASH_10M', value: 1.9, runId: 'm', split: true, parentMetric: 'DASH_40M' }),
    ];
    expect(groupSprintRuns(rows, 'YD')).toHaveLength(1);
    const meters = groupSprintRuns(rows, 'M');
    expect(meters).toHaveLength(1);
    expect(meters[0].unit).toBe('M');
    // run-in labels are a yard concept
    expect(meters[0].intervals.every(i => i.runInYd === undefined)).toBe(true);
  });

  it('ignores unverified rows, non-dash metrics and non-positive or non-numeric values', () => {
    const runs = groupSprintRuns(
      [
        m({ metric: 'DASH_40YD', value: 5.5, runId: 'a', verified: false }),
        m({ metric: 'FLY10_TIME', value: 1.2, runId: 'b' }),
        m({ metric: 'DASH_40YD', value: 0, runId: 'c' }),
        m({ metric: 'DASH_40YD', value: 'abc', runId: 'd' }),
      ],
      'YD',
    );
    expect(runs).toEqual([]);
  });

  it('drops a non-positive interval', () => {
    const runs = groupSprintRuns(
      [m({ metric: 'DASH_20YD', value: 3.0, runId: 'r' }), m({ metric: 'DASH_10YD', value: 3.0, runId: 'r', split: true, parentMetric: 'DASH_20YD' })],
      'YD',
    );
    expect(runs[0].intervals).toEqual([]);
  });
});

describe('summarizeSprintRuns', () => {
  const two = () =>
    groupSprintRuns([...dash40('old', '2026-08-29', [1.92, 3.28, 4.52, 5.71]), ...dash40('new', '2026-10-17', [1.85, 3.15, 4.35, 5.49])], 'YD');

  it('counts runs and gives the date range', () => {
    const s = summarizeSprintRuns(two());
    expect(s.runCount).toBe(2);
    expect(s.firstDate).toBe('2026-08-29');
    expect(s.lastDate).toBe('2026-10-17');
  });

  it('best final time is for the distance with most runs, with the change since the first run', () => {
    const s = summarizeSprintRuns(two());
    expect(s.bestFinal).toEqual({ distance: 40, time: 5.49, delta: -0.22, sinceDate: '2026-08-29' });
  });

  it('has no delta when the best run is the first one', () => {
    const runs = groupSprintRuns([...dash40('old', '2026-08-29', [1.8, 3.1, 4.3, 5.4]), ...dash40('new', '2026-10-17', [1.85, 3.15, 4.35, 5.49])], 'YD');
    expect(summarizeSprintRuns(runs).bestFinal).toEqual({ distance: 40, time: 5.4, delta: null, sinceDate: '2026-08-29' });
  });

  it('best fly 10 prefers the 20 yd run-in on a tie in run count', () => {
    expect(summarizeSprintRuns(two()).bestFly).toEqual({ runInYd: 20, time: 1.2, delta: -0.04, sinceDate: '2026-08-29' });
  });

  it('biggest gain is the interval that improved most between its first and latest run', () => {
    expect(summarizeSprintRuns(two()).biggestGain).toEqual({ from: 10, to: 20, gain: 0.06 });
  });

  it('has no best, fly or gain for a single run, and ignores pooled rows for bests', () => {
    const one = summarizeSprintRuns(groupSprintRuns(dash40('a', '2026-10-17', [1.85, 3.15, 4.35, 5.49]), 'YD'));
    expect(one.runCount).toBe(1);
    expect(one.biggestGain).toBeNull();
    expect(one.bestFinal?.delta).toBeNull();

    const pooled = summarizeSprintRuns(groupSprintRuns([m({ metric: 'DASH_40YD', value: 5.6 })], 'YD'));
    expect(pooled.runCount).toBe(1);
    expect(pooled.bestFinal).toBeNull();
    expect(pooled.bestFly).toBeNull();
  });

  it('is empty for no runs', () => {
    expect(summarizeSprintRuns([])).toEqual({ runCount: 0, firstDate: null, lastDate: null, bestFinal: null, bestFly: null, biggestGain: null });
  });
});

describe('groupSprintRuns: branch-era imports (batch id, no metadata, parent only in notes)', () => {
  const legacy = (metric: string, value: number, notes: string) => m({ metric, value, date: '2026-04-10', batch: 'b1', notes });
  const run30 = () => [
    legacy('DASH_30YD', 4.7, 'Imported from f.csv'),
    legacy('DASH_5YD', 1.03, 'Split from DASH_30YD — imported from f.csv'),
    legacy('DASH_10YD', 1.84, 'Split from DASH_30YD — imported from f.csv'),
    legacy('DASH_20YD', 3.34, 'Split from DASH_30YD — imported from f.csv'),
  ];

  it('joins the splits and the drill row into one run', () => {
    const runs = groupSprintRuns(run30(), 'YD');
    expect(runs).toHaveLength(1);
    expect(runs[0].pooled).toBe(false);
    expect(runs[0].hasFinal).toBe(true);
    expect(runs[0].finalDistance).toBe(30);
    expect(runs[0].gates).toEqual([
      { distance: 5, time: 1.03 },
      { distance: 10, time: 1.84 },
      { distance: 20, time: 3.34 },
      { distance: 30, time: 4.7 },
    ]);
    expect(runs[0].intervals).toEqual([
      { from: 5, to: 10, time: 0.81 },
      { from: 10, to: 20, time: 1.5, runInYd: 10 },
      { from: 20, to: 30, time: 1.36, runInYd: 20 },
    ]);
  });

  it('groups splits without a drill row by the parent named in the note', () => {
    const runs = groupSprintRuns(run30().slice(1), 'YD');
    expect(runs).toHaveLength(1);
    expect(runs[0].hasFinal).toBe(false);
    expect(runs[0].gates.map(g => g.distance)).toEqual([5, 10, 20]);
  });

  it('keeps two drills of one batch and day apart when their splits name different parents', () => {
    const rows = [
      legacy('DASH_20YD', 3.2, 'Imported from f.csv'),
      legacy('DASH_10YD', 1.87, 'Split from DASH_20YD — imported from f.csv'),
      ...run30().filter(r => r.metric !== 'DASH_10YD'),
    ];
    const runs = groupSprintRuns(rows, 'YD');
    expect(runs).toHaveLength(2);
    expect(runs.find(r => r.finalDistance === 20)?.gates.map(g => g.time)).toEqual([1.87, 3.2]);
  });

  it('uses the note parent only for splits: a row with another formula keeps its own key', () => {
    const rows = [
      m({ metric: 'DASH_30YD', value: 4.0, date: '2026-04-10', batch: 'b1', formula: 'direct_import' }),
      m({ metric: 'DASH_10YD', value: 1.6, date: '2026-04-10', batch: 'b1', formula: 'direct_import', notes: 'Split from DASH_30YD — imported from f.csv' }),
    ];
    const runs = groupSprintRuns(rows, 'YD');
    expect(runs).toHaveLength(2);
    expect(runs.find(r => r.finalDistance === 30)?.gates).toEqual([{ distance: 30, time: 4.0 }]);
  });

  it('marks a run pooled (no intervals, no final) when one batch holds two attempts of the same drill on a day', () => {
    const rows = [
      ...run30(),
      legacy('DASH_30YD', 4.9, 'Imported from f.csv'),
      legacy('DASH_10YD', 1.9, 'Split from DASH_30YD — imported from f.csv'),
    ];
    const runs = groupSprintRuns(rows, 'YD');
    expect(runs).toHaveLength(1);
    expect(runs[0].pooled).toBe(true);
    expect(runs[0].hasFinal).toBe(false);
    expect(runs[0].intervals).toEqual([]);
    expect(runs[0].gates.find(g => g.distance === 10)?.time).toBe(1.84);
    expect(runs[0].gates.find(g => g.distance === 30)?.time).toBe(4.7);
  });

  it('does not merge real separate dashes of one batch (no split notes)', () => {
    const rows = [
      legacy('DASH_10YD', 1.84, 'Imported from f.csv'),
      legacy('DASH_20YD', 3.34, 'Imported from f.csv'),
      legacy('DASH_30YD', 4.7, 'Imported from f.csv'),
    ];
    expect(groupSprintRuns(rows, 'YD')).toHaveLength(3);
  });
});

describe('localDateString', () => {
  it('uses the local calendar date, not the UTC date', () => {
    expect(localDateString(new Date(2026, 9, 20, 23, 30))).toBe('2026-10-20');
    expect(localDateString(new Date(2026, 0, 5, 0, 5))).toBe('2026-01-05');
  });
});

describe('filterRunsByRange', () => {
  const at = (date: string) => groupSprintRuns([m({ metric: 'DASH_40YD', value: 5.5, date, runId: `r${date}` })], 'YD')[0];
  const dates = (runs: ReturnType<typeof filterRunsByRange>) => runs.map(r => r.date);

  it('keeps everything for all time', () => {
    expect(filterRunsByRange([at('2020-01-01'), at('2026-10-01')], 'all', '2026-10-21')).toHaveLength(2);
  });

  it('keeps runs on or after the same day 12 months back', () => {
    const runs = [at('2026-10-21'), at('2025-10-21'), at('2025-10-20')];
    expect(dates(filterRunsByRange(runs, '12m', '2026-10-21'))).toEqual(['2026-10-21', '2025-10-21']);
  });

  it('keeps runs on or after the same day 6 months back', () => {
    const runs = [at('2026-04-21'), at('2026-04-20')];
    expect(dates(filterRunsByRange(runs, '6m', '2026-10-21'))).toEqual(['2026-04-21']);
  });

  it('clamps the day at month end (Aug 31 minus 6 months is Feb 28, or 29 in a leap year)', () => {
    expect(dates(filterRunsByRange([at('2026-02-28'), at('2026-02-27')], '6m', '2026-08-31'))).toEqual(['2026-02-28']);
    expect(dates(filterRunsByRange([at('2028-02-29'), at('2028-02-28')], '6m', '2028-08-31'))).toEqual(['2028-02-29']);
  });

  it('returns nothing when every run is older than the range', () => {
    expect(filterRunsByRange([at('2020-01-01')], '12m', '2026-10-21')).toEqual([]);
  });
});

describe('describeInterval', () => {
  const run = () => groupSprintRuns(dash40('r', '2026-10-17', [1.85, 3.15, 4.35, 5.49]), 'YD')[0];

  it('shows a fly 10 derivation in stored precision', () => {
    const r = run();
    const iv = r.intervals.find(i => i.runInYd === 20)!;
    expect(describeInterval(r, iv)).toBe('RI20 (fly 10): 4.350 − 3.150 = 1.200 s');
  });

  it('shows other spans as a span', () => {
    const r = groupSprintRuns(
      [
        m({ metric: 'DASH_30YD', value: 4.7, runId: 'x' }),
        m({ metric: 'DASH_5YD', value: 1.03, runId: 'x', split: true, parentMetric: 'DASH_30YD' }),
        m({ metric: 'DASH_10YD', value: 1.84, runId: 'x', split: true, parentMetric: 'DASH_30YD' }),
      ],
      'YD',
    )[0];
    expect(describeInterval(r, r.intervals[0])).toBe('5–10 yd span: 1.840 − 1.030 = 0.810 s');
  });
});

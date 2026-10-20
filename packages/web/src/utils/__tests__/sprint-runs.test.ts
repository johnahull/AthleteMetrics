import { describe, it, expect } from 'vitest';
import { groupSprintRuns, type SprintRunMeasurement } from '../sprint-runs';

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
    calculationMetadata: o.runId || o.split || o.parentMetric
      ? {
          formula: o.split ? 'direct_import_split' : 'direct_import',
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

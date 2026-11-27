import { describe, it, expect } from 'vitest';
import { groupEarlierRuns, decideDuplicate, type DuplicateDrill } from '../device-import-duplicates';

const A = 'ath-1';
const D = '2026-10-20';
const T9 = '2026-10-20T09:00:00';
const T14 = '2026-10-20T14:00:00';

let nextId = 0;
const row = (metric: string, value: number, meta: Record<string, unknown> | null = null, notes: string | null = null) => ({
  id: `r${++nextId}`, userId: A, date: D, metric, value: String(value), calculationMetadata: meta, notes,
});
const drillRow = (metric: string, value: number, runAt?: string) => row(metric, value, runAt ? { runAt } : null);
const splitRow = (parent: string, metric: string, value: number, runAt?: string) =>
  row(metric, value, { parentMetric: parent, ...(runAt ? { runAt } : {}) });

const lowerIsBetter = () => false;
const higherIsBetter = () => true;

const decide = (
  rows: ReturnType<typeof row>[],
  drill: DuplicateDrill,
  strategy: 'skip' | 'replace',
  state = { earlierByRun: groupEarlierRuns(rows), consumedKeys: new Set<string>() },
  higher = lowerIsBetter,
) => ({ decision: decideDuplicate({ ...state, athleteId: A, date: D, drill, strategy, higherIsBetter: higher }), state });

describe('groupEarlierRuns', () => {
  it('keys drill rows by their metric and runAt, split rows by their parent drill', () => {
    const rows = [drillRow('DASH_30YD', 4.5, T9), splitRow('DASH_30YD', 'DASH_10YD', 1.8, T9)];
    const runs = groupEarlierRuns(rows);
    expect([...runs.keys()]).toEqual([`${A}|${D}|DASH_30YD|${T9}`]);
    expect(runs.get(`${A}|${D}|DASH_30YD|${T9}`)).toEqual({ ids: [rows[0].id, rows[1].id], drillValues: [4.5] });
  });

  it('falls back to the "Split from X" notes and puts rows without runAt in the legacy bucket', () => {
    const runs = groupEarlierRuns([
      drillRow('DASH_30YD', 4.4),
      row('DASH_10YD', 1.9, null, 'Split from DASH_30YD — imported from old.csv'),
    ]);
    const legacy = runs.get(`${A}|${D}|DASH_30YD|`)!;
    expect(legacy.ids).toHaveLength(2);
    expect(legacy.drillValues).toEqual([4.4]);
  });
});

describe('decideDuplicate: a run', () => {
  const run9: DuplicateDrill = { metric: 'DASH_30YD', value: 4.5, runAt: T9, splits: [{}] };
  const earlier9 = () => [drillRow('DASH_30YD', 4.5, T9), splitRow('DASH_30YD', 'DASH_10YD', 1.8, T9)];

  it('with no earlier row is inserted', () => {
    expect(decide([], run9, 'skip').decision).toEqual({ kind: 'insert', deleteIds: [] });
  });

  it('skip: an earlier row of the same run time skips the drill row and every split', () => {
    expect(decide(earlier9(), run9, 'skip').decision).toEqual({ kind: 'skip', skipped: 2 });
  });

  it('replace: deletes exactly the rows of the same run time and consumes the key', () => {
    const rows = [...earlier9(), drillRow('DASH_30YD', 4.4, T14)];
    const { decision, state } = decide(rows, run9, 'replace');
    expect(decision).toEqual({ kind: 'insert', deleteIds: [rows[0].id, rows[1].id] });
    expect(state.earlierByRun.has(`${A}|${D}|DASH_30YD|${T14}`)).toBe(true);
    expect(state.consumedKeys.has(`${A}|${D}|DASH_30YD|${T9}`)).toBe(true);
  });

  it('replace: a second run with a consumed key is inserted without deleting', () => {
    const { state } = decide(earlier9(), run9, 'replace');
    expect(decide([], { ...run9, value: 4.6 }, 'replace', state).decision).toEqual({ kind: 'insert', deleteIds: [] });
  });

  it('a different run time does not match a timestamped run of the same drill', () => {
    expect(decide(earlier9(), { ...run9, runAt: T14 }, 'skip').decision).toEqual({ kind: 'insert', deleteIds: [] });
  });

  it('another drill on the same date does not match', () => {
    expect(decide(earlier9(), { ...run9, metric: 'DASH_20YD' }, 'skip').decision).toEqual({ kind: 'insert', deleteIds: [] });
  });
});

describe('decideDuplicate: legacy rows (no runAt)', () => {
  const legacy = () => [drillRow('DASH_30YD', 4.4), row('DASH_10YD', 1.9, null, 'Split from DASH_30YD — x')];

  it('match a new run with the same value (rounded to 3 decimals): skip skips it', () => {
    expect(decide(legacy(), { metric: 'DASH_30YD', value: 4.4004, runAt: T9 }, 'skip').decision).toEqual({ kind: 'skip', skipped: 1 });
  });

  it('with the same value: replace deletes the whole legacy group once', () => {
    const rows = legacy();
    const { decision, state } = decide(rows, { metric: 'DASH_30YD', value: 4.4, runAt: T9 }, 'replace');
    expect(decision).toEqual({ kind: 'insert', deleteIds: rows.map((r) => r.id) });
    expect(decide([], { metric: 'DASH_30YD', value: 4.4, runAt: T14 }, 'replace', state).decision).toEqual({ kind: 'insert', deleteIds: [] });
  });

  it('with a different value are another session: the run is inserted under skip and replace', () => {
    for (const strategy of ['skip', 'replace'] as const) {
      expect(decide(legacy(), { metric: 'DASH_30YD', value: 4.9, runAt: T9 }, strategy).decision).toEqual({ kind: 'insert', deleteIds: [] });
    }
  });

  it('are not used when the run time has its own earlier rows', () => {
    const rows = [...legacy(), drillRow('DASH_30YD', 4.5, T9)];
    const { decision } = decide(rows, { metric: 'DASH_30YD', value: 4.4, runAt: T9 }, 'replace');
    expect(decision).toEqual({ kind: 'insert', deleteIds: [rows[2].id] });
  });

  it('a run without runAt uses only the legacy value rule, never timestamped runs', () => {
    const timestamped = [drillRow('DASH_30YD', 4.5, T9)];
    expect(decide(timestamped, { metric: 'DASH_30YD', value: 4.5 }, 'replace').decision).toEqual({ kind: 'insert', deleteIds: [] });
    expect(decide([drillRow('DASH_30YD', 4.5)], { metric: 'DASH_30YD', value: 4.5 }, 'skip').decision).toEqual({ kind: 'skip', skipped: 1 });
  });
});

describe('decideDuplicate: one value per day (derived fly, RSI)', () => {
  const fly = (value: number): DuplicateDrill => ({ metric: 'FLY10_TIME_RI10', value, derivedFrom: 'DASH_30YD splits' });
  const flies = () => [drillRow('FLY10_TIME_RI10', 1.3), drillRow('FLY10_TIME_RI10', 1.25, T9)];

  it('skip: a value better than every earlier one is inserted, nothing deleted', () => {
    expect(decide(flies(), fly(1.2), 'skip').decision).toEqual({ kind: 'insert', deleteIds: [] });
  });

  it('skip: a value not better than every earlier one (or equal) is skipped', () => {
    expect(decide(flies(), fly(1.28), 'skip').decision).toEqual({ kind: 'skip', skipped: 1 });
    expect(decide(flies(), fly(1.25), 'skip').decision).toEqual({ kind: 'skip', skipped: 1 });
  });

  it('replace: an earlier strictly better value is kept', () => {
    expect(decide(flies(), fly(1.28), 'replace').decision).toEqual({ kind: 'skip', skipped: 1 });
  });

  it('replace: an equal or better value replaces every earlier row of the code, whatever its runAt', () => {
    const rows = flies();
    const { decision, state } = decide(rows, fly(1.25), 'replace');
    expect(decision).toEqual({ kind: 'insert', deleteIds: rows.map((r) => r.id) });
    expect(state.earlierByRun.size).toBe(0);
  });

  it('does not match another code whose name starts with the same letters', () => {
    expect(decide([drillRow('FLY10_TIME_RI10', 1.0)], { ...fly(1.5), metric: 'FLY10_TIME' }, 'skip').decision)
      .toEqual({ kind: 'insert', deleteIds: [] });
  });

  it('RSI follows the rule with the metric direction (higher is better)', () => {
    const rsi = (value: number): DuplicateDrill => ({ metric: 'RSI', value });
    const rows = [drillRow('RSI', 2.0)];
    expect(decide(rows, rsi(2.5), 'skip', undefined, higherIsBetter).decision).toEqual({ kind: 'insert', deleteIds: [] });
    expect(decide(rows, rsi(1.5), 'skip', undefined, higherIsBetter).decision).toEqual({ kind: 'skip', skipped: 1 });
    expect(decide(rows, rsi(1.5), 'replace', undefined, higherIsBetter).decision).toEqual({ kind: 'skip', skipped: 1 });
  });

  it('a skipped one-per-day row counts its splits like any run', () => {
    expect(decide(flies(), { ...fly(1.28), splits: [{}, {}] }, 'skip').decision).toEqual({ kind: 'skip', skipped: 3 });
  });
});

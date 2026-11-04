import { describe, it, expect } from 'vitest';
import { buildRadar, type NormDistribution, type RadarInput } from '../radar';

const seq = (n: number, from = 1) => Array.from({ length: n }, (_, i) => from + i);

const dist = (over: Partial<NormDistribution> = {}): NormDistribution => ({
  versionId: 'v1',
  versionCreatedAt: '2026-01-01T00:00:00Z',
  source: 'BTA data',
  metricCode: 'DASH_10YD',
  sex: 'male',
  ageMin: 13,
  ageMax: 14,
  kind: 'raw',
  values: seq(30),
  ...over,
});

const FULL = new Map<string, number>([
  ['DASH_10YD', 15],
  ['FLY10_TIME_RI30', 15],
  ['JUMP_CMJ_HOH', 15],
  ['RSI_105', 15],
  ['AGILITY_505_M_L', 10],
  ['AGILITY_505_M_R', 20],
  ['JUMP_BROAD', 15],
]);

const normAll = (over: Partial<NormDistribution> = {}) =>
  ['DASH_10YD', 'FLY10_TIME_RI30', 'JUMP_CMJ_HOH', 'RSI_105', 'AGILITY_505_M', 'JUMP_BROAD'].map((metricCode) => dist({ metricCode, ...over }));

const input = (over: Partial<RadarInput> = {}): RadarInput => ({
  bests: FULL,
  unitOf: (code) => (code === 'JUMP_BROAD' || code === 'JUMP_CMJ_HOH' ? 'in' : code === 'RSI_105' ? '' : 's'),
  gender: 'Male',
  age: 13,
  cohort: { kind: 'norm', distributions: normAll() },
  ...over,
});

const byAxis = (r: ReturnType<typeof buildRadar>, axis: string) => r.axes.find((a) => a.axis === axis)!;

describe('buildRadar', () => {
  it('has the six fixed axes in order, none of them EUR or MQI', () => {
    const r = buildRadar(input());
    expect(r.axes.map((a) => a.axis)).toEqual([
      'acceleration', 'highSpeedRunning', 'verticalPower', 'reactiveStrength', 'changeOfDirection', 'horizontalPower',
    ]);
    expect(r.axes.map((a) => a.code)).toEqual(['DASH_10YD', 'FLY10_TIME_RI30', 'JUMP_CMJ_HOH', 'RSI_105', 'AGILITY_505_M', 'JUMP_BROAD']);
    expect(r.scoredCount).toBe(6);
  });

  it('carries MQI beside the axes: total and band when present, "not tested" nulls when absent', () => {
    expect(buildRadar(input({ mqiTotal: 20 })).movement.total).toBe(20);
    expect(buildRadar(input({ mqiTotal: 20 })).movement.band).not.toBeNull();
    expect(buildRadar(input()).movement).toEqual({ total: null, band: null });
    expect(buildRadar(input({ mqiTotal: 20 })).axes.some((a) => /MQ/.test(a.code))).toBe(false);
  });

  it('honors direction: lower is better inverts, higher is better does not', () => {
    const r = buildRadar(input());
    // 30-value sample 1..30, x=15: mid-rank 14.5/30 = 48.33 -> higher 48, lower 52
    expect(byAxis(r, 'verticalPower').percentile).toBe(48);
    expect(byAxis(r, 'acceleration').percentile).toBe(52);
    expect(byAxis(r, 'horizontalPower').percentile).toBe(48);
    expect(byAxis(r, 'reactiveStrength').percentile).toBe(48);
  });

  it('uses the mean of the left and right 5-0-5 best, lower is better', () => {
    const cod = byAxis(buildRadar(input()), 'changeOfDirection');
    expect(cod.value).toBe(15);
    expect(cod.percentile).toBe(52);
    expect(cod.displayValue).toBe('15 s');
  });

  it('uses the yard 5-0-5 when only the yard legs were recorded', () => {
    const bests = new Map(FULL);
    bests.delete('AGILITY_505_M_L');
    bests.delete('AGILITY_505_M_R');
    bests.set('AGILITY_505_YD_L', 10);
    bests.set('AGILITY_505_YD_R', 14);
    const r = buildRadar(input({ bests, cohort: { kind: 'norm', distributions: [dist({ metricCode: 'AGILITY_505_YD' })] } }));
    const cod = byAxis(r, 'changeOfDirection');
    expect(cod.code).toBe('AGILITY_505_YD');
    expect(cod.value).toBe(12);
    expect(cod.percentile).not.toBeNull();
  });

  it('leaves the 5-0-5 unscored when only one leg was measured', () => {
    const bests = new Map(FULL);
    bests.delete('AGILITY_505_M_R');
    const cod = byAxis(buildRadar(input({ bests })), 'changeOfDirection');
    expect(cod.value).toBeNull();
    expect(cod.percentile).toBeNull();
    expect(cod.displayValue).toBeNull();
  });

  it('shows the fly as mph with one decimal and keeps the raw time as detail; percentile is on the time', () => {
    const bests = new Map(FULL);
    bests.set('FLY10_TIME_RI30', 1);
    const r = buildRadar(input({ bests }));
    const a = byAxis(r, 'highSpeedRunning');
    expect(a.value).toBe(1);
    expect(a.displayValue).toBe('20.5 mph');
    expect(a.detail).toBe('1 s');
    // 1 is the lowest time in 1..30 -> best
    expect(a.percentile).toBe(98);
  });

  it('does not score a missing test, and never imputes zero or 50', () => {
    const bests = new Map(FULL);
    bests.delete('RSI_105');
    const a = byAxis(buildRadar(input({ bests })), 'reactiveStrength');
    expect(a.value).toBeNull();
    expect(a.displayValue).toBeNull();
    expect(a.percentile).toBeNull();
  });

  it('norm cohort needs n >= 30: 29 is unscored, 30 is scored', () => {
    const at = (n: number) => buildRadar(input({ cohort: { kind: 'norm', distributions: normAll({ values: seq(n) }) } }));
    expect(byAxis(at(29), 'acceleration').percentile).toBeNull();
    expect(byAxis(at(29), 'acceleration').n).toBe(29);
    expect(at(29).scoredCount).toBe(0);
    expect(byAxis(at(30), 'acceleration').percentile).not.toBeNull();
  });

  it('is unscored when sex is not Male or Female', () => {
    for (const gender of [null, 'Not Specified', 'Other']) {
      const r = buildRadar(input({ gender }));
      expect(r.scoredCount).toBe(0);
      expect(byAxis(r, 'acceleration').value).toBe(15);
    }
  });

  it('is unscored when the age is unknown or outside every band', () => {
    expect(buildRadar(input({ age: null })).scoredCount).toBe(0);
    expect(buildRadar(input({ age: 15 })).scoredCount).toBe(0);
    expect(buildRadar(input({ age: 12 })).scoredCount).toBe(0);
    expect(buildRadar(input({ age: 14 })).scoredCount).toBe(6);
  });

  it('picks the most recent distribution version that has the metric, sex and age band', () => {
    const old = normAll({ versionId: 'old', versionCreatedAt: '2025-01-01T00:00:00Z', source: 'Old source', values: seq(40, 100) });
    const recent = normAll({ versionId: 'new', versionCreatedAt: '2026-06-01T00:00:00Z', source: 'New source' });
    // The newest version lacks the female rows: a female athlete falls back to the older version
    const female = buildRadar(input({ gender: 'Female', cohort: { kind: 'norm', distributions: [...old.map((d) => ({ ...d, sex: 'female' })), ...recent] } }));
    expect(byAxis(female, 'acceleration').distributionVersionId).toBe('old');
    const male = buildRadar(input({ cohort: { kind: 'norm', distributions: [...old, ...recent] } }));
    const a = byAxis(male, 'acceleration');
    expect(a.distributionVersionId).toBe('new');
    expect(a.source).toBe('New source');
    expect(a.cohortKind).toBe('norm');
    expect(a.cohortLabel).toContain('New source');
    expect(a.cohortLabel).toContain('13-14');
    expect(a.n).toBe(30);
  });

  it('ignores quantile rows, which the percentile module cannot score yet', () => {
    const r = buildRadar(input({ cohort: { kind: 'norm', distributions: normAll({ kind: 'quantiles' }) } }));
    expect(r.scoredCount).toBe(0);
  });

  describe('event and team cohorts', () => {
    const peersOf = (n: number) => {
      const peers = new Map<string, Map<string, number>>();
      for (let i = 1; i <= n; i++) {
        peers.set(`p${i}`, new Map([['DASH_10YD', i], ['JUMP_CMJ_HOH', i], ['AGILITY_505_M_L', i], ['AGILITY_505_M_R', i + 10]]));
      }
      return peers;
    };

    it('scores at n = 10 and not at n = 9, whole group, no sex or age filter', () => {
      const run = (n: number) =>
        buildRadar(input({ gender: null, age: null, cohort: { kind: 'event', label: 'This event', peers: peersOf(n) } }));
      expect(byAxis(run(9), 'acceleration').percentile).toBeNull();
      expect(byAxis(run(9), 'acceleration').n).toBe(9);
      const ten = run(10);
      // athlete DASH_10YD 15 in 1..10 -> beyond the slowest, lower is better -> 0
      expect(byAxis(ten, 'acceleration').percentile).toBe(0);
      expect(byAxis(ten, 'acceleration').cohortKind).toBe('event');
      expect(byAxis(ten, 'acceleration').cohortLabel).toBe('This event');
      expect(byAxis(ten, 'acceleration').distributionVersionId).toBeNull();
      expect(byAxis(ten, 'verticalPower').percentile).toBe(100);
    });

    it('builds each peer 5-0-5 as the mean of their legs and skips peers missing a leg', () => {
      const peers = peersOf(10);
      peers.set('half', new Map([['AGILITY_505_M_L', 1]]));
      const cod = byAxis(buildRadar(input({ cohort: { kind: 'team', label: 'U14', peers } })), 'changeOfDirection');
      expect(cod.n).toBe(10);
      expect(cod.cohortKind).toBe('team');
      // peer means 6..15; athlete mean 15 -> mid-rank 9.5/10 = 95, lower is better -> 5
      expect(cod.percentile).toBe(5);
    });
  });
});

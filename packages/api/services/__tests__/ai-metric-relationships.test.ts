import { describe, it, expect } from 'vitest';
import {
  RELATIONSHIPS,
  firedRelationships,
  sameRunSplits,
  splitFacts,
  standingOf,
  type RelationshipInput,
} from '../ai-metric-relationships';

const ids = (input: RelationshipInput) => firedRelationships(input).map((r) => r.id);
const row = (metric: string, value: number, runId?: string, formula = 'direct_import_split') => ({
  metric,
  value: String(value),
  date: '2026-02-01',
  isVerified: true,
  organizationId: 'o',
  importBatchId: null,
  notes: null,
  calculationMetadata: runId ? { formula, runId } : null,
});
const run = (runId: string, t: [number, number, number, number]) =>
  [10, 20, 30, 40].map((d, i) => row(`DASH_${d}YD`, t[i], runId));

describe('sameRunSplits', () => {
  it('reads the gate times of one run', () => {
    expect(sameRunSplits(run('a', [1.74, 3.01, 4.14, 5.26]))).toEqual({ 10: 1.74, 20: 3.01, 30: 4.14, 40: 5.26 });
  });
  it('never mixes gates of different runs: a run missing a gate is skipped', () => {
    // run a has 10 and 20 only, run b has 30 and 40 only: best-per-code would give four gates, same-run gives none
    const rows = [row('DASH_10YD', 1.7, 'a'), row('DASH_20YD', 3.0, 'a'), row('DASH_30YD', 4.1, 'b'), row('DASH_40YD', 5.2, 'b')];
    expect(sameRunSplits(rows)).toBeUndefined();
  });
  it('rows without a run id are never used (they are best-per-code pools)', () => {
    expect(sameRunSplits([10, 20, 30, 40].map((d) => row(`DASH_${d}YD`, d / 8)))).toBeUndefined();
  });
  it('picks the run with the fastest 40 when several are complete', () => {
    const rows = [...run('slow', [1.8, 3.1, 4.3, 5.5]), ...run('fast', [1.7, 2.95, 4.05, 5.15])];
    expect(sameRunSplits(rows)?.[40]).toBe(5.15);
  });
  it('ignores unverified rows and meter rows', () => {
    const rows = run('a', [1.74, 3.01, 4.14, 5.26]).map((r) => ({ ...r, isVerified: false }));
    expect(sameRunSplits(rows)).toBeUndefined();
    expect(sameRunSplits([10, 20, 30, 40].map((d) => row(`DASH_${d}M`, d / 8, 'a')))).toBeUndefined();
  });
  it('a drill row (Final Time) counts as the gate at its own distance', () => {
    const rows = [row('DASH_10YD', 1.74, 'a'), row('DASH_20YD', 3.01, 'a'), row('DASH_30YD', 4.14, 'a'), row('DASH_40YD', 5.26, 'a', 'drill')];
    expect(sameRunSplits(rows)?.[40]).toBe(5.26);
  });
  it('undefined without rows', () => expect(sameRunSplits(undefined)).toBeUndefined());
});

describe('splitFacts', () => {
  it('states interval times and the fastest 10 yards with an about speed, all from the one run', () => {
    expect(splitFacts({ 10: 1.74, 20: 3.01, 30: 4.14, 40: 5.26 })).toEqual([
      'From one 40-yard run: first 10 yards 1.74 s, yards 10-20 1.27 s, yards 20-30 1.13 s, yards 30-40 1.12 s',
      'Fastest 10 yards of that run: 1.12 s (yards 30-40), about 18.3 mph',
    ]);
  });
  it('is silent when an interval is not positive', () => {
    expect(splitFacts({ 10: 1.74, 20: 1.7, 30: 4.14, 40: 5.26 })).toEqual([]);
  });
});

describe('relationship 1: the start costs time', () => {
  const base: RelationshipInput = { values: {}, standing: { DASH_10YD: 'slow', FLY10_TIME_RI30: 'good' } };
  it('fires: slow start, late speed average or better', () => expect(ids(base)).toContain('start-costs-time'));
  it('does not fire when top speed is slow too', () => expect(ids({ ...base, standing: { DASH_10YD: 'slow', FLY10_TIME_RI30: 'slow' } })).not.toContain('start-costs-time'));
  it('does not fire when the start is fine', () => expect(ids({ ...base, standing: { DASH_10YD: 'good', FLY10_TIME_RI30: 'good' } })).not.toContain('start-costs-time'));
  it('is silent when either standing is unknown', () => {
    expect(ids({ values: {}, standing: { DASH_10YD: 'slow' } })).not.toContain('start-costs-time');
    expect(ids({ values: {}, standing: { FLY10_TIME_RI30: 'good' } })).not.toContain('start-costs-time');
  });
});

describe('relationship 2: the shape of late speed (same-run splits)', () => {
  const at = (t30: number, t40: number): RelationshipInput => ({ values: {}, standing: {}, splits: { 10: 1.74, 20: 3.0, 30: t30, 40: t40 } });
  it('fires "levels off" when the last two intervals are within the tolerance', () => {
    expect(ids(at(4.13, 5.25))).toEqual(['speed-levels-off']); // 1.13 and 1.12
    expect(ids(at(4.13, 5.27))).toEqual(['speed-levels-off']); // 1.13 and 1.14, exactly 0.01
    expect(ids(at(4.12, 5.26))).toEqual(['speed-levels-off']); // 1.12 and 1.14, exactly at 0.02
  });
  it('fires "still gaining" when the last interval is faster by 0.05 s or more', () => {
    expect(ids(at(4.15, 5.22))).toEqual(['speed-still-gaining']); // 1.15 and 1.07
    expect(ids(at(4.15, 5.25))).toEqual(['speed-still-gaining']); // 1.15 and 1.10, exactly 0.05
  });
  it('does not fire in between, or when the last interval is slower', () => {
    expect(ids(at(4.15, 5.26))).toEqual([]); // 1.15 and 1.11: faster by 0.04, short of 0.05
    expect(ids(at(4.13, 5.3))).toEqual([]); // 1.13 and 1.17: slower
  });
  it('is silent without same-run splits', () => expect(ids({ values: {}, standing: {} })).toEqual([]));
});

describe('relationship 3: not gaining from the dip', () => {
  const base: RelationshipInput = { values: { POWER_EUR: 1.01, JUMP_CMJ_HOH: 19.1, JUMP_SJ_HEIGHT: 18.9 }, standing: {}, units: { JUMP_CMJ_HOH: 'in', JUMP_SJ_HEIGHT: 'in' } };
  it('fires with a low EUR and the two jumps within the difference', () => expect(ids(base)).toContain('no-gain-from-dip'));
  it('does not fire when EUR is 1.05 or more', () => expect(ids({ ...base, values: { ...base.values, POWER_EUR: 1.05 } })).not.toContain('no-gain-from-dip'));
  it('fires at exactly the difference (0.5 in)', () => expect(ids({ ...base, values: { ...base.values, JUMP_CMJ_HOH: 19.4 } })).toContain('no-gain-from-dip'));
  it('does not fire at a larger difference', () => expect(ids({ ...base, values: { ...base.values, JUMP_CMJ_HOH: 19.5 } })).not.toContain('no-gain-from-dip'));
  it('is silent when an input is missing or the unit is not inches', () => {
    expect(ids({ ...base, values: { POWER_EUR: 1.01, JUMP_CMJ_HOH: 19.1 } })).not.toContain('no-gain-from-dip');
    expect(ids({ ...base, units: { JUMP_CMJ_HOH: 'cm', JUMP_SJ_HEIGHT: 'cm' } })).not.toContain('no-gain-from-dip');
    expect(ids({ ...base, units: undefined })).not.toContain('no-gain-from-dip');
  });
});

describe('relationship 4: the turns cost time', () => {
  const base: RelationshipInput = { values: { AGILITY_5105: 4.9, DASH_20YD: 3.0 }, standing: { DASH_20YD: 'good' } };
  it('fires when 5-10-5 minus the 20-yard dash is 1.80 s or more and straight speed is fine', () => expect(ids(base)).toContain('turns-cost-time'));
  it('does not fire below the difference', () => expect(ids({ ...base, values: { AGILITY_5105: 4.79, DASH_20YD: 3.0 } })).not.toContain('turns-cost-time'));
  it('does not fire when straight speed is also slow (Chris-like)', () => expect(ids({ ...base, standing: { DASH_20YD: 'slow' } })).not.toContain('turns-cost-time'));
  it('is silent with an unknown standing or a missing value', () => {
    expect(ids({ ...base, standing: {} })).not.toContain('turns-cost-time');
    expect(ids({ ...base, values: { AGILITY_5105: 4.9 } })).not.toContain('turns-cost-time');
  });
});

describe('the relationship set', () => {
  it('texts carry no numbers and never use the words the family rules forbid', () => {
    for (const r of RELATIONSHIPS) {
      expect(r.text, r.id).not.toMatch(/\d/);
      expect(r.text, r.id).not.toMatch(/\b(?:proves?|balanced|safe|ready|cleared|diagnos\w*)\b/i);
    }
  });
  it('has the four Appendix B relationships (relationship 2 has two outcomes)', () => {
    expect(RELATIONSHIPS.map((r) => r.id).sort()).toEqual(['no-gain-from-dip', 'speed-levels-off', 'speed-still-gaining', 'start-costs-time', 'turns-cost-time']);
  });
  it('the Chris-like data fires relationship 2 and 3 only', () => {
    const chris: RelationshipInput = {
      values: { DASH_20YD: 3.01, AGILITY_5105: 4.96, POWER_EUR: 1.01, JUMP_CMJ_HOH: 19.1, JUMP_SJ_HEIGHT: 18.9 },
      standing: { DASH_10YD: 'slow', DASH_20YD: 'slow', FLY10_TIME_RI30: 'slow' },
      units: { JUMP_CMJ_HOH: 'in', JUMP_SJ_HEIGHT: 'in' },
      splits: { 10: 1.74, 20: 3.01, 30: 4.14, 40: 5.26 },
    };
    expect(ids(chris).sort()).toEqual(['no-gain-from-dip', 'speed-levels-off']);
  });
});

describe('prompt blocks', () => {
  const base = {
    reportType: 'individual' as const, reportName: 'T', organizationName: 'O', timeframe: 'x',
    athleteName: 'Casey Moore', audience: 'parent' as const,
    metrics: [{ code: 'DASH_40YD', label: '40-Yard Dash', values: [5.26], unit: 's', lowerIsBetter: true }],
  };
  it('renders split facts and fired connections inside the fence', async () => {
    const { buildPrompt } = await import('../ai-insights-service');
    const p = buildPrompt({ ...base, splitFacts: ['From one 40-yard run: first 10 yards 1.74 s'], connections: ['Straight speed is fine; the turns cost time.'] });
    const fenced = p.slice(p.indexOf('<report_data>'), p.indexOf('</report_data>'));
    expect(fenced).toContain('## Split Facts');
    expect(fenced).toContain('- From one 40-yard run: first 10 yards 1.74 s');
    expect(fenced).toContain('## How results connect');
    expect(fenced).toContain('- Straight speed is fine; the turns cost time.');
  });
  it('renders neither block when nothing fired', async () => {
    const { buildPrompt } = await import('../ai-insights-service');
    const p = buildPrompt({ ...base, connections: [], splitFacts: [] });
    expect(p).not.toContain('## Split Facts');
    expect(p).not.toContain('## How results connect');
  });
  it('team reports never carry them', async () => {
    const { buildPrompt } = await import('../ai-insights-service');
    const p = buildPrompt({ ...base, reportType: 'team', connections: ['x'], splitFacts: ['y'] });
    expect(p).not.toContain('## How results connect');
  });
});

describe('standingOf', () => {
  const tiers = [{ tierName: 'Good' }, { tierName: 'Average' }];
  const tier = (tierName: string) => ({ comparisonOperator: 'range', tierName, allTiers: tiers });
  it('the bottom tier is slow even when it is labelled Average; a higher tier is good', () => {
    expect(standingOf([tier('Average')])).toBe('slow');
    expect(standingOf([tier('Good')])).toBe('good');
  });
  it('any bottom tier wins over a better group', () => expect(standingOf([tier('Good'), tier('Average')])).toBe('slow'));
  it('a single-tier group says nothing; the percentile decides', () => {
    expect(standingOf([{ comparisonOperator: 'range', tierName: 'Good', allTiers: [{ tierName: 'Good' }] }], 10)).toBe('slow');
    expect(standingOf(undefined, 60)).toBe('good');
  });
  it('is unknown between the percentile limits and without data', () => {
    expect(standingOf(undefined, 40)).toBeUndefined();
    expect(standingOf(undefined)).toBeUndefined();
    expect(standingOf([])).toBeUndefined();
  });
});

import { describe, it, expect } from 'vitest';
import { insertSiteMetricSchema, type Measurement } from '@shared/schema';
import { selectSameRunSources, sameRunKey } from '../same-run-sources';

let seq = 0;
const row = (metric: string, value: number, runId?: string, createdAt = new Date(2026, 9, 13, 10, 0, seq++)) =>
  ({
    id: `m${seq}`,
    metric,
    value: String(value),
    createdAt,
    calculationMetadata: runId ? { runId } : null,
  }) as unknown as Measurement;

const LOWER = () => false;
const CODES = ['DASH_10YD', 'DASH_20YD'];

const pick = (rows: Measurement[], higherIsBetter = LOWER, codes = CODES) => {
  const sel = selectSameRunSources(rows, codes, higherIsBetter);
  return sel && Object.fromEntries([...sel].map(([c, m]) => [c, m.value]));
};

describe('selectSameRunSources', () => {
  it('takes every input from one run when the best of each input live in different runs', () => {
    const rows = [
      row('DASH_10YD', 1.69, 'A'), row('DASH_20YD', 2.95, 'A'),
      row('DASH_10YD', 1.73, 'B'), row('DASH_20YD', 2.85, 'B'),
    ];
    // Independent bests would be 1.69 + 2.85; one run gives 1.69 + 2.95
    expect(pick(rows)).toEqual({ DASH_10YD: '1.69', DASH_20YD: '2.95' });
  });

  it('ignores a run that lacks one of the inputs, even when it has the best value', () => {
    const rows = [
      row('DASH_10YD', 1.5, 'A'),
      row('DASH_10YD', 1.69, 'B'), row('DASH_20YD', 2.95, 'B'),
    ];
    expect(pick(rows)).toEqual({ DASH_10YD: '1.69', DASH_20YD: '2.95' });
  });

  it('returns null when no single run has all inputs', () => {
    const rows = [row('DASH_10YD', 1.69, 'A'), row('DASH_20YD', 2.85, 'B')];
    expect(pick(rows)).toBeNull();
  });

  it('breaks a tie on the first input by the next input, then by newest run', () => {
    const tieOn10 = [
      row('DASH_10YD', 1.7, 'A'), row('DASH_20YD', 2.95, 'A'),
      row('DASH_10YD', 1.7, 'B'), row('DASH_20YD', 2.9, 'B'),
    ];
    expect(pick(tieOn10)).toEqual({ DASH_10YD: '1.7', DASH_20YD: '2.9' });

    const older = new Date(2026, 9, 13, 9);
    const newer = new Date(2026, 9, 13, 11);
    const fullTie = [
      row('DASH_10YD', 1.7, 'old', older), row('DASH_20YD', 2.9, 'old', older),
      row('DASH_10YD', 1.7, 'new', newer), row('DASH_20YD', 2.9, 'new', newer),
    ];
    const sel = selectSameRunSources(fullTie, CODES, LOWER)!;
    expect(sameRunKey(sel.get('DASH_10YD')!)).toBe('new');
  });

  it('honours a higher-is-better input', () => {
    const rows = [
      row('DASH_10YD', 1.69, 'A'), row('DASH_20YD', 2.95, 'A'),
      row('DASH_10YD', 1.69, 'B'), row('DASH_20YD', 3.05, 'B'),
    ];
    expect(pick(rows, (c) => c === 'DASH_20YD')).toEqual({ DASH_10YD: '1.69', DASH_20YD: '3.05' });
  });

  it('pools rows without a run id (manual entry) with the old best-of-each rule, never mixed with runs', () => {
    const rows = [
      row('DASH_10YD', 1.8), row('DASH_10YD', 1.75), row('DASH_20YD', 3.0), // manual: best 1.75 / 3.0
      row('DASH_10YD', 1.69, 'A'), // imported run without a 20 yd
    ];
    expect(pick(rows)).toEqual({ DASH_10YD: '1.75', DASH_20YD: '3' });
  });

  it('never fills a run from the manual pool', () => {
    const rows = [row('DASH_10YD', 1.69, 'A'), row('DASH_20YD', 3.0)];
    expect(pick(rows)).toBeNull();
  });
});

describe('calculationConfig.sameRunInputs validation', () => {
  const metric = (calculationConfig: object, dependentMetrics = ['DASH_10YD', 'DASH_20YD', 'AGILITY_505_M_L']) =>
    insertSiteMetricSchema.safeParse({
      code: 'TST_X', label: 'x', isDerived: true, formula: 'dash_10yd', dependentMetrics, calculationConfig,
    });
  const base = { dateMatchStrategy: 'same_date', missingSourceBehavior: 'skip' };

  it('accepts two dependent metrics under same_date', () => {
    expect(metric({ ...base, sameRunInputs: ['DASH_10YD', 'DASH_20YD'] }).success).toBe(true);
  });

  it('rejects a code that is not a dependent metric, a single code, and other strategies', () => {
    expect(metric({ ...base, sameRunInputs: ['DASH_10YD', 'DASH_30YD'] }).success).toBe(false);
    expect(metric({ ...base, sameRunInputs: ['DASH_10YD'] }).success).toBe(false);
    expect(metric({ ...base, dateMatchStrategy: 'closest', sameRunInputs: ['DASH_10YD', 'DASH_20YD'] }).success).toBe(false);
  });
});

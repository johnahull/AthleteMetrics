/**
 * computeAndUpsertDerived must not crash when the source map is empty (a derived
 * metric with no dependent metrics): there is no source row to inherit context
 * from, so it returns null instead of reducing an empty array.
 */
import { describe, it, expect, vi } from 'vitest';
import { DerivedMetricCalculator } from '../derived-metric-calculator';

/** Minimal drizzle-like tx: each select() resolves to the next queued result. */
function fakeTx(selectResults: unknown[][]) {
  const insert = vi.fn();
  const chain = (rows: unknown[]) => {
    const p: any = Promise.resolve(rows);
    p.from = () => p;
    p.where = () => p;
    p.limit = () => p;
    return p;
  };
  return {
    execute: vi.fn().mockResolvedValue(undefined),
    select: vi.fn(() => chain(selectResults.shift() ?? [])),
    insert,
  };
}

describe('DerivedMetricCalculator.computeAndUpsertDerived with no source measurements', () => {
  it('returns null and writes nothing when the source map is empty', async () => {
    const calculator = new DerivedMetricCalculator({} as any);
    vi.spyOn(calculator as any, 'findSourceMeasurementsInTransaction').mockResolvedValue(new Map());
    // direct-measurement check -> none; user lookup -> found; existing calculated -> none
    const tx = fakeTx([[], [{ id: 'u1', birthDate: null }], []]);

    const result = await (calculator as any).computeAndUpsertDerived(
      tx,
      { code: 'CONST_TOTAL', formula: '1 + 1', dependentMetrics: [], calculationConfig: null, unit: 'score' },
      'u1',
      '2026-03-10',
      new Map(),
      undefined,
    );

    expect(result).toBeNull();
    expect(tx.insert).not.toHaveBeenCalled();
  });
});

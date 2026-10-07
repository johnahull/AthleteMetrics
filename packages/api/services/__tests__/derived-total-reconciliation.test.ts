/**
 * Unit tests for derived-total drift detection (issue #526).
 * detectDrift is a pure function: given the source rows and calculated total rows
 * for one (athlete, derived metric, date), it says whether the total needs repair.
 */
import { describe, it, expect } from 'vitest';
import { detectDrift } from '../derived-total-reconciliation';

const deps = ['MQ_A', 'MQ_B'];
const src = (id: string, metric: string, value = '3.000') => ({ id, metric, value });
const total = (over: Record<string, unknown> = {}) => ({
  id: 't1',
  value: '6.000',
  calculatedFromMeasurementIds: ['a', 'b'],
  calculationMetadata: { sourceValues: { mq_a: 3, mq_b: 3 } },
  ...over,
});
const base = { dependentMetrics: deps, hasDirectTotal: false };

describe('detectDrift', () => {
  it('returns null when sources and total agree', () => {
    expect(
      detectDrift({ ...base, sources: [src('a', 'MQ_A'), src('b', 'MQ_B')], totals: [total()] })
    ).toBeNull();
  });

  it('flags missing_total when the source set is complete and no total exists', () => {
    expect(
      detectDrift({ ...base, sources: [src('a', 'MQ_A'), src('b', 'MQ_B')], totals: [] })
    ).toBe('missing_total');
  });

  it('does not flag an incomplete source set without a total', () => {
    expect(detectDrift({ ...base, sources: [src('a', 'MQ_A')], totals: [] })).toBeNull();
  });

  it('does not flag a missing total when a direct measurement owns the date', () => {
    expect(
      detectDrift({
        ...base,
        hasDirectTotal: true,
        sources: [src('a', 'MQ_A'), src('b', 'MQ_B')],
        totals: [],
      })
    ).toBeNull();
  });

  it('matches dependent metric codes case-insensitively', () => {
    expect(
      detectDrift({
        dependentMetrics: ['mq_a', 'mq_b'],
        hasDirectTotal: false,
        sources: [src('a', 'MQ_A'), src('b', 'MQ_B')],
        totals: [],
      })
    ).toBe('missing_total');
  });

  it('flags orphaned_total when a source was removed but the total remains', () => {
    expect(
      detectDrift({ ...base, sources: [src('a', 'MQ_A')], totals: [total()] })
    ).toBe('orphaned_total');
  });

  it('flags orphaned_total when a direct measurement coexists with a calculated total', () => {
    expect(
      detectDrift({
        ...base,
        hasDirectTotal: true,
        sources: [src('a', 'MQ_A'), src('b', 'MQ_B')],
        totals: [total()],
      })
    ).toBe('orphaned_total');
  });

  it('flags stale_total when a referenced source value changed', () => {
    expect(
      detectDrift({
        ...base,
        sources: [src('a', 'MQ_A', '5.000'), src('b', 'MQ_B')],
        totals: [total()],
      })
    ).toBe('stale_total');
  });

  it('flags stale_total when a referenced source no longer exists', () => {
    expect(
      detectDrift({
        ...base,
        sources: [src('a', 'MQ_A'), src('b2', 'MQ_B')],
        totals: [total()],
      })
    ).toBe('stale_total');
  });

  it('flags stale_total when a source row is not referenced by the total', () => {
    expect(
      detectDrift({
        ...base,
        sources: [src('a', 'MQ_A'), src('b', 'MQ_B'), src('c', 'MQ_B', '4.000')],
        totals: [total()],
      })
    ).toBe('stale_total');
  });

  it('flags stale_total when the total records no source ids', () => {
    expect(
      detectDrift({
        ...base,
        sources: [src('a', 'MQ_A'), src('b', 'MQ_B')],
        totals: [total({ calculatedFromMeasurementIds: null })],
      })
    ).toBe('stale_total');
  });

  it('flags duplicate_totals when more than one calculated row exists', () => {
    expect(
      detectDrift({
        ...base,
        sources: [src('a', 'MQ_A'), src('b', 'MQ_B')],
        totals: [total(), total({ id: 't2' })],
      })
    ).toBe('duplicate_totals');
  });

  it('returns null for a derived metric with no dependencies', () => {
    expect(detectDrift({ dependentMetrics: [], hasDirectTotal: false, sources: [], totals: [] })).toBeNull();
  });
});

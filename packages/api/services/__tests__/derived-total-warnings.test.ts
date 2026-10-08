/**
 * Unit tests for the DERIVED_TOTAL_STALE warning helpers (issue #526).
 */
import { describe, it, expect } from 'vitest';
import {
  staleWarning,
  warningsFromCalculator,
  dedupeWarnings,
  withWarnings,
} from '../derived-total-warnings';

describe('derived total warnings', () => {
  it('builds a machine-readable DERIVED_TOTAL_STALE warning', () => {
    expect(staleWarning('MQI_TOTAL', '2026-03-10', 'u1')).toEqual({
      code: 'DERIVED_TOTAL_STALE',
      metric: 'MQI_TOTAL',
      date: '2026-03-10',
      userId: 'u1',
    });
  });

  it('maps calculator failures to warnings and tolerates calculators without getFailures', () => {
    const calc = { getFailures: () => [{ metric: 'MQI_TOTAL', date: '2026-03-10', userId: 'u1' }] };
    expect(warningsFromCalculator(calc)).toEqual([staleWarning('MQI_TOTAL', '2026-03-10', 'u1')]);
    expect(warningsFromCalculator({})).toEqual([]);
  });

  it('skips failures with no date (they cannot be retried by date)', () => {
    const calc = { getFailures: () => [{ metric: 'MQI_TOTAL', date: null, userId: 'u1' }] };
    expect(warningsFromCalculator(calc)).toEqual([]);
  });

  it('dedupes by athlete, metric and date', () => {
    const w = staleWarning('A', '2026-01-01', 'u1');
    expect(dedupeWarnings([w, { ...w }, staleWarning('A', '2026-01-02', 'u1'), staleWarning('A', '2026-01-01', 'u2')])).toHaveLength(3);
  });

  it('withWarnings adds the field only when there are warnings', () => {
    const row = { id: 'm1' };
    expect(withWarnings(row, [])).toBe(row);
    expect('warnings' in withWarnings(row, [])).toBe(false);
    expect(withWarnings(row, [staleWarning('A', '2026-01-01', 'u1')])).toEqual({
      id: 'm1',
      warnings: [staleWarning('A', '2026-01-01', 'u1')],
    });
  });
});

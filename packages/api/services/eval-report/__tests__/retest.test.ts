import { describe, it, expect } from 'vitest';
import { selectPriorEvent, retestTrend } from '../retest';

const ev = (id: string, date: string, userId = 'a1', organizationId = 'o1') => ({ id, date, userId, organizationId });

describe('selectPriorEvent', () => {
  const current = ev('cur', '2026-06-01');

  it('picks the latest earlier event by calendar date', () => {
    const prior = selectPriorEvent(current, [ev('old', '2025-01-01'), ev('mid', '2026-02-01'), ev('future', '2026-09-01')]);
    expect(prior?.id).toBe('mid');
  });

  it('excludes the current event and same-day events', () => {
    expect(selectPriorEvent(current, [ev('cur', '2026-06-01'), ev('same', '2026-06-01')])).toBeNull();
  });

  it('only considers the same athlete and organization', () => {
    expect(selectPriorEvent(current, [ev('x', '2026-01-01', 'a2'), ev('y', '2026-01-01', 'a1', 'o2')])).toBeNull();
  });
});

describe('retestTrend', () => {
  const side = (code: string, unit: string, value: number) => ({ code, unit, value });

  it('shows the change when code and unit match', () => {
    const t = retestTrend(side('DASH_10YD', 's', 1.9), side('DASH_10YD', 's', 2.0), true);
    expect(t).toEqual({ change: -0.1, direction: 'improved' });
  });

  it('marks a higher-is-better drop as declined', () => {
    expect(retestTrend(side('JUMP_CMJ_HOH', 'in', 20), side('JUMP_CMJ_HOH', 'in', 22), false)).toEqual({ change: -2, direction: 'declined' });
  });

  it('marks no change as unchanged', () => {
    expect(retestTrend(side('JUMP_CMJ_HOH', 'in', 20), side('JUMP_CMJ_HOH', 'in', 20), false)?.direction).toBe('unchanged');
  });

  it('skips the metric when the code differs', () => {
    expect(retestTrend(side('AGILITY_505_YD', 's', 2.5), side('AGILITY_505_M', 's', 2.7), true)).toBeNull();
  });

  it('skips the metric when the unit differs', () => {
    expect(retestTrend(side('DASH_10YD', 's', 1.9), side('DASH_10YD', 'ms', 2000), true)).toBeNull();
  });

  it('skips the metric when there is no prior value', () => {
    expect(retestTrend(side('DASH_10YD', 's', 1.9), null, true)).toBeNull();
  });
});

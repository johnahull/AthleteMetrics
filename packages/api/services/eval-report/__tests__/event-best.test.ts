import { describe, it, expect } from 'vitest';
import { eventBests, type EventMeasurementRow } from '../event-best';

const lowerIsBetter = (metric: string) => metric === 'DASH_10YD';
const scope = { eventId: 'e1', userId: 'a1', organizationId: 'o1' };
const row = (
  metric: string,
  value: number | string,
  over: Partial<EventMeasurementRow> = {},
): EventMeasurementRow => ({ eventId: 'e1', userId: 'a1', organizationId: 'o1', metric, value, ...over });

describe('eventBests', () => {
  it('uses only the given event: an earlier event with a better value never appears', () => {
    const rows = [
      row('DASH_10YD', 1.9),
      row('DASH_10YD', 2.05),
      row('DASH_10YD', 1.7, { eventId: 'first' }), // better, but from the earlier event
      row('JUMP_CMJ_HOH', 30, { eventId: 'first' }),
    ];
    const bests = eventBests(scope, rows, lowerIsBetter);
    expect(bests.get('DASH_10YD')).toBe(1.9);
    expect(bests.has('JUMP_CMJ_HOH')).toBe(false);
  });

  it('ignores rows with no event', () => {
    expect(eventBests(scope, [row('JUMP_CMJ_HOH', 30, { eventId: null })], lowerIsBetter).size).toBe(0);
  });

  it('ignores other athletes in the same event', () => {
    const rows = [row('DASH_10YD', 2.0), row('DASH_10YD', 1.5, { userId: 'a2' }), row('JUMP_CMJ_HOH', 40, { userId: 'a2' })];
    const bests = eventBests(scope, rows, lowerIsBetter);
    expect(bests.get('DASH_10YD')).toBe(2.0);
    expect(bests.has('JUMP_CMJ_HOH')).toBe(false);
  });

  it('ignores rows from another organization', () => {
    const rows = [row('DASH_10YD', 2.0), row('DASH_10YD', 1.4, { organizationId: 'o2' }), row('JUMP_CMJ_HOH', 40, { organizationId: null })];
    const bests = eventBests(scope, rows, lowerIsBetter);
    expect(bests.get('DASH_10YD')).toBe(2.0);
    expect(bests.has('JUMP_CMJ_HOH')).toBe(false);
  });

  it('takes the lowest value when lower is better', () => {
    const rows = [row('DASH_10YD', 2.1), row('DASH_10YD', 1.95), row('DASH_10YD', 2.0)];
    expect(eventBests(scope, rows, lowerIsBetter).get('DASH_10YD')).toBe(1.95);
  });

  it('takes the highest value when higher is better', () => {
    const rows = [row('JUMP_CMJ_HOH', 18), row('JUMP_CMJ_HOH', 22.5), row('JUMP_CMJ_HOH', 20)];
    expect(eventBests(scope, rows, lowerIsBetter).get('JUMP_CMJ_HOH')).toBe(22.5);
  });

  it('parses decimal strings and skips non-numeric values', () => {
    const rows = [row('JUMP_CMJ_HOH', '21.50'), row('JUMP_CMJ_HOH', 'abc')];
    expect(eventBests(scope, rows, lowerIsBetter).get('JUMP_CMJ_HOH')).toBe(21.5);
  });
});

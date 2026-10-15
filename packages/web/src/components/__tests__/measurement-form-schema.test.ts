import { describe, it, expect } from 'vitest';
import { dynamicMeasurementSchema as coachFormSchema } from '../measurement-form';
import { dynamicMeasurementSchema as athleteFormSchema } from '../athlete-measurement-form';

// The shared insertMeasurementSchema accepts 0 so MQ 0-3 scores can be stored
// (metric-aware validation runs server-side). The general measurement forms must
// keep rejecting 0 client-side so their default value of 0 is never submitted.
describe.each([
  ['measurement-form', coachFormSchema],
  ['athlete-measurement-form', athleteFormSchema],
])('%s value validation', (_name, schema) => {
  const base = { userId: 'u1', metric: 'FLY10_TIME', date: '2026-03-10' };

  it('rejects 0', () => {
    const result = schema.safeParse({ ...base, value: 0 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]).toMatchObject({ path: ['value'], message: 'Value must be positive' });
    }
  });

  it('accepts a positive value', () => {
    expect(schema.safeParse({ ...base, value: 1.45 }).success).toBe(true);
  });
});

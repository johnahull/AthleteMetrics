/**
 * The wellness form sends the submitter's LOCAL day. East of UTC that can be one
 * day after the server's UTC day, and it is still not a future date.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { submitWellnessResponseSchema } from '../wellness-validation';

const body = (date: string) => ({ templateId: '00000000-0000-4000-8000-000000000001', date, responses: {} });
const dateError = (date: string) =>
  submitWellnessResponseSchema.safeParse(body(date)).error?.issues.find((i) => i.path[0] === 'date')?.message;

describe('submitWellnessResponseSchema date', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    // 9am on Mar 10 in Auckland, still Mar 9 in UTC
    vi.setSystemTime(new Date('2026-03-09T20:00:00.000Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('accepts the UTC day and a local day one ahead of it', () => {
    expect(dateError('2026-03-09')).toBeUndefined();
    expect(dateError('2026-03-10')).toBeUndefined();
  });

  it('rejects a day no time zone has reached yet', () => {
    expect(dateError('2026-03-11')).toBe('Response date cannot be in the future');
  });
});

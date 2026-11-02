import { describe, it, expect } from 'vitest';
import { getApiRateLimit, DEFAULT_API_RATE_LIMIT } from '../../packages/api/utils/rate-limit-utils';

describe('getApiRateLimit', () => {
  it('defaults to 600 requests per window', () => {
    expect(DEFAULT_API_RATE_LIMIT).toBe(600);
    expect(getApiRateLimit(undefined)).toBe(600);
  });

  it('uses API_RATE_LIMIT when it is a positive integer', () => {
    expect(getApiRateLimit('1000')).toBe(1000);
  });

  it.each(['', 'abc', '0', '-5', '1.5x'])('falls back to the default for %j', (value) => {
    expect(getApiRateLimit(value)).toBe(600);
  });
});

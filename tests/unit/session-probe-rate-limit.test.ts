import { describe, it, expect } from 'vitest';
import { isSessionProbe } from '../../packages/api/utils/rate-limit-utils';
import type { Request } from 'express';

const req = (path: string) => ({ path } as Request);

// A 429 on these made the web app treat the user as logged out.
describe('isSessionProbe', () => {
  it.each(['/auth/me', '/auth/me/organizations'])('matches %s', (p) => {
    expect(isSessionProbe(req(p))).toBe(true);
  });

  it.each(['/auth/login', '/auth/me/other', '/auth/measurement', '/metrics'])('does not match %s', (p) => {
    expect(isSessionProbe(req(p))).toBe(false);
  });
});

import { describe, it, expect } from 'vitest';
import { parseEnv } from '../env';

// A strong 64-char secret for production checks.
const STRONG_SECRET = 'f'.padStart(1, 'f') + '9a3b7c1d2e4f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f9';
const STRONG_32 = '9a3b7c1d2e4f60718293a4b5c6d7e8f9';

function base(overrides: Record<string, string | undefined> = {}) {
  return {
    DATABASE_URL: 'postgresql://localhost:5432/test',
    SESSION_SECRET: STRONG_SECRET,
    NODE_ENV: 'development',
    ...overrides,
  };
}

describe('parseEnv', () => {
  it('accepts a valid environment', () => {
    const env = parseEnv(base());
    expect(env.DATABASE_URL).toContain('postgresql://');
    expect(env.SESSION_SECRET).toBe(STRONG_SECRET);
  });

  it('defaults NODE_ENV to production when unset', () => {
    const env = parseEnv(base({ NODE_ENV: undefined, SESSION_SECRET: STRONG_SECRET }));
    expect(env.NODE_ENV).toBe('production');
  });

  it('rejects a missing DATABASE_URL', () => {
    expect(() => parseEnv(base({ DATABASE_URL: undefined }))).toThrow();
  });

  it('rejects a missing SESSION_SECRET', () => {
    expect(() => parseEnv(base({ SESSION_SECRET: undefined }))).toThrow();
  });

  it('rejects a SESSION_SECRET shorter than 32 chars', () => {
    expect(() => parseEnv(base({ SESSION_SECRET: 'tooshort' }))).toThrow();
  });

  it('rejects a weak SESSION_SECRET (common word)', () => {
    expect(() => parseEnv(base({ SESSION_SECRET: 'password'.repeat(5) }))).toThrow();
  });

  it('rejects a SESSION_SECRET shorter than 64 chars in production', () => {
    expect(() => parseEnv(base({ NODE_ENV: 'production', SESSION_SECRET: STRONG_32 }))).toThrow();
  });

  it('accepts a strong 64+ char SESSION_SECRET in production', () => {
    const env = parseEnv(base({ NODE_ENV: 'production', SESSION_SECRET: STRONG_SECRET }));
    expect(env.NODE_ENV).toBe('production');
  });
});

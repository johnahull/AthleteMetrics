import { describe, it, expect } from 'vitest';
import { parseEnv } from '../env';

// A strong 64-char secret (no repeated halves, no common words); and a strong
// 32-char secret (valid outside production, too short for production).
const STRONG_SECRET = 'a1b2c3d4e5f60718293a4b5c6d7e8f90fedcba9876543210abcdef0123456789';
const STRONG_32 = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';

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

  it('accepts NODE_ENV=testing (Railway testing / PR-preview env)', () => {
    const env = parseEnv(base({ NODE_ENV: 'testing' }));
    expect(env.NODE_ENV).toBe('testing');
  });

  it('rejects a missing DATABASE_URL', () => {
    expect(() => parseEnv(base({ DATABASE_URL: undefined }))).toThrow();
  });

  it('rejects a missing SESSION_SECRET', () => {
    expect(() => parseEnv(base({ SESSION_SECRET: undefined }))).toThrow();
  });

  it('rejects a SESSION_SECRET shorter than 32 chars (with the length message)', () => {
    expect(() => parseEnv(base({ SESSION_SECRET: 'abcdefghij0123456789' }))).toThrow(/at least 32 characters/);
  });

  it('rejects a weak SESSION_SECRET (with the weak-pattern message)', () => {
    expect(() => parseEnv(base({ SESSION_SECRET: 'password'.repeat(5) }))).toThrow(/weak pattern or common word/);
  });

  it('rejects weak SESSION_SECRETs based on repetition, not just common words', () => {
    // single-char repeat, 2-char repeat, and whole-string-repeated-twice.
    expect(() => parseEnv(base({ SESSION_SECRET: 'a'.repeat(64) }))).toThrow(/weak pattern or common word/);
    expect(() => parseEnv(base({ SESSION_SECRET: 'ab'.repeat(32) }))).toThrow(/weak pattern or common word/);
    expect(() => parseEnv(base({ SESSION_SECRET: STRONG_32 + STRONG_32 }))).toThrow(/weak pattern or common word/);
  });

  it('rejects an invalid NODE_ENV value (locks the enum)', () => {
    expect(() => parseEnv(base({ NODE_ENV: 'foo' }))).toThrow();
  });

  it('rejects a SESSION_SECRET shorter than 64 chars in production (with the 64-char message)', () => {
    expect(() => parseEnv(base({ NODE_ENV: 'production', SESSION_SECRET: STRONG_32 }))).toThrow(/64 characters/);
  });

  it('accepts a strong 64+ char SESSION_SECRET in production', () => {
    const env = parseEnv(base({ NODE_ENV: 'production', SESSION_SECRET: STRONG_SECRET }));
    expect(env.NODE_ENV).toBe('production');
  });
});

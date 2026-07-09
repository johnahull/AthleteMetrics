import { describe, it, expect, vi } from 'vitest';
import { parseEnv, validateEnvOrExit, getEnv } from '../env';

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

  it('rejects a DATABASE_URL that is not a postgres connection string', () => {
    expect(() => parseEnv(base({ DATABASE_URL: 'not-a-url' }))).toThrow(/postgres/i);
  });

  it('accepts both postgres:// and postgresql:// schemes', () => {
    expect(parseEnv(base({ DATABASE_URL: 'postgres://localhost:5432/test' })).DATABASE_URL).toContain('postgres://');
    expect(parseEnv(base({ DATABASE_URL: 'postgresql://localhost:5432/test' })).DATABASE_URL).toContain('postgresql://');
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

describe('validateEnvOrExit', () => {
  function withMocks(fn: (exit: any, err: any) => void) {
    const exit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    try { fn(exit, err); } finally { exit.mockRestore(); err.mockRestore(); }
  }

  it('returns the validated config on success', () => {
    const env = validateEnvOrExit(base() as any);
    expect(env.DATABASE_URL).toContain('postgresql://');
  });

  it('caches the validated config for retrieval via getEnv()', () => {
    const env = validateEnvOrExit(base({ SESSION_SECRET: STRONG_SECRET }) as any);
    expect(getEnv()).toBe(env);
  });

  it('reports a missing SESSION_SECRET in production without throwing a TypeError', () => {
    // Regression: superRefine read `.length` on an undefined secret. Because
    // index.ts defaults NODE_ENV to 'production' before validating, a prod
    // deploy missing SESSION_SECRET hit `undefined.length` → raw TypeError
    // instead of the clean report + process.exit(1).
    withMocks((exit, err) => {
      expect(() =>
        validateEnvOrExit(base({ NODE_ENV: 'production', SESSION_SECRET: undefined }) as any),
      ).not.toThrow();
      expect(exit).toHaveBeenCalledWith(1);
      const out = err.mock.calls.flat().join('\n');
      expect(out).toMatch(/SESSION_SECRET/);
    });
  });

  it('exits(1) and prints ONLY the SESSION_SECRET hint for a secret-only failure', () => {
    withMocks((exit, err) => {
      validateEnvOrExit(base({ SESSION_SECRET: 'shortsecret' }) as any);
      expect(exit).toHaveBeenCalledWith(1);
      const out = err.mock.calls.flat().join('\n');
      expect(out).toMatch(/SESSION_SECRET/);
      expect(out).toMatch(/openssl rand -hex 64/);
      expect(out).not.toMatch(/valid PostgreSQL connection string/);
    });
  });

  it('exits(1) and prints ONLY the DATABASE_URL hint for a db-only failure', () => {
    withMocks((exit, err) => {
      validateEnvOrExit(base({ DATABASE_URL: undefined }) as any);
      expect(exit).toHaveBeenCalledWith(1);
      const out = err.mock.calls.flat().join('\n');
      expect(out).toMatch(/DATABASE_URL/);
      expect(out).toMatch(/valid PostgreSQL connection string/);
      expect(out).not.toMatch(/openssl rand/);
    });
  });
});

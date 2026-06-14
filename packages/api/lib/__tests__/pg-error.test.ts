import { describe, it, expect } from 'vitest';
import { getPgErrorCode, getPgError, PG_UNIQUE_VIOLATION } from '../pg-error';

describe('PG_UNIQUE_VIOLATION', () => {
  it('equals 23505', () => {
    expect(PG_UNIQUE_VIOLATION).toBe('23505');
  });
});

describe('getPgErrorCode', () => {
  it('returns undefined for null', () => {
    expect(getPgErrorCode(null)).toBeUndefined();
  });

  it('returns undefined for undefined', () => {
    expect(getPgErrorCode(undefined)).toBeUndefined();
  });

  it('returns undefined for an error with no code', () => {
    expect(getPgErrorCode(new Error('oops'))).toBeUndefined();
  });

  it('returns the code from a raw PG error (code on the error itself)', () => {
    const pgErr = Object.assign(new Error('duplicate key'), { code: '23505' });
    expect(getPgErrorCode(pgErr)).toBe('23505');
  });

  it('returns the code from a drizzle-wrapped error (code on .cause)', () => {
    const pgErr = Object.assign(new Error('duplicate key'), { code: '23505' });
    const drizzleErr = Object.assign(new Error('DrizzleQueryError'), { cause: pgErr });
    expect(getPgErrorCode(drizzleErr)).toBe('23505');
  });

  it('walks multiple levels of cause chain', () => {
    const pgErr = Object.assign(new Error('duplicate key'), { code: '23505' });
    const inner = Object.assign(new Error('inner wrapper'), { cause: pgErr });
    const outer = Object.assign(new Error('outer wrapper'), { cause: inner });
    expect(getPgErrorCode(outer)).toBe('23505');
  });

  it('returns undefined when no level in the cause chain has a code', () => {
    const inner = new Error('no code here');
    const outer = Object.assign(new Error('no code either'), { cause: inner });
    expect(getPgErrorCode(outer)).toBeUndefined();
  });

  it('ignores non-string code values and continues walking', () => {
    const pgErr = Object.assign(new Error('pg error'), { code: '23505' });
    const outer = Object.assign(new Error('outer'), { code: 42, cause: pgErr });
    // 42 is not a string, so the outer is skipped and the inner '23505' is returned
    expect(getPgErrorCode(outer)).toBe('23505');
  });
});

describe('getPgError', () => {
  it('returns undefined for null', () => {
    expect(getPgError(null)).toBeUndefined();
  });

  it('returns the error itself when it directly has a string code', () => {
    const pgErr = Object.assign(new Error('duplicate key'), { code: '23505', constraint: 'users_email_key' });
    expect(getPgError(pgErr)).toBe(pgErr);
  });

  it('returns the inner cause when the outer error wraps a PG error', () => {
    const pgErr = Object.assign(new Error('duplicate key'), { code: '23505', constraint: 'users_email_key' });
    const drizzleErr = Object.assign(new Error('DrizzleQueryError'), { cause: pgErr });
    const result = getPgError(drizzleErr);
    expect(result).toBe(pgErr);
    expect(result?.constraint).toBe('users_email_key');
  });

  it('returns undefined when no error in the chain has a code', () => {
    const err = new Error('no pg code');
    expect(getPgError(err)).toBeUndefined();
  });
});

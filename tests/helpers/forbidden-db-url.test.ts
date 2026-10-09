import { describe, it, expect } from 'vitest';
import { findForbiddenPattern } from './forbidden-db-url';

describe('findForbiddenPattern', () => {
  it.each([
    'postgresql://u:p@db.railway.app:5432/x',
    'postgresql://u:p@ep-x.neon.tech/x',
    'postgresql://u:p@db.supabase.co/x',
    'postgresql://u:p@x.amazonaws.com/x',
    'postgresql://u:p@host/staging_db',
    'postgresql://u:p@host/PRODUCTION',
    'postgresql://u:p@prod-db.internal/x',
  ])('flags %s', (url) => {
    expect(findForbiddenPattern(url)).toBeTruthy();
  });

  it.each([
    'postgresql://postgres@localhost:55439/athletemetrics_test',
    'postgresql://postgres:postgres@127.0.0.1:5432/test_db',
  ])('allows %s', (url) => {
    expect(findForbiddenPattern(url)).toBeUndefined();
  });

  it('treats an empty url as allowed (the caller reports the missing url)', () => {
    expect(findForbiddenPattern('')).toBeUndefined();
  });
});

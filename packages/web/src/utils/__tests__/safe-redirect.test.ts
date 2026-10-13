import { describe, it, expect } from 'vitest';
import { safeRedirectPath, joinCodeFromRedirect } from '../safe-redirect';

describe('safeRedirectPath', () => {
  it.each([
    ['/join/ABCD1234', '/join/ABCD1234'],
    ['/join/ABCD1234?x=1#top', '/join/ABCD1234?x=1#top'],
    ['/dashboard', '/dashboard'],
  ])('accepts same-origin path %s', (raw, expected) => {
    expect(safeRedirectPath(raw)).toBe(expected);
  });

  it.each([
    ['protocol-relative', '//evil.com'],
    ['backslash host', '/\\evil.com'],
    ['tab-smuggled host', '/\t/evil.com'],
    ['newline-smuggled host', '/\n/evil.com'],
    ['dot-segment to protocol-relative', '/.//evil.com'],
    ['parent-segment to protocol-relative', '/..//evil.com'],
    ['encoded dot-segments', '/%2e%2e//evil.com'],
    ['absolute url', 'https://evil.com'],
    ['javascript scheme', 'javascript:alert(1)'],
    ['no leading slash', 'join/ABCD'],
    ['empty', ''],
  ])('rejects %s', (_label, raw) => {
    expect(safeRedirectPath(raw)).toBeNull();
  });

  it('rejects null and undefined', () => {
    expect(safeRedirectPath(null)).toBeNull();
    expect(safeRedirectPath(undefined)).toBeNull();
  });
});

describe('joinCodeFromRedirect', () => {
  it('extracts the code from a join path', () => {
    expect(joinCodeFromRedirect('/join/JOINBTA')).toBe('JOINBTA');
    expect(joinCodeFromRedirect('/join/abcd1234')).toBe('abcd1234');
  });

  it.each([
    '/join/AB', // too short
    '/join/' + 'A'.repeat(21), // too long
    '/join/AB-CD12', // not alphanumeric
    '/join/ABCD1234/extra',
    '/events/join/ABCD1234',
    '//evil.com/join/ABCD1234',
    'https://evil.com/join/ABCD1234',
  ])('returns null for %s', (raw) => {
    expect(joinCodeFromRedirect(raw)).toBeNull();
  });

  it('returns null for null/undefined', () => {
    expect(joinCodeFromRedirect(null)).toBeNull();
    expect(joinCodeFromRedirect(undefined)).toBeNull();
  });
});

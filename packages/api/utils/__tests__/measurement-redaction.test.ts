import { describe, it, expect } from 'vitest';
import { omitMediaUrl, omitMediaUrlFromRows, stripMediaUrlDeep } from '../measurement-redaction';

const LEAK = 'https://leakcheck.example.com/secret-clip-SENTINEL';

describe('measurement-redaction (AM-FEAT-015 Decision 12)', () => {
  it('omitMediaUrl strips mediaUrl without mutating the input', () => {
    const row = { id: '1', metric: 'X', mediaUrl: LEAK };
    expect(omitMediaUrl(row)).toEqual({ id: '1', metric: 'X' });
    expect(row.mediaUrl).toBe(LEAK);
  });

  it('omitMediaUrlFromRows strips every row', () => {
    const out = omitMediaUrlFromRows([{ id: '1', mediaUrl: LEAK }, { id: '2', mediaUrl: null }]);
    expect(out).toEqual([{ id: '1' }, { id: '2' }]);
  });

  it('stripMediaUrlDeep removes mediaUrl keys at any depth', () => {
    const out = stripMediaUrlDeep({ a: [{ mediaUrl: LEAK, v: 1 }], b: { c: { mediaUrl: LEAK, d: 2 } }, e: 'x', n: null });
    expect(out).toEqual({ a: [{ v: 1 }], b: { c: { d: 2 } }, e: 'x', n: null });
  });

  it('stripMediaUrlDeep leaves Dates and primitives intact', () => {
    const d = new Date('2026-01-01T00:00:00Z');
    expect(stripMediaUrlDeep({ d, n: 1 })).toEqual({ d, n: 1 });
    expect((stripMediaUrlDeep({ d }) as any).d).toBeInstanceOf(Date);
  });

  it('stripMediaUrlDeep also strips null-prototype objects', () => {
    const bare = Object.assign(Object.create(null), { mediaUrl: LEAK, v: 1 });
    expect(stripMediaUrlDeep({ row: bare })).toEqual({ row: { v: 1 } });
  });
});

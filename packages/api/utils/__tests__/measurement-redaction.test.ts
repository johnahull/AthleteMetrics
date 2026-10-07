import { describe, it, expect } from 'vitest';
import { omitMediaUrl, omitMediaUrlFromRows, omitClipsHiddenFromViewer, stripMediaUrlDeep } from '../measurement-redaction';

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

  describe('omitClipsHiddenFromViewer (clip read visibility)', () => {
    const row = (userId: string, organizationId: string | null) => ({ id: `${userId}-${organizationId}`, userId, organizationId, mediaUrl: LEAK });
    const viewer = (roles: Record<string, string>, isSiteAdmin = false) => ({
      userId: 'me',
      isSiteAdmin,
      orgRoles: new Map(Object.entries(roles)),
    });

    it.each(['coach', 'org_admin'])('keeps clips of the organizations where the viewer is %s', (role) => {
      const [out] = omitClipsHiddenFromViewer([row('a1', 'orgA')], viewer({ orgA: role }));
      expect(out.mediaUrl).toBe(LEAK);
    });

    it.each(['athlete', 'parent', 'guest'])('omits clips of other athletes for a %s', (role) => {
      const [out] = omitClipsHiddenFromViewer([row('a1', 'orgA')], viewer({ orgA: role }));
      expect(out).toEqual({ id: 'a1-orgA', userId: 'a1', organizationId: 'orgA' });
    });

    it("keeps the viewer's own clips in any organization and personal rows", () => {
      const out = omitClipsHiddenFromViewer([row('me', 'orgA'), row('me', null)], viewer({ orgA: 'athlete' }));
      expect(out.map((r) => r.mediaUrl)).toEqual([LEAK, LEAK]);
    });

    it('a coach role in another organization does not reveal clips', () => {
      const [out] = omitClipsHiddenFromViewer([row('a1', 'orgA')], viewer({ orgA: 'athlete', orgB: 'coach' }));
      expect(out).not.toHaveProperty('mediaUrl');
    });

    it("omits another athlete's personal-row clip for a non-admin", () => {
      const [out] = omitClipsHiddenFromViewer([row('a1', null)], viewer({ orgA: 'coach' }));
      expect(out).not.toHaveProperty('mediaUrl');
    });

    it('keeps every clip for a site admin', () => {
      const out = omitClipsHiddenFromViewer([row('a1', 'orgA'), row('a2', null)], viewer({}, true));
      expect(out.map((r) => r.mediaUrl)).toEqual([LEAK, LEAK]);
    });
  });
});

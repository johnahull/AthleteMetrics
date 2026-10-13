import { describe, it, expect, vi, afterEach } from 'vitest';
import { joinOrganizationByCode } from '../join-by-code';

const json = (body: unknown, ok = true) => ({ ok, json: async () => body });

describe('joinOrganizationByCode', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('looks up the org then posts a direct_link membership request; returns approved', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json({ organization: { id: 'org-1', name: 'Big Time Athletes' } }))
      .mockResolvedValueOnce(json({ request: { status: 'approved' } }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await joinOrganizationByCode('JOINBTA');

    expect(result).toEqual({ status: 'approved', organizationName: 'Big Time Athletes' });
    expect(fetchMock.mock.calls[0][0]).toBe('/api/organizations/join/JOINBTA');
    const [url, init] = fetchMock.mock.calls[1];
    expect(url).toBe('/api/membership-requests');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ organizationId: 'org-1', discoveryMethod: 'direct_link' });
  });

  it('returns pending when the org needs approval', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(json({ organization: { id: 'org-1', name: 'Org' } }))
        .mockResolvedValueOnce(json({ request: { status: 'pending' } })),
    );
    expect(await joinOrganizationByCode('ABCD1234')).toEqual({ status: 'pending', organizationName: 'Org' });
  });

  it('throws the server message when the code is invalid, without posting', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(json({ message: 'Organization not found' }, false));
    vi.stubGlobal('fetch', fetchMock);
    await expect(joinOrganizationByCode('NOPE1234')).rejects.toThrow('Organization not found');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('throws the server message when the request is rejected', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(json({ organization: { id: 'org-1', name: 'Org' } }))
        .mockResolvedValueOnce(json({ message: 'You are already a member of this organization' }, false)),
    );
    await expect(joinOrganizationByCode('ABCD1234')).rejects.toThrow('already a member');
  });
});

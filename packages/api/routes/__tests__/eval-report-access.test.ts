import { describe, it, expect, vi, beforeEach } from 'vitest';

const getOrgRole = vi.fn();
vi.mock('../../permissions/measurement-helpers', () => ({
  getOrgRole: (...args: unknown[]) => getOrgRole(...args),
  isMeasurementWriterRole: (role: string | null) => role === 'coach' || role === 'org_admin' || role === 'site_admin',
}));

import { canAccessEvalRow, hasInaccessibleEval } from '../eval-report-access';

const user = { id: 'u1' };

beforeEach(() => getOrgRole.mockReset());

describe('canAccessEvalRow', () => {
  it('passes non-eval rows without a role lookup, even with a null organization', async () => {
    expect(await canAccessEvalRow(user, { reportType: 'team', organizationId: 'o1' })).toBe(true);
    expect(await canAccessEvalRow(user, { reportType: 'team', organizationId: null })).toBe(true);
    expect(getOrgRole).not.toHaveBeenCalled();
  });

  it('allows an eval row for a writer of its organization and refuses a non-writer', async () => {
    getOrgRole.mockResolvedValueOnce('coach');
    expect(await canAccessEvalRow(user, { reportType: 'eval', organizationId: 'o1' })).toBe(true);
    expect(getOrgRole).toHaveBeenCalledWith(user, 'o1');
    getOrgRole.mockResolvedValueOnce('athlete');
    expect(await canAccessEvalRow(user, { reportType: 'eval', organizationId: 'o1' })).toBe(false);
  });

  it('fails closed for an eval row with a null organization, without a role lookup', async () => {
    getOrgRole.mockResolvedValue('coach');
    expect(await canAccessEvalRow(user, { reportType: 'eval', organizationId: null })).toBe(false);
    expect(getOrgRole).not.toHaveBeenCalled();
  });
});

describe('hasInaccessibleEval', () => {
  it('treats an eval row with a null organization as inaccessible', async () => {
    getOrgRole.mockResolvedValue('coach');
    expect(await hasInaccessibleEval(user, [{ reportType: 'eval', organizationId: 'o1' }, { reportType: 'eval', organizationId: null }])).toBe(true);
  });

  it('ignores non-eval rows (including null organization) and looks each organization up once', async () => {
    getOrgRole.mockResolvedValue('coach');
    const rows = [
      { reportType: 'eval', organizationId: 'o1' },
      { reportType: 'eval', organizationId: 'o1' },
      { reportType: 'team', organizationId: null },
    ];
    expect(await hasInaccessibleEval(user, rows)).toBe(false);
    expect(getOrgRole).toHaveBeenCalledTimes(1);
  });

  it('is true when any organization is not writable', async () => {
    getOrgRole.mockImplementation(async (_u: unknown, org: string) => (org === 'o1' ? 'coach' : 'athlete'));
    expect(await hasInaccessibleEval(user, [{ reportType: 'eval', organizationId: 'o1' }, { reportType: 'eval', organizationId: 'o2' }])).toBe(true);
  });
});

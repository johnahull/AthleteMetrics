import { describe, it, expect, vi, beforeEach } from 'vitest';

const getUserOrganizations = vi.fn();
vi.mock('../../storage', () => ({ storage: { getUserOrganizations: (...a: unknown[]) => getUserOrganizations(...a) } }));

import { omitCoachNotes, writerOrgIds, stripCoachNotesForViewer, forViewer } from '../report-coach-notes-access';

const viewer = { id: 'u1', isSiteAdmin: false, role: 'athlete' } as any;
const row = (organizationId: string) => ({ id: organizationId, organizationId, coachNotes: { goals: 'secret' } });

beforeEach(() => getUserOrganizations.mockReset());

describe('omitCoachNotes', () => {
  it('drops only coachNotes', () => {
    expect(omitCoachNotes({ id: 'r', coachNotes: { goals: 'x' } })).toEqual({ id: 'r' });
  });
});

describe('writerOrgIds', () => {
  it('is empty without orgs and does not query', async () => {
    expect((await writerOrgIds(viewer, [])).size).toBe(0);
    expect(getUserOrganizations).not.toHaveBeenCalled();
  });

  it('gives a site admin every org without a membership lookup', async () => {
    const ids = await writerOrgIds({ ...viewer, isSiteAdmin: true }, ['a', 'b', 'a']);
    expect([...ids].sort()).toEqual(['a', 'b']);
    expect(getUserOrganizations).not.toHaveBeenCalled();
  });

  it('keeps only orgs where the viewer is coach or org_admin, one lookup for all', async () => {
    getUserOrganizations.mockResolvedValue([
      { organizationId: 'a', role: 'coach' },
      { organizationId: 'b', role: 'athlete' },
      { organizationId: 'c', role: 'org_admin' },
    ]);
    const ids = await writerOrgIds(viewer, ['a', 'b', 'c', 'd']);
    expect([...ids].sort()).toEqual(['a', 'c']);
    expect(getUserOrganizations).toHaveBeenCalledTimes(1);
  });

  it('treats a viewer with no memberships as a non-writer everywhere', async () => {
    getUserOrganizations.mockResolvedValue(undefined);
    expect((await writerOrgIds(viewer, ['a'])).size).toBe(0);
  });
});

describe('stripCoachNotesForViewer / forViewer', () => {
  it('strips notes from rows of orgs the viewer does not write in', async () => {
    getUserOrganizations.mockResolvedValue([{ organizationId: 'a', role: 'coach' }, { organizationId: 'b', role: 'athlete' }]);
    const [kept, stripped] = await stripCoachNotesForViewer(viewer, [row('a'), row('b')]);
    expect(kept).toHaveProperty('coachNotes');
    expect(stripped).not.toHaveProperty('coachNotes');
  });

  it('forViewer applies the same rule to a single row', async () => {
    getUserOrganizations.mockResolvedValue([{ organizationId: 'b', role: 'athlete' }]);
    expect(await forViewer(viewer, row('b'))).not.toHaveProperty('coachNotes');
  });
});

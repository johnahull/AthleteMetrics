import { describe, it, expect } from 'vitest';
import { getOrgRole, getHighestOrgRole } from '../org-roles';

const member = { isSiteAdmin: false };
const siteAdmin = { isSiteAdmin: true };

// A coach in org A and an athlete in org B.
const coachInAAthleteInB = [
  { organizationId: 'org-a', role: 'coach' as const },
  { organizationId: 'org-b', role: 'athlete' as const },
];

describe('getOrgRole', () => {
  it('returns site_admin for a site admin, whatever the organization or memberships', () => {
    expect(getOrgRole(siteAdmin, null, 'org-a')).toBe('site_admin');
    expect(getOrgRole(siteAdmin, coachInAAthleteInB, 'org-b')).toBe('site_admin');
    expect(getOrgRole(siteAdmin, null, null)).toBe('site_admin');
  });

  it("returns the member's role in that organization only", () => {
    expect(getOrgRole(member, coachInAAthleteInB, 'org-a')).toBe('coach');
    expect(getOrgRole(member, coachInAAthleteInB, 'org-b')).toBe('athlete');
  });

  it('returns undefined for a non-member, no organization, no memberships or no user', () => {
    expect(getOrgRole(member, coachInAAthleteInB, 'org-c')).toBeUndefined();
    expect(getOrgRole(member, coachInAAthleteInB, null)).toBeUndefined();
    expect(getOrgRole(member, coachInAAthleteInB, undefined)).toBeUndefined();
    expect(getOrgRole(member, null, 'org-a')).toBeUndefined();
    expect(getOrgRole(null, coachInAAthleteInB, 'org-a')).toBeUndefined();
  });

  it('ignores the session role (role in the alphabetically-first organization)', () => {
    const user = { isSiteAdmin: false, role: 'coach' as const };
    expect(getOrgRole(user, coachInAAthleteInB, 'org-b')).toBe('athlete');
    expect(getOrgRole(user, coachInAAthleteInB, 'org-c')).toBeUndefined();
  });
});

describe('getHighestOrgRole', () => {
  it('returns site_admin for a site admin', () => {
    expect(getHighestOrgRole(siteAdmin, null)).toBe('site_admin');
    expect(getHighestOrgRole(siteAdmin, coachInAAthleteInB)).toBe('site_admin');
  });

  it('returns the highest role across all memberships, in any order', () => {
    expect(getHighestOrgRole(member, coachInAAthleteInB)).toBe('coach');
    expect(getHighestOrgRole(member, [...coachInAAthleteInB].reverse())).toBe('coach');
    expect(
      getHighestOrgRole(member, [
        { organizationId: 'org-a', role: 'coach' },
        { organizationId: 'org-b', role: 'org_admin' },
        { organizationId: 'org-c', role: 'athlete' },
      ])
    ).toBe('org_admin');
    expect(getHighestOrgRole(member, [{ organizationId: 'org-b', role: 'athlete' }])).toBe('athlete');
  });

  it('returns undefined with no memberships (or not loaded yet) or no user, ignoring the session role', () => {
    const sessionCoach = { isSiteAdmin: false, role: 'coach' as const };
    expect(getHighestOrgRole(sessionCoach, null)).toBeUndefined();
    expect(getHighestOrgRole(member, [])).toBeUndefined();
    expect(getHighestOrgRole(null, coachInAAthleteInB)).toBeUndefined();
  });
});

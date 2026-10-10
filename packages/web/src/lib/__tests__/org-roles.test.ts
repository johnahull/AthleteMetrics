import { describe, it, expect } from 'vitest';
import { getOrgRole, anyOrgGrants } from '../org-roles';

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

describe('anyOrgGrants', () => {
  it('is true for a site admin, whatever the memberships', () => {
    expect(anyOrgGrants(siteAdmin, null, 'CREATE_MEASUREMENTS')).toBe(true);
    expect(anyOrgGrants(siteAdmin, [], 'CONFIGURE_SETTINGS')).toBe(true);
  });

  it('is true when any membership grants it, in any order', () => {
    expect(anyOrgGrants(member, coachInAAthleteInB, 'CREATE_MEASUREMENTS')).toBe(true);
    expect(anyOrgGrants(member, [...coachInAAthleteInB].reverse(), 'CREATE_MEASUREMENTS')).toBe(true);
  });

  it('is false when no membership grants it', () => {
    expect(anyOrgGrants(member, [{ organizationId: 'org-b', role: 'athlete' }], 'CREATE_MEASUREMENTS')).toBe(false);
  });

  it('ignores the session role and fails closed with no memberships, not loaded, or no user', () => {
    const sessionCoach = { isSiteAdmin: false, role: 'coach' as const };
    expect(anyOrgGrants(sessionCoach, null, 'CREATE_MEASUREMENTS')).toBe(false);
    expect(anyOrgGrants(sessionCoach, [], 'CREATE_MEASUREMENTS')).toBe(false);
    expect(anyOrgGrants(sessionCoach, [{ organizationId: 'org-b', role: 'athlete' }], 'CREATE_MEASUREMENTS')).toBe(false);
    expect(anyOrgGrants(null, coachInAAthleteInB, 'CREATE_MEASUREMENTS')).toBe(false);
  });

  it('is not a role ranking: a coach+parent user has a parent-only permission', () => {
    const coachAndParent = [
      { organizationId: 'org-a', role: 'coach' as const },
      { organizationId: 'org-b', role: 'parent' as const },
    ];
    expect(anyOrgGrants(member, coachAndParent, 'VIEW_LINKED_ATHLETES')).toBe(true);
    expect(anyOrgGrants(member, coachInAAthleteInB, 'VIEW_LINKED_ATHLETES')).toBe(false);
  });
});

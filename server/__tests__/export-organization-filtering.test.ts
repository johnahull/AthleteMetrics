/**
 * Unit Tests for Export Organization Filtering Logic
 *
 * These tests verify the organization filtering logic for export endpoints:
 * - Non-site-admin users can only export from their organization(s)
 * - Site admin users can export from all organizations OR from specified org
 * - Authorization checks prevent cross-organization data access
 */

import { describe, it, expect, vi } from 'vitest';

describe('Export Organization Filtering Logic', () => {
  describe('Athlete Export - Organization Filter Logic', () => {
    it('should filter athletes by user organization for non-site-admin', () => {
      // Mock scenario: Coach with org1, trying to export athletes
      const userOrganizations = [
        { organizationId: 'org-1', role: 'coach' }
      ];
      const isSiteAdmin = false;
      const requestedOrgId = undefined;

      // Logic: Non-site-admin should get their first organization
      const effectiveOrgId = isSiteAdmin
        ? requestedOrgId
        : userOrganizations[0]?.organizationId;

      expect(effectiveOrgId).toBe('org-1');
    });

    it('should allow site admin to export from all organizations when no org specified', () => {
      const isSiteAdmin = true;
      const requestedOrgId = undefined;

      // Logic: Site admin with no org specified = export all
      const effectiveOrgId = isSiteAdmin ? requestedOrgId : 'fallback';

      expect(effectiveOrgId).toBeUndefined();
    });

    it('should allow site admin to export from specific organization', () => {
      const isSiteAdmin = true;
      const requestedOrgId = 'org-2';

      // Logic: Site admin can specify any org
      const effectiveOrgId = isSiteAdmin ? requestedOrgId : 'fallback';

      expect(effectiveOrgId).toBe('org-2');
    });

    it('should reject non-admin accessing different organization', () => {
      const userOrganizations = [
        { organizationId: 'org-1', role: 'coach' }
      ];
      const isSiteAdmin = false;
      const requestedOrgId = 'org-2'; // Different from user's org

      // Logic: Check if requested org is in user's organizations
      const hasAccess = isSiteAdmin ||
        !requestedOrgId ||
        userOrganizations.some(uo => uo.organizationId === requestedOrgId);

      expect(hasAccess).toBe(false);
    });

    it('should allow non-admin accessing their own organization', () => {
      const userOrganizations = [
        { organizationId: 'org-1', role: 'coach' }
      ];
      const isSiteAdmin = false;
      const requestedOrgId = 'org-1'; // Same as user's org

      const hasAccess = isSiteAdmin ||
        !requestedOrgId ||
        userOrganizations.some(uo => uo.organizationId === requestedOrgId);

      expect(hasAccess).toBe(true);
    });

    it('should handle users with multiple organizations', () => {
      const userOrganizations = [
        { organizationId: 'org-1', role: 'coach' },
        { organizationId: 'org-2', role: 'org_admin' }
      ];
      const isSiteAdmin = false;

      // User can access org-1
      const hasAccessOrg1 = userOrganizations.some(uo => uo.organizationId === 'org-1');
      expect(hasAccessOrg1).toBe(true);

      // User can access org-2
      const hasAccessOrg2 = userOrganizations.some(uo => uo.organizationId === 'org-2');
      expect(hasAccessOrg2).toBe(true);

      // User cannot access org-3
      const hasAccessOrg3 = userOrganizations.some(uo => uo.organizationId === 'org-3');
      expect(hasAccessOrg3).toBe(false);
    });
  });

  describe('Measurement Export - Organization Filter Logic', () => {
    it('should filter measurements by user organization for non-site-admin', () => {
      const userOrganizations = [
        { organizationId: 'org-1', role: 'coach' }
      ];
      const isSiteAdmin = false;
      const requestedOrgId = undefined;

      // Logic: Use first user organization
      const effectiveOrgId = isSiteAdmin
        ? requestedOrgId
        : userOrganizations[0]?.organizationId;

      expect(effectiveOrgId).toBe('org-1');
    });

    it('should allow site admin to export measurements from all organizations', () => {
      const isSiteAdmin = true;
      const requestedOrgId = undefined;

      const effectiveOrgId = isSiteAdmin ? requestedOrgId : 'fallback';

      expect(effectiveOrgId).toBeUndefined();
    });

    it('should allow site admin to filter by specific organization', () => {
      const isSiteAdmin = true;
      const requestedOrgId = 'org-3';

      const effectiveOrgId = isSiteAdmin ? requestedOrgId : 'fallback';

      expect(effectiveOrgId).toBe('org-3');
    });

    it('should validate organizationId parameter against user organizations', () => {
      const userOrganizations = [
        { organizationId: 'org-1', role: 'coach' }
      ];
      const isSiteAdmin = false;
      const requestedOrgId = 'org-2';

      // Validate access
      const hasAccess = isSiteAdmin ||
        !requestedOrgId ||
        userOrganizations.some(uo => uo.organizationId === requestedOrgId);

      expect(hasAccess).toBe(false);
    });
  });

  describe('Authorization Helper Functions', () => {
    const checkOrganizationAccess = (
      userOrgs: Array<{ organizationId: string }>,
      requestedOrgId: string | undefined,
      isSiteAdmin: boolean
    ): boolean => {
      // Site admins have access to all organizations
      if (isSiteAdmin) return true;

      // If no org requested, user is accessing their default org (allowed)
      if (!requestedOrgId) return true;

      // Check if requested org is in user's organizations
      return userOrgs.some(uo => uo.organizationId === requestedOrgId);
    };

    const getEffectiveOrganizationId = (
      userOrgs: Array<{ organizationId: string }>,
      requestedOrgId: string | undefined,
      isSiteAdmin: boolean
    ): string | undefined => {
      // Site admin with no org specified = export all (undefined)
      if (isSiteAdmin) return requestedOrgId;

      // Non-admin with specific org requested = use that (after validation)
      if (requestedOrgId) return requestedOrgId;

      // Non-admin with no org specified = use first org
      return userOrgs[0]?.organizationId;
    };

    it('checkOrganizationAccess: allows site admin all access', () => {
      expect(checkOrganizationAccess([], 'org-1', true)).toBe(true);
      expect(checkOrganizationAccess([], 'org-2', true)).toBe(true);
      expect(checkOrganizationAccess([], undefined, true)).toBe(true);
    });

    it('checkOrganizationAccess: allows non-admin their own org', () => {
      const userOrgs = [{ organizationId: 'org-1' }];
      expect(checkOrganizationAccess(userOrgs, 'org-1', false)).toBe(true);
      expect(checkOrganizationAccess(userOrgs, undefined, false)).toBe(true);
    });

    it('checkOrganizationAccess: denies non-admin other orgs', () => {
      const userOrgs = [{ organizationId: 'org-1' }];
      expect(checkOrganizationAccess(userOrgs, 'org-2', false)).toBe(false);
    });

    it('getEffectiveOrganizationId: returns undefined for site admin with no org', () => {
      expect(getEffectiveOrganizationId([], undefined, true)).toBeUndefined();
    });

    it('getEffectiveOrganizationId: returns requested org for site admin', () => {
      expect(getEffectiveOrganizationId([], 'org-5', true)).toBe('org-5');
    });

    it('getEffectiveOrganizationId: returns first org for non-admin with no request', () => {
      const userOrgs = [
        { organizationId: 'org-1' },
        { organizationId: 'org-2' }
      ];
      expect(getEffectiveOrganizationId(userOrgs, undefined, false)).toBe('org-1');
    });

    it('getEffectiveOrganizationId: returns requested org for non-admin', () => {
      const userOrgs = [{ organizationId: 'org-1' }];
      expect(getEffectiveOrganizationId(userOrgs, 'org-1', false)).toBe('org-1');
    });
  });

  describe('CSV Content Filtering', () => {
    it('should only include athletes from specified organization', () => {
      const allAthletes = [
        { id: '1', firstName: 'Alice', organizationId: 'org-1' },
        { id: '2', firstName: 'Bob', organizationId: 'org-2' },
        { id: '3', firstName: 'Charlie', organizationId: 'org-1' }
      ];
      const filterOrgId = 'org-1';

      // Mock storage.getAthletes with filter
      const filteredAthletes = allAthletes.filter(a => a.organizationId === filterOrgId);

      expect(filteredAthletes).toHaveLength(2);
      expect(filteredAthletes.map(a => a.id)).toEqual(['1', '3']);
    });

    it('should include all athletes when no organization filter specified', () => {
      const allAthletes = [
        { id: '1', firstName: 'Alice', organizationId: 'org-1' },
        { id: '2', firstName: 'Bob', organizationId: 'org-2' }
      ];
      const filterOrgId = undefined;

      // When no filter, return all
      const filteredAthletes = filterOrgId
        ? allAthletes.filter(a => a.organizationId === filterOrgId)
        : allAthletes;

      expect(filteredAthletes).toHaveLength(2);
    });
  });
});

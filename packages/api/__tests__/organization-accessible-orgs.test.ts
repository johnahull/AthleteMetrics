/**
 * Comprehensive tests for OrganizationService.getAccessibleOrganizations
 *
 * These tests verify that:
 * - Site admins get ALL organizations (including inactive ones)
 * - Regular users get only their assigned organizations
 * - The includeInactive flag is properly passed to storage layer
 * - Caching of site admin status works correctly
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the database module before imports
vi.mock('../db', () => ({
  db: {},
  pgClient: {},
  sessionPool: {},
  closeDatabase: vi.fn(),
}));

// Mock storage module
vi.mock('../storage', () => ({
  storage: {
    getOrganizations: vi.fn(),
    getUserOrganizations: vi.fn(),
    getUser: vi.fn(),
    createAuditLog: vi.fn(),
  },
}));

import { OrganizationService } from '../services/organization-service';
import { storage } from '../storage';
import type { Organization } from '@shared/schema';

const mockStorage = storage;

describe('OrganizationService.getAccessibleOrganizations', () => {
  let organizationService: OrganizationService;
  const siteAdminUserId = 'admin-123';
  const regularUserId = 'user-456';

  const activeOrg1: Organization = {
    id: 'org-1',
    name: 'Active Org 1',
    isActive: true,
    createdAt: new Date(),
  } as Organization;

  const activeOrg2: Organization = {
    id: 'org-2',
    name: 'Active Org 2',
    isActive: true,
    createdAt: new Date(),
  } as Organization;

  const inactiveOrg1: Organization = {
    id: 'org-3',
    name: 'Inactive Org 1',
    isActive: false,
    createdAt: new Date(),
  } as Organization;

  const inactiveOrg2: Organization = {
    id: 'org-4',
    name: 'Inactive Org 2',
    isActive: false,
    createdAt: new Date(),
  } as Organization;

  beforeEach(() => {
    vi.clearAllMocks();
    organizationService = new OrganizationService();
  });

  describe('Site Admin Access', () => {
    it('should return all organizations including inactive ones for site admins', async () => {
      // Mock site admin user
      vi.mocked(mockStorage.getUser).mockResolvedValue({
        id: siteAdminUserId,
        isSiteAdmin: true,
      } as any);

      // Mock storage returning all orgs (active and inactive)
      vi.mocked(mockStorage.getOrganizations).mockResolvedValue([
        activeOrg1,
        activeOrg2,
        inactiveOrg1,
        inactiveOrg2,
      ]);

      const result = await organizationService.getAccessibleOrganizations(siteAdminUserId);

      // Should get all 4 organizations (2 active + 2 inactive)
      expect(result).toHaveLength(4);
      expect(result).toContainEqual(activeOrg1);
      expect(result).toContainEqual(activeOrg2);
      expect(result).toContainEqual(inactiveOrg1);
      expect(result).toContainEqual(inactiveOrg2);
    });

    it('should pass includeInactive: true flag to storage layer for site admins', async () => {
      // Mock site admin user
      vi.mocked(mockStorage.getUser).mockResolvedValue({
        id: siteAdminUserId,
        isSiteAdmin: true,
      } as any);

      vi.mocked(mockStorage.getOrganizations).mockResolvedValue([activeOrg1, inactiveOrg1]);

      await organizationService.getAccessibleOrganizations(siteAdminUserId);

      // Verify includeInactive: true was passed
      expect(mockStorage.getOrganizations).toHaveBeenCalledWith({ includeInactive: true });
    });

    it('should work with cached site admin status (no DB query)', async () => {
      vi.mocked(mockStorage.getOrganizations).mockResolvedValue([activeOrg1, inactiveOrg1]);

      // Pass cached isSiteAdmin status
      await organizationService.getAccessibleOrganizations(siteAdminUserId, true);

      // Should NOT query the user from database
      expect(mockStorage.getUser).not.toHaveBeenCalled();

      // Should still get organizations with includeInactive flag
      expect(mockStorage.getOrganizations).toHaveBeenCalledWith({ includeInactive: true });
    });

    it('should return inactive organizations when only inactive orgs exist', async () => {
      vi.mocked(mockStorage.getUser).mockResolvedValue({
        id: siteAdminUserId,
        isSiteAdmin: true,
      } as any);

      // Only inactive orgs
      vi.mocked(mockStorage.getOrganizations).mockResolvedValue([inactiveOrg1, inactiveOrg2]);

      const result = await organizationService.getAccessibleOrganizations(siteAdminUserId);

      expect(result).toHaveLength(2);
      expect(result).toContainEqual(inactiveOrg1);
      expect(result).toContainEqual(inactiveOrg2);
    });

    it('should handle empty organization list for site admins', async () => {
      vi.mocked(mockStorage.getUser).mockResolvedValue({
        id: siteAdminUserId,
        isSiteAdmin: true,
      } as any);

      vi.mocked(mockStorage.getOrganizations).mockResolvedValue([]);

      const result = await organizationService.getAccessibleOrganizations(siteAdminUserId);

      expect(result).toEqual([]);
      expect(mockStorage.getOrganizations).toHaveBeenCalledWith({ includeInactive: true });
    });
  });

  describe('Regular User Access', () => {
    it('should return only assigned organizations for regular users', async () => {
      // Mock regular user
      vi.mocked(mockStorage.getUser).mockResolvedValue({
        id: regularUserId,
        isSiteAdmin: false,
      } as any);

      // Mock user organizations (what the user is assigned to)
      vi.mocked(mockStorage.getUserOrganizations).mockResolvedValue([
        {
          userId: regularUserId,
          organizationId: 'org-1',
          role: 'coach',
          organization: activeOrg1,
        },
        {
          userId: regularUserId,
          organizationId: 'org-2',
          role: 'athlete',
          organization: activeOrg2,
        },
      ] as any);

      const result = await organizationService.getAccessibleOrganizations(regularUserId);

      // Should get only their 2 assigned organizations
      expect(result).toHaveLength(2);
      expect(result).toContainEqual(activeOrg1);
      expect(result).toContainEqual(activeOrg2);

      // Should NOT call getOrganizations
      expect(mockStorage.getOrganizations).not.toHaveBeenCalled();

      // Should call getUserOrganizations instead
      expect(mockStorage.getUserOrganizations).toHaveBeenCalledWith(regularUserId);
    });

    it('should work with cached non-admin status', async () => {
      vi.mocked(mockStorage.getUserOrganizations).mockResolvedValue([
        {
          userId: regularUserId,
          organizationId: 'org-1',
          role: 'coach',
          organization: activeOrg1,
        },
      ] as any);

      // Pass cached isSiteAdmin: false
      await organizationService.getAccessibleOrganizations(regularUserId, false);

      // Should NOT query the user from database
      expect(mockStorage.getUser).not.toHaveBeenCalled();

      // Should get user organizations
      expect(mockStorage.getUserOrganizations).toHaveBeenCalledWith(regularUserId);
    });

    it('should return empty array if regular user has no organizations', async () => {
      vi.mocked(mockStorage.getUser).mockResolvedValue({
        id: regularUserId,
        isSiteAdmin: false,
      } as any);

      vi.mocked(mockStorage.getUserOrganizations).mockResolvedValue([]);

      const result = await organizationService.getAccessibleOrganizations(regularUserId);

      expect(result).toEqual([]);
    });

    it('should extract organization objects from nested UserOrganization structure', async () => {
      vi.mocked(mockStorage.getUser).mockResolvedValue({
        id: regularUserId,
        isSiteAdmin: false,
      } as any);

      // UserOrganizations have nested organization objects
      vi.mocked(mockStorage.getUserOrganizations).mockResolvedValue([
        {
          userId: regularUserId,
          organizationId: 'org-1',
          role: 'coach',
          organization: activeOrg1,
          extraField: 'should not appear',
        },
        {
          userId: regularUserId,
          organizationId: 'org-2',
          role: 'athlete',
          organization: activeOrg2,
          extraField: 'should not appear',
        },
      ] as any);

      const result = await organizationService.getAccessibleOrganizations(regularUserId);

      // Should extract only the organization objects
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual(activeOrg1);
      expect(result[1]).toEqual(activeOrg2);

      // Should not contain extra fields from UserOrganization
      expect(result[0]).not.toHaveProperty('role');
      expect(result[0]).not.toHaveProperty('extraField');
    });
  });

  describe('Error Handling', () => {
    it('should return empty array on error for site admins', async () => {
      vi.mocked(mockStorage.getUser).mockResolvedValue({
        id: siteAdminUserId,
        isSiteAdmin: true,
      } as any);

      // Simulate storage error
      vi.mocked(mockStorage.getOrganizations).mockRejectedValue(
        new Error('Database connection failed')
      );

      const result = await organizationService.getAccessibleOrganizations(siteAdminUserId);

      expect(result).toEqual([]);
    });

    it('should return empty array on error for regular users', async () => {
      vi.mocked(mockStorage.getUser).mockResolvedValue({
        id: regularUserId,
        isSiteAdmin: false,
      } as any);

      // Simulate storage error
      vi.mocked(mockStorage.getUserOrganizations).mockRejectedValue(
        new Error('Database connection failed')
      );

      const result = await organizationService.getAccessibleOrganizations(regularUserId);

      expect(result).toEqual([]);
    });

    it('should return empty array if user lookup fails', async () => {
      // Simulate user not found
      vi.mocked(mockStorage.getUser).mockResolvedValue(null);

      const result = await organizationService.getAccessibleOrganizations('nonexistent-user');

      expect(result).toEqual([]);
    });
  });

  describe('Site Admin vs Regular User Differentiation', () => {
    it('should use different code paths for site admin vs regular user', async () => {
      // Test site admin path
      vi.mocked(mockStorage.getUser).mockResolvedValue({
        id: siteAdminUserId,
        isSiteAdmin: true,
      } as any);
      vi.mocked(mockStorage.getOrganizations).mockResolvedValue([activeOrg1, inactiveOrg1]);

      await organizationService.getAccessibleOrganizations(siteAdminUserId);

      expect(mockStorage.getOrganizations).toHaveBeenCalledWith({ includeInactive: true });
      expect(mockStorage.getUserOrganizations).not.toHaveBeenCalled();

      vi.clearAllMocks();

      // Test regular user path
      vi.mocked(mockStorage.getUser).mockResolvedValue({
        id: regularUserId,
        isSiteAdmin: false,
      } as any);
      vi.mocked(mockStorage.getUserOrganizations).mockResolvedValue([
        { userId: regularUserId, organizationId: 'org-1', role: 'coach', organization: activeOrg1 },
      ] as any);

      await organizationService.getAccessibleOrganizations(regularUserId);

      expect(mockStorage.getOrganizations).not.toHaveBeenCalled();
      expect(mockStorage.getUserOrganizations).toHaveBeenCalledWith(regularUserId);
    });

    it('should treat undefined isSiteAdmin as false', async () => {
      // Mock user with undefined isSiteAdmin (defaults to false)
      vi.mocked(mockStorage.getUser).mockResolvedValue({
        id: regularUserId,
        // isSiteAdmin is undefined
      } as any);

      vi.mocked(mockStorage.getUserOrganizations).mockResolvedValue([
        { userId: regularUserId, organizationId: 'org-1', role: 'coach', organization: activeOrg1 },
      ] as any);

      await organizationService.getAccessibleOrganizations(regularUserId);

      // Should use regular user path (getUserOrganizations)
      expect(mockStorage.getUserOrganizations).toHaveBeenCalled();
      expect(mockStorage.getOrganizations).not.toHaveBeenCalled();
    });

    it('should treat null isSiteAdmin as false', async () => {
      vi.mocked(mockStorage.getUser).mockResolvedValue({
        id: regularUserId,
        isSiteAdmin: null,
      } as any);

      vi.mocked(mockStorage.getUserOrganizations).mockResolvedValue([
        { userId: regularUserId, organizationId: 'org-1', role: 'coach', organization: activeOrg1 },
      ] as any);

      await organizationService.getAccessibleOrganizations(regularUserId);

      // Should use regular user path
      expect(mockStorage.getUserOrganizations).toHaveBeenCalled();
      expect(mockStorage.getOrganizations).not.toHaveBeenCalled();
    });
  });

  describe('Cache Optimization', () => {
    it('should skip database query when cachedIsSiteAdmin is provided as true', async () => {
      vi.mocked(mockStorage.getOrganizations).mockResolvedValue([activeOrg1]);

      await organizationService.getAccessibleOrganizations(siteAdminUserId, true);

      // Should NOT query user
      expect(mockStorage.getUser).not.toHaveBeenCalled();

      // Should proceed with site admin logic
      expect(mockStorage.getOrganizations).toHaveBeenCalledWith({ includeInactive: true });
    });

    it('should skip database query when cachedIsSiteAdmin is provided as false', async () => {
      vi.mocked(mockStorage.getUserOrganizations).mockResolvedValue([
        { userId: regularUserId, organizationId: 'org-1', role: 'coach', organization: activeOrg1 },
      ] as any);

      await organizationService.getAccessibleOrganizations(regularUserId, false);

      // Should NOT query user
      expect(mockStorage.getUser).not.toHaveBeenCalled();

      // Should proceed with regular user logic
      expect(mockStorage.getUserOrganizations).toHaveBeenCalledWith(regularUserId);
    });

    it('should query database when cachedIsSiteAdmin is not provided', async () => {
      vi.mocked(mockStorage.getUser).mockResolvedValue({
        id: siteAdminUserId,
        isSiteAdmin: true,
      } as any);
      vi.mocked(mockStorage.getOrganizations).mockResolvedValue([activeOrg1]);

      await organizationService.getAccessibleOrganizations(siteAdminUserId);

      // Should query user since cache not provided
      expect(mockStorage.getUser).toHaveBeenCalledWith(siteAdminUserId);
    });
  });

  describe('Integration with Storage Layer', () => {
    it('should verify storage.getOrganizations respects includeInactive flag behavior', async () => {
      vi.mocked(mockStorage.getUser).mockResolvedValue({
        id: siteAdminUserId,
        isSiteAdmin: true,
      } as any);

      // Storage layer returns both active and inactive when includeInactive: true
      vi.mocked(mockStorage.getOrganizations).mockImplementation((filters?: any) => {
        if (filters?.includeInactive) {
          return Promise.resolve([activeOrg1, activeOrg2, inactiveOrg1, inactiveOrg2]);
        }
        // Default behavior: only active orgs
        return Promise.resolve([activeOrg1, activeOrg2]);
      });

      const result = await organizationService.getAccessibleOrganizations(siteAdminUserId);

      // Site admin should get all 4 orgs (including inactive)
      expect(result).toHaveLength(4);
      expect(mockStorage.getOrganizations).toHaveBeenCalledWith({ includeInactive: true });
    });

    it('should verify regular users never call getOrganizations', async () => {
      vi.mocked(mockStorage.getUser).mockResolvedValue({
        id: regularUserId,
        isSiteAdmin: false,
      } as any);

      vi.mocked(mockStorage.getUserOrganizations).mockResolvedValue([
        { userId: regularUserId, organizationId: 'org-1', role: 'coach', organization: activeOrg1 },
      ] as any);

      await organizationService.getAccessibleOrganizations(regularUserId);

      // Regular users should NEVER call getOrganizations (which filters by isActive)
      expect(mockStorage.getOrganizations).not.toHaveBeenCalled();
    });
  });
});

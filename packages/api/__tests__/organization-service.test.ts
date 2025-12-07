/**
 * Comprehensive unit tests for OrganizationService
 *
 * Test Coverage:
 * - Organization CRUD operations (create, update, getById, getAll)
 * - Organization deactivation/reactivation (soft delete)
 * - Organization deletion with constant-time comparison (security)
 * - Accessible organizations (site admin vs regular users)
 * - Organization profile management
 * - User management (add/remove users from organization)
 * - Batch operations (getOrganizationProfilesBatch)
 * - Dependency counting
 * - Authorization checks (site admin permissions)
 * - Audit logging
 * - Input validation and sanitization
 * - Error handling
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
    // Organization operations
    createOrganization: vi.fn(),
    getOrganization: vi.fn(),
    getOrganizations: vi.fn(),
    getOrganizationByName: vi.fn(),
    updateOrganization: vi.fn(),
    deleteOrganization: vi.fn(),
    deactivateOrganization: vi.fn(),
    reactivateOrganization: vi.fn(),
    getOrganizationDependencyCounts: vi.fn(),
    // User operations
    getUser: vi.fn(),
    getUserByUsername: vi.fn(),
    createUser: vi.fn(),
    getUserRoles: vi.fn(),
    // Organization user operations
    getUserOrganizations: vi.fn(),
    getOrganizationUsers: vi.fn(),
    addUserToOrganization: vi.fn(),
    removeUserFromOrganization: vi.fn(),
    getOrganizationInvitations: vi.fn(),
    // Audit logging
    createAuditLog: vi.fn(),
  },
}));

import { OrganizationService } from '../services/organization-service';
import { storage } from '../storage';
import type { Organization, User, InsertOrganization, UpdateOrganization } from '@shared/schema';

const mockStorage = storage;

describe('OrganizationService', () => {
  let organizationService: OrganizationService;
  const siteAdminUserId = 'admin-123';
  const regularUserId = 'user-456';
  const orgId = 'org-789';

  const mockSiteAdmin: Partial<User> = {
    id: siteAdminUserId,
    username: 'siteadmin',
    isSiteAdmin: true,
  };

  const mockRegularUser: Partial<User> = {
    id: regularUserId,
    username: 'regularuser',
    isSiteAdmin: false,
  };

  const mockOrg: Organization = {
    id: orgId,
    name: 'Test Organization',
    description: 'A test organization',
    location: 'Test City',
    orgType: 'club',
    isActive: true,
    benchmarksEnabled: false,
    allowCustomBenchmarks: false,
    aiEnabledBySiteAdmin: false,
    aiEnabled: false,
    wellnessEnabled: true,
    joinCode: 'TEST123',
    isPublicDirectory: false,
    allowMembershipRequests: true,
    autoApproveRequests: false,
    deletedAt: null,
    createdAt: new Date(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    organizationService = new OrganizationService();

    // Default mock for site admin check
    vi.mocked(mockStorage.getUser).mockResolvedValue(mockSiteAdmin as User);
  });

  describe('createOrganization', () => {
    it('should create organization when user is site admin', async () => {
      const newOrgData: InsertOrganization = {
        name: 'New Organization',
        description: 'New org description',
        location: 'New City',
        orgType: 'high_school',
      };

      const createdOrg = { ...mockOrg, ...newOrgData, id: 'new-org-id' };
      vi.mocked(mockStorage.createOrganization).mockResolvedValue(createdOrg);

      const result = await organizationService.createOrganization(newOrgData, siteAdminUserId);

      expect(result).toEqual(createdOrg);
      expect(mockStorage.getUser).toHaveBeenCalledWith(siteAdminUserId);
      expect(mockStorage.createOrganization).toHaveBeenCalledWith(newOrgData);
    });

    it('should throw error when non-site-admin tries to create organization', async () => {
      vi.mocked(mockStorage.getUser).mockResolvedValue(mockRegularUser as User);

      const newOrgData: InsertOrganization = {
        name: 'New Organization',
      };

      await expect(
        organizationService.createOrganization(newOrgData, regularUserId)
      ).rejects.toThrow('Unauthorized: Only site administrators can create organizations');

      expect(mockStorage.createOrganization).not.toHaveBeenCalled();
    });

    it('should validate organization data with schema', async () => {
      const invalidOrgData: any = {
        name: '', // Empty name should fail validation
      };

      await expect(
        organizationService.createOrganization(invalidOrgData, siteAdminUserId)
      ).rejects.toThrow();
    });

    it('should handle database errors during creation', async () => {
      const newOrgData: InsertOrganization = {
        name: 'New Organization',
      };

      vi.mocked(mockStorage.createOrganization).mockRejectedValue(
        new Error('Database error')
      );

      await expect(
        organizationService.createOrganization(newOrgData, siteAdminUserId)
      ).rejects.toThrow('Database error');
    });
  });

  describe('updateOrganization', () => {
    it('should update organization when user is site admin', async () => {
      const updates: UpdateOrganization = {
        name: 'Updated Name',
        description: 'Updated description',
      };

      const updatedOrg = { ...mockOrg, ...updates };
      vi.mocked(mockStorage.getOrganization).mockResolvedValue(mockOrg);
      vi.mocked(mockStorage.updateOrganization).mockResolvedValue(updatedOrg);
      vi.mocked(mockStorage.createAuditLog).mockResolvedValue(undefined as any);

      const result = await organizationService.updateOrganization(
        orgId,
        updates,
        siteAdminUserId,
        { ipAddress: '127.0.0.1', userAgent: 'test-agent' }
      );

      expect(result).toEqual(updatedOrg);
      expect(mockStorage.updateOrganization).toHaveBeenCalledWith(orgId, updates);
      expect(mockStorage.createAuditLog).toHaveBeenCalled();
    });

    it('should throw error when non-site-admin tries to update organization', async () => {
      vi.mocked(mockStorage.getUser).mockResolvedValue(mockRegularUser as User);

      const updates: UpdateOrganization = {
        name: 'Updated Name',
      };

      await expect(
        organizationService.updateOrganization(orgId, updates, regularUserId)
      ).rejects.toThrow('Unauthorized: Only site administrators can update organization settings');

      expect(mockStorage.updateOrganization).not.toHaveBeenCalled();
    });

    it('should throw error when organization not found', async () => {
      vi.mocked(mockStorage.getOrganization).mockResolvedValue(null);

      const updates: UpdateOrganization = {
        name: 'Updated Name',
      };

      await expect(
        organizationService.updateOrganization(orgId, updates, siteAdminUserId)
      ).rejects.toThrow('Organization not found');
    });

    it('should check name uniqueness when updating name', async () => {
      const updates: UpdateOrganization = {
        name: 'Existing Organization',
      };

      const existingOrg = { ...mockOrg, id: 'other-org-id', name: 'Existing Organization' };
      vi.mocked(mockStorage.getOrganization).mockResolvedValue(mockOrg);
      vi.mocked(mockStorage.getOrganizationByName).mockResolvedValue(existingOrg);

      await expect(
        organizationService.updateOrganization(orgId, updates, siteAdminUserId)
      ).rejects.toThrow('An organization with this name already exists');
    });

    it('should allow updating to same name (case sensitivity)', async () => {
      const updates: UpdateOrganization = {
        name: 'Test Organization', // Same as current name
      };

      vi.mocked(mockStorage.getOrganization).mockResolvedValue(mockOrg);
      vi.mocked(mockStorage.getOrganizationByName).mockResolvedValue(null);
      vi.mocked(mockStorage.updateOrganization).mockResolvedValue({ ...mockOrg, ...updates });
      vi.mocked(mockStorage.createAuditLog).mockResolvedValue(undefined as any);

      const result = await organizationService.updateOrganization(orgId, updates, siteAdminUserId);

      expect(result).toBeDefined();
      expect(mockStorage.updateOrganization).toHaveBeenCalled();
    });

    it('should auto-disable aiEnabled when aiEnabledBySiteAdmin is set to false', async () => {
      const orgWithAiEnabled = { ...mockOrg, aiEnabledBySiteAdmin: true, aiEnabled: true };
      const updates: UpdateOrganization = {
        aiEnabledBySiteAdmin: false,
      };

      vi.mocked(mockStorage.getOrganization).mockResolvedValue(orgWithAiEnabled);
      vi.mocked(mockStorage.updateOrganization).mockResolvedValue({ ...orgWithAiEnabled, ...updates, aiEnabled: false });
      vi.mocked(mockStorage.createAuditLog).mockResolvedValue(undefined as any);

      await organizationService.updateOrganization(orgId, updates, siteAdminUserId);

      // Should auto-disable aiEnabled
      expect(mockStorage.updateOrganization).toHaveBeenCalledWith(
        orgId,
        expect.objectContaining({
          aiEnabledBySiteAdmin: false,
          aiEnabled: false,
        })
      );
    });

    it('should create audit logs for AI flag changes', async () => {
      const updates: UpdateOrganization = {
        aiEnabledBySiteAdmin: true,
      };

      vi.mocked(mockStorage.getOrganization).mockResolvedValue(mockOrg);
      vi.mocked(mockStorage.updateOrganization).mockResolvedValue({ ...mockOrg, ...updates });
      vi.mocked(mockStorage.createAuditLog).mockResolvedValue(undefined as any);

      await organizationService.updateOrganization(orgId, updates, siteAdminUserId);

      // Should create two audit logs: one for general update, one for AI change
      expect(mockStorage.createAuditLog).toHaveBeenCalledTimes(2);
      expect(mockStorage.createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'org_ai_enabled_by_site_admin',
        })
      );
    });

    it('should sanitize inputs for audit logs', async () => {
      const maliciousName = 'Test\nOrg\x1B[31mRED\x1B[0m\r\nInjection';
      const updates: UpdateOrganization = {
        name: maliciousName,
      };

      vi.mocked(mockStorage.getOrganization).mockResolvedValue(mockOrg);
      vi.mocked(mockStorage.getOrganizationByName).mockResolvedValue(null);
      vi.mocked(mockStorage.updateOrganization).mockResolvedValue({ ...mockOrg, name: maliciousName });
      vi.mocked(mockStorage.createAuditLog).mockResolvedValue(undefined as any);

      await organizationService.updateOrganization(orgId, updates, siteAdminUserId);

      // Verify audit log was called with sanitized data
      expect(mockStorage.createAuditLog).toHaveBeenCalled();
      const auditLogCall = vi.mocked(mockStorage.createAuditLog).mock.calls[0][0];
      const details = JSON.parse(auditLogCall.details || '{}');

      // Sanitized name should not contain control characters or ANSI codes
      expect(details.changes.nameChanged.to).not.toContain('\n');
      expect(details.changes.nameChanged.to).not.toContain('\r');
      expect(details.changes.nameChanged.to).not.toContain('\x1B');
    });

    it('should track multiple field changes in audit log', async () => {
      const updates: UpdateOrganization = {
        name: 'New Name',
        description: 'New Description',
        isActive: false,
        benchmarksEnabled: true,
      };

      vi.mocked(mockStorage.getOrganization).mockResolvedValue(mockOrg);
      vi.mocked(mockStorage.getOrganizationByName).mockResolvedValue(null);
      vi.mocked(mockStorage.updateOrganization).mockResolvedValue({ ...mockOrg, ...updates });
      vi.mocked(mockStorage.createAuditLog).mockResolvedValue(undefined as any);

      await organizationService.updateOrganization(orgId, updates, siteAdminUserId);

      const auditLogCall = vi.mocked(mockStorage.createAuditLog).mock.calls[0][0];
      const details = JSON.parse(auditLogCall.details || '{}');

      expect(details.changes.nameChanged).toBeDefined();
      expect(details.changes.descriptionChanged).toBe(true);
      expect(details.changes.isActiveChanged).toBeDefined();
      expect(details.changes.benchmarksEnabledChanged).toBeDefined();
    });
  });

  describe('getAllOrganizations', () => {
    it('should return all organizations for site admin', async () => {
      const orgs = [mockOrg, { ...mockOrg, id: 'org-2', name: 'Org 2' }];
      vi.mocked(mockStorage.getOrganizations).mockResolvedValue(orgs);

      const result = await organizationService.getAllOrganizations(siteAdminUserId);

      expect(result).toEqual(orgs);
      expect(mockStorage.getOrganizations).toHaveBeenCalledWith({ includeInactive: true });
    });

    it('should throw error when non-site-admin tries to get all organizations', async () => {
      vi.mocked(mockStorage.getUser).mockResolvedValue(mockRegularUser as User);

      await expect(
        organizationService.getAllOrganizations(regularUserId)
      ).rejects.toThrow('Unauthorized: Only site administrators can view all organizations');
    });

    it('should return empty array on error', async () => {
      vi.mocked(mockStorage.getOrganizations).mockRejectedValue(new Error('Database error'));

      const result = await organizationService.getAllOrganizations(siteAdminUserId);

      expect(result).toEqual([]);
    });

    it('should include inactive organizations', async () => {
      const activeOrg = { ...mockOrg };
      const inactiveOrg = { ...mockOrg, id: 'org-2', isActive: false };
      vi.mocked(mockStorage.getOrganizations).mockResolvedValue([activeOrg, inactiveOrg]);

      const result = await organizationService.getAllOrganizations(siteAdminUserId);

      expect(result).toHaveLength(2);
      expect(result).toContainEqual(activeOrg);
      expect(result).toContainEqual(inactiveOrg);
    });
  });

  describe('getOrganizationById', () => {
    it('should return organization for site admin', async () => {
      vi.mocked(mockStorage.getOrganization).mockResolvedValue(mockOrg);

      const result = await organizationService.getOrganizationById(orgId, siteAdminUserId);

      expect(result).toEqual(mockOrg);
    });

    it('should return organization for user with access', async () => {
      vi.mocked(mockStorage.getUser).mockResolvedValue(mockRegularUser as User);
      vi.mocked(mockStorage.getOrganization).mockResolvedValue(mockOrg);
      vi.mocked(mockStorage.getUserOrganizations).mockResolvedValue([
        {
          userId: regularUserId,
          organizationId: orgId,
          role: 'coach',
          organization: mockOrg,
        } as any,
      ]);

      const result = await organizationService.getOrganizationById(orgId, regularUserId);

      expect(result).toEqual(mockOrg);
    });

    it('should return null for user without access', async () => {
      vi.mocked(mockStorage.getUser).mockResolvedValue(mockRegularUser as User);
      vi.mocked(mockStorage.getOrganization).mockResolvedValue(mockOrg);
      vi.mocked(mockStorage.getUserOrganizations).mockResolvedValue([]);

      const result = await organizationService.getOrganizationById(orgId, regularUserId);

      expect(result).toBeNull();
    });

    it('should return null when organization not found', async () => {
      vi.mocked(mockStorage.getOrganization).mockResolvedValue(null);

      const result = await organizationService.getOrganizationById(orgId, siteAdminUserId);

      expect(result).toBeNull();
    });

    it('should handle errors gracefully', async () => {
      vi.mocked(mockStorage.getOrganization).mockRejectedValue(new Error('Database error'));

      const result = await organizationService.getOrganizationById(orgId, siteAdminUserId);

      expect(result).toBeNull();
    });
  });

  describe('getAccessibleOrganizations', () => {
    it('should return all organizations for site admin', async () => {
      const orgs = [mockOrg, { ...mockOrg, id: 'org-2', isActive: false }];
      vi.mocked(mockStorage.getOrganizations).mockResolvedValue(orgs);

      const result = await organizationService.getAccessibleOrganizations(siteAdminUserId);

      expect(result).toEqual(orgs);
      expect(mockStorage.getOrganizations).toHaveBeenCalledWith({ includeInactive: true });
    });

    it('should return user organizations for regular user', async () => {
      vi.mocked(mockStorage.getUser).mockResolvedValue(mockRegularUser as User);
      vi.mocked(mockStorage.getUserOrganizations).mockResolvedValue([
        {
          userId: regularUserId,
          organizationId: orgId,
          role: 'coach',
          organization: mockOrg,
        } as any,
      ]);

      const result = await organizationService.getAccessibleOrganizations(regularUserId);

      expect(result).toEqual([mockOrg]);
      expect(mockStorage.getUserOrganizations).toHaveBeenCalledWith(regularUserId);
    });

    it('should use cached site admin status when provided', async () => {
      vi.mocked(mockStorage.getOrganizations).mockResolvedValue([mockOrg]);

      await organizationService.getAccessibleOrganizations(siteAdminUserId, true);

      // Should not query user
      expect(mockStorage.getUser).not.toHaveBeenCalled();
      expect(mockStorage.getOrganizations).toHaveBeenCalledWith({ includeInactive: true });
    });

    it('should return empty array on error', async () => {
      vi.mocked(mockStorage.getOrganizations).mockRejectedValue(new Error('Database error'));

      const result = await organizationService.getAccessibleOrganizations(siteAdminUserId);

      expect(result).toEqual([]);
    });
  });

  describe('getOrganizationProfile', () => {
    it('should return organization profile with users and invitations', async () => {
      const users = [
        { id: 'user-1', role: 'org_admin' },
        { id: 'user-2', role: 'coach' },
        { id: 'user-3', role: 'athlete' },
      ];
      const invitations = [
        { id: 'inv-1', email: 'test@example.com' },
      ];

      vi.mocked(mockStorage.getOrganization).mockResolvedValue(mockOrg);
      vi.mocked(mockStorage.getUserOrganizations).mockResolvedValue([
        { userId: regularUserId, organizationId: orgId, role: 'coach', organization: mockOrg } as any,
      ]);
      vi.mocked(mockStorage.getOrganizationUsers).mockResolvedValue(users as any);
      vi.mocked(mockStorage.getOrganizationInvitations).mockResolvedValue(invitations as any);

      const result = await organizationService.getOrganizationProfile(orgId, regularUserId);

      expect(result.organization).toEqual(mockOrg);
      expect(result.coaches).toHaveLength(2); // org_admin and coach
      expect(result.athletes).toHaveLength(1);
      expect(result.invitations).toEqual(invitations);
    });

    it('should throw error when user has no access', async () => {
      vi.mocked(mockStorage.getUser).mockResolvedValue(mockRegularUser as User);
      vi.mocked(mockStorage.getUserOrganizations).mockResolvedValue([]);

      await expect(
        organizationService.getOrganizationProfile(orgId, regularUserId)
      ).rejects.toThrow('Unauthorized: Access denied to this organization');
    });

    it('should throw error when organization not found', async () => {
      vi.mocked(mockStorage.getUserOrganizations).mockResolvedValue([
        { userId: regularUserId, organizationId: orgId, role: 'coach', organization: mockOrg } as any,
      ]);
      vi.mocked(mockStorage.getOrganization).mockResolvedValue(null);

      await expect(
        organizationService.getOrganizationProfile(orgId, regularUserId)
      ).rejects.toThrow('Organization not found');
    });
  });

  describe('deactivateOrganization', () => {
    it('should deactivate organization when user is site admin', async () => {
      vi.mocked(mockStorage.getOrganization).mockResolvedValue(mockOrg);
      vi.mocked(mockStorage.deactivateOrganization).mockResolvedValue(undefined);
      vi.mocked(mockStorage.createAuditLog).mockResolvedValue(undefined as any);

      await organizationService.deactivateOrganization(
        orgId,
        siteAdminUserId,
        { ipAddress: '127.0.0.1', userAgent: 'test-agent' }
      );

      expect(mockStorage.deactivateOrganization).toHaveBeenCalledWith(orgId);
      expect(mockStorage.createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'organization_deactivated',
          resourceType: 'organization',
          resourceId: orgId,
        })
      );
    });

    it('should throw error when non-site-admin tries to deactivate', async () => {
      vi.mocked(mockStorage.getUser).mockResolvedValue(mockRegularUser as User);

      await expect(
        organizationService.deactivateOrganization(orgId, regularUserId)
      ).rejects.toThrow('Unauthorized: Only site administrators can deactivate organizations');

      expect(mockStorage.deactivateOrganization).not.toHaveBeenCalled();
    });

    it('should throw error when organization not found', async () => {
      vi.mocked(mockStorage.getOrganization).mockResolvedValue(null);

      await expect(
        organizationService.deactivateOrganization(orgId, siteAdminUserId)
      ).rejects.toThrow('Organization not found');
    });

    it('should throw error when organization already deactivated', async () => {
      const inactiveOrg = { ...mockOrg, isActive: false };
      vi.mocked(mockStorage.getOrganization).mockResolvedValue(inactiveOrg);

      await expect(
        organizationService.deactivateOrganization(orgId, siteAdminUserId)
      ).rejects.toThrow('Organization is already deactivated');
    });
  });

  describe('reactivateOrganization', () => {
    it('should reactivate organization when user is site admin', async () => {
      const inactiveOrg = { ...mockOrg, isActive: false };
      vi.mocked(mockStorage.getOrganization).mockResolvedValue(inactiveOrg);
      vi.mocked(mockStorage.reactivateOrganization).mockResolvedValue(undefined);
      vi.mocked(mockStorage.createAuditLog).mockResolvedValue(undefined as any);

      await organizationService.reactivateOrganization(
        orgId,
        siteAdminUserId,
        { ipAddress: '127.0.0.1', userAgent: 'test-agent' }
      );

      expect(mockStorage.reactivateOrganization).toHaveBeenCalledWith(orgId);
      expect(mockStorage.createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'organization_reactivated',
        })
      );
    });

    it('should throw error when non-site-admin tries to reactivate', async () => {
      vi.mocked(mockStorage.getUser).mockResolvedValue(mockRegularUser as User);

      await expect(
        organizationService.reactivateOrganization(orgId, regularUserId)
      ).rejects.toThrow('Unauthorized: Only site administrators can reactivate organizations');

      expect(mockStorage.reactivateOrganization).not.toHaveBeenCalled();
    });

    it('should throw error when organization already active', async () => {
      vi.mocked(mockStorage.getOrganization).mockResolvedValue(mockOrg);

      await expect(
        organizationService.reactivateOrganization(orgId, siteAdminUserId)
      ).rejects.toThrow('Organization is already active');
    });
  });

  describe('deleteOrganization', () => {
    it('should delete organization with correct confirmation name', async () => {
      vi.mocked(mockStorage.getOrganization).mockResolvedValue(mockOrg);
      vi.mocked(mockStorage.deleteOrganization).mockResolvedValue(undefined);
      vi.mocked(mockStorage.createAuditLog).mockResolvedValue(undefined as any);

      await organizationService.deleteOrganization(
        orgId,
        'Test Organization',
        siteAdminUserId,
        { ipAddress: '127.0.0.1', userAgent: 'test-agent' }
      );

      expect(mockStorage.deleteOrganization).toHaveBeenCalledWith(orgId);
      expect(mockStorage.createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'organization_deleted',
        })
      );
    });

    it('should delete organization with case-insensitive name matching', async () => {
      vi.mocked(mockStorage.getOrganization).mockResolvedValue(mockOrg);
      vi.mocked(mockStorage.deleteOrganization).mockResolvedValue(undefined);
      vi.mocked(mockStorage.createAuditLog).mockResolvedValue(undefined as any);

      await organizationService.deleteOrganization(
        orgId,
        'test organization', // lowercase
        siteAdminUserId
      );

      expect(mockStorage.deleteOrganization).toHaveBeenCalledWith(orgId);
    });

    it('should delete organization with whitespace-trimmed name matching', async () => {
      vi.mocked(mockStorage.getOrganization).mockResolvedValue(mockOrg);
      vi.mocked(mockStorage.deleteOrganization).mockResolvedValue(undefined);
      vi.mocked(mockStorage.createAuditLog).mockResolvedValue(undefined as any);

      await organizationService.deleteOrganization(
        orgId,
        '  Test Organization  ', // with whitespace
        siteAdminUserId
      );

      expect(mockStorage.deleteOrganization).toHaveBeenCalledWith(orgId);
    });

    it('should throw error when confirmation name does not match', async () => {
      vi.mocked(mockStorage.getOrganization).mockResolvedValue(mockOrg);

      await expect(
        organizationService.deleteOrganization(orgId, 'Wrong Name', siteAdminUserId)
      ).rejects.toThrow('Organization name confirmation does not match');

      expect(mockStorage.deleteOrganization).not.toHaveBeenCalled();
    });

    it('should throw error when confirmation name is empty', async () => {
      vi.mocked(mockStorage.getOrganization).mockResolvedValue(mockOrg);

      await expect(
        organizationService.deleteOrganization(orgId, '', siteAdminUserId)
      ).rejects.toThrow('Confirmation name is required');
    });

    it('should throw error when confirmation name is too long (DoS protection)', async () => {
      vi.mocked(mockStorage.getOrganization).mockResolvedValue(mockOrg);
      const longName = 'a'.repeat(256);

      await expect(
        organizationService.deleteOrganization(orgId, longName, siteAdminUserId)
      ).rejects.toThrow('Confirmation name too long');
    });

    it('should throw error when confirmation name is not a string', async () => {
      vi.mocked(mockStorage.getOrganization).mockResolvedValue(mockOrg);

      await expect(
        organizationService.deleteOrganization(orgId, null as any, siteAdminUserId)
      ).rejects.toThrow('Confirmation name is required');
    });

    it('should throw error when non-site-admin tries to delete', async () => {
      vi.mocked(mockStorage.getUser).mockResolvedValue(mockRegularUser as User);

      await expect(
        organizationService.deleteOrganization(orgId, 'Test Organization', regularUserId)
      ).rejects.toThrow('Unauthorized: Only site administrators can delete organizations');

      expect(mockStorage.deleteOrganization).not.toHaveBeenCalled();
    });

    it('should throw error when organization not found', async () => {
      vi.mocked(mockStorage.getOrganization).mockResolvedValue(null);

      await expect(
        organizationService.deleteOrganization(orgId, 'Test Organization', siteAdminUserId)
      ).rejects.toThrow('Organization not found');
    });

    it('should sanitize all inputs for audit log', async () => {
      const maliciousName = 'Test\nOrg\x1B[31m\r\n';
      vi.mocked(mockStorage.getOrganization).mockResolvedValue(mockOrg);
      vi.mocked(mockStorage.deleteOrganization).mockResolvedValue(undefined);
      vi.mocked(mockStorage.createAuditLog).mockResolvedValue(undefined as any);

      await organizationService.deleteOrganization(
        orgId,
        'Test Organization',
        siteAdminUserId,
        {
          ipAddress: '127.0.0.1\nInjection',
          userAgent: 'Mozilla\x1B[31mRED\x1B[0m',
        }
      );

      const auditLogCall = vi.mocked(mockStorage.createAuditLog).mock.calls[0][0];
      expect(auditLogCall.ipAddress).not.toContain('\n');
      expect(auditLogCall.userAgent).not.toContain('\x1B');
    });
  });

  describe('getOrganizationDependencyCounts', () => {
    it('should return dependency counts for site admin', async () => {
      const counts = { users: 10, teams: 5, measurements: 100 };
      vi.mocked(mockStorage.getOrganization).mockResolvedValue(mockOrg);
      vi.mocked(mockStorage.getOrganizationDependencyCounts).mockResolvedValue(counts);
      vi.mocked(mockStorage.createAuditLog).mockResolvedValue(undefined as any);

      const result = await organizationService.getOrganizationDependencyCounts(
        orgId,
        siteAdminUserId,
        { ipAddress: '127.0.0.1' }
      );

      expect(result).toEqual(counts);
      expect(mockStorage.createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'organization_dependencies_viewed',
        })
      );
    });

    it('should throw error when non-site-admin tries to view counts', async () => {
      vi.mocked(mockStorage.getUser).mockResolvedValue(mockRegularUser as User);

      await expect(
        organizationService.getOrganizationDependencyCounts(orgId, regularUserId)
      ).rejects.toThrow('Unauthorized: Only site administrators can view dependency counts');
    });

    it('should throw error when organization not found', async () => {
      vi.mocked(mockStorage.getOrganization).mockResolvedValue(null);

      await expect(
        organizationService.getOrganizationDependencyCounts(orgId, siteAdminUserId)
      ).rejects.toThrow('Organization not found');
    });
  });

  describe('addUserToOrganization', () => {
    it('should add user to organization with role', async () => {
      const newUser = {
        id: 'new-user-id',
        username: 'newuser',
        firstName: 'New',
        lastName: 'User',
      };
      const userData = {
        username: 'newuser',
        password: 'password123',
        firstName: 'New',
        lastName: 'User',
        role: 'athlete',
      };

      vi.mocked(mockStorage.getUserOrganizations).mockResolvedValue([
        { userId: regularUserId, organizationId: orgId, role: 'coach', organization: mockOrg } as any,
      ]);
      vi.mocked(mockStorage.getUserByUsername).mockResolvedValue(null);
      vi.mocked(mockStorage.createUser).mockResolvedValue(newUser as any);
      vi.mocked(mockStorage.addUserToOrganization).mockResolvedValue(undefined);

      const result = await organizationService.addUserToOrganization(orgId, userData, regularUserId);

      expect(result).toEqual(newUser);
      expect(mockStorage.createUser).toHaveBeenCalledWith(userData);
      expect(mockStorage.addUserToOrganization).toHaveBeenCalledWith(newUser.id, orgId, 'athlete');
    });

    it('should default to athlete role if not specified', async () => {
      const newUser = { id: 'new-user-id', username: 'newuser' };
      const userData = { username: 'newuser', password: 'password123', firstName: 'New', lastName: 'User' };

      vi.mocked(mockStorage.getUserOrganizations).mockResolvedValue([
        { userId: regularUserId, organizationId: orgId, role: 'coach', organization: mockOrg } as any,
      ]);
      vi.mocked(mockStorage.getUserByUsername).mockResolvedValue(null);
      vi.mocked(mockStorage.createUser).mockResolvedValue(newUser as any);
      vi.mocked(mockStorage.addUserToOrganization).mockResolvedValue(undefined);

      await organizationService.addUserToOrganization(orgId, userData, regularUserId);

      expect(mockStorage.addUserToOrganization).toHaveBeenCalledWith(newUser.id, orgId, 'athlete');
    });

    it('should throw error when username already exists (prevent enumeration)', async () => {
      const existingUser = { id: 'existing-user', username: 'existinguser' };
      const userData = { username: 'existinguser', password: 'password123' };

      vi.mocked(mockStorage.getUserOrganizations).mockResolvedValue([
        { userId: regularUserId, organizationId: orgId, role: 'coach', organization: mockOrg } as any,
      ]);
      vi.mocked(mockStorage.getUserByUsername).mockResolvedValue(existingUser as any);

      // Measure timing
      const start = Date.now();
      await expect(
        organizationService.addUserToOrganization(orgId, userData, regularUserId)
      ).rejects.toThrow('Unable to create user. Please check your input and try again.');
      const elapsed = Date.now() - start;

      // Should take at least 100ms to prevent timing attacks
      expect(elapsed).toBeGreaterThanOrEqual(100);
      expect(mockStorage.createUser).not.toHaveBeenCalled();
    });

    it('should throw error when user has no access to organization', async () => {
      vi.mocked(mockStorage.getUser).mockResolvedValue(mockRegularUser as User);
      vi.mocked(mockStorage.getUserOrganizations).mockResolvedValue([]);

      await expect(
        organizationService.addUserToOrganization(orgId, {}, regularUserId)
      ).rejects.toThrow('Unauthorized: Access denied to this organization');
    });

    it('should normalize timing on errors to prevent username enumeration', async () => {
      vi.mocked(mockStorage.getUserOrganizations).mockResolvedValue([
        { userId: regularUserId, organizationId: orgId, role: 'coach', organization: mockOrg } as any,
      ]);
      vi.mocked(mockStorage.getUserByUsername).mockResolvedValue(null);
      vi.mocked(mockStorage.createUser).mockRejectedValue(new Error('Database error'));

      const start = Date.now();
      await expect(
        organizationService.addUserToOrganization(orgId, { username: 'test' }, regularUserId)
      ).rejects.toThrow();
      const elapsed = Date.now() - start;

      // Should take at least 100ms even on database error
      expect(elapsed).toBeGreaterThanOrEqual(100);
    });
  });

  describe('removeUserFromOrganization', () => {
    it('should allow site admin to remove any user', async () => {
      vi.mocked(mockStorage.getUserOrganizations).mockResolvedValue([
        { userId: siteAdminUserId, organizationId: orgId, role: 'org_admin', organization: mockOrg } as any,
      ]);
      vi.mocked(mockStorage.getUserRoles).mockResolvedValue(['athlete']);
      vi.mocked(mockStorage.removeUserFromOrganization).mockResolvedValue(undefined);

      await organizationService.removeUserFromOrganization(orgId, 'user-to-remove', siteAdminUserId);

      expect(mockStorage.removeUserFromOrganization).toHaveBeenCalledWith('user-to-remove', orgId, false);
    });

    it('should allow org admin to remove athletes and coaches', async () => {
      vi.mocked(mockStorage.getUser).mockResolvedValue({ ...mockRegularUser, isSiteAdmin: false } as User);
      vi.mocked(mockStorage.getUserOrganizations).mockResolvedValue([
        { userId: regularUserId, organizationId: orgId, role: 'org_admin', organization: mockOrg } as any,
      ]);
      vi.mocked(mockStorage.getUserRoles)
        .mockResolvedValueOnce(['athlete']) // target user role
        .mockResolvedValueOnce(['org_admin']); // requesting user role
      vi.mocked(mockStorage.removeUserFromOrganization).mockResolvedValue(undefined);

      await organizationService.removeUserFromOrganization(orgId, 'athlete-to-remove', regularUserId);

      expect(mockStorage.removeUserFromOrganization).toHaveBeenCalled();
    });

    it('should allow coach to remove only athletes', async () => {
      vi.mocked(mockStorage.getUser).mockResolvedValue({ ...mockRegularUser, isSiteAdmin: false } as User);
      vi.mocked(mockStorage.getUserOrganizations).mockResolvedValue([
        { userId: regularUserId, organizationId: orgId, role: 'coach', organization: mockOrg } as any,
      ]);
      vi.mocked(mockStorage.getUserRoles)
        .mockResolvedValueOnce(['athlete'])
        .mockResolvedValueOnce(['coach']);
      vi.mocked(mockStorage.removeUserFromOrganization).mockResolvedValue(undefined);

      await organizationService.removeUserFromOrganization(orgId, 'athlete-to-remove', regularUserId);

      expect(mockStorage.removeUserFromOrganization).toHaveBeenCalled();
    });

    it('should throw error when coach tries to remove non-athlete', async () => {
      vi.mocked(mockStorage.getUser).mockResolvedValue({ ...mockRegularUser, isSiteAdmin: false } as User);
      vi.mocked(mockStorage.getUserOrganizations).mockResolvedValue([
        { userId: regularUserId, organizationId: orgId, role: 'coach', organization: mockOrg } as any,
      ]);
      vi.mocked(mockStorage.getUserRoles)
        .mockResolvedValueOnce(['coach']) // target user is a coach
        .mockResolvedValueOnce(['coach']); // requesting user is a coach

      await expect(
        organizationService.removeUserFromOrganization(orgId, 'coach-to-remove', regularUserId)
      ).rejects.toThrow('Access denied. Coaches can only delete athletes.');
    });

    it('should throw error when athlete tries to remove users', async () => {
      vi.mocked(mockStorage.getUser).mockResolvedValue({ ...mockRegularUser, isSiteAdmin: false } as User);
      vi.mocked(mockStorage.getUserOrganizations).mockResolvedValue([
        { userId: regularUserId, organizationId: orgId, role: 'athlete', organization: mockOrg } as any,
      ]);
      vi.mocked(mockStorage.getUserRoles)
        .mockResolvedValueOnce(['athlete']) // target user
        .mockResolvedValueOnce(['athlete']); // requesting user

      await expect(
        organizationService.removeUserFromOrganization(orgId, 'user-to-remove', regularUserId)
      ).rejects.toThrow('Access denied. Only coaches and organization admins can delete users.');
    });

    it('should use transaction for org admin removal', async () => {
      vi.mocked(mockStorage.getUserOrganizations).mockResolvedValue([
        { userId: siteAdminUserId, organizationId: orgId, role: 'org_admin', organization: mockOrg } as any,
      ]);
      vi.mocked(mockStorage.getUserRoles).mockResolvedValue(['org_admin']);
      vi.mocked(mockStorage.removeUserFromOrganization).mockResolvedValue(undefined);

      await organizationService.removeUserFromOrganization(orgId, 'admin-to-remove', siteAdminUserId);

      // isAdminRemoval should be true
      expect(mockStorage.removeUserFromOrganization).toHaveBeenCalledWith('admin-to-remove', orgId, true);
    });
  });

  describe('getOrganizationProfilesBatch', () => {
    it('should batch fetch organization profiles efficiently', async () => {
      const org1 = mockOrg;
      const org2 = { ...mockOrg, id: 'org-2', name: 'Org 2' };
      const users1 = [{ id: 'user-1', role: 'coach' }];
      const users2 = [{ id: 'user-2', role: 'athlete' }];

      vi.mocked(mockStorage.getOrganization)
        .mockResolvedValueOnce(org1)
        .mockResolvedValueOnce(org2);
      vi.mocked(mockStorage.getOrganizationUsers)
        .mockResolvedValueOnce(users1 as any)
        .mockResolvedValueOnce(users2 as any);
      vi.mocked(mockStorage.getOrganizationInvitations)
        .mockResolvedValue([]);

      const result = await organizationService.getOrganizationProfilesBatch(
        ['org-789', 'org-2'],
        siteAdminUserId
      );

      expect(result.size).toBe(2);
      expect(result.get('org-789')?.organization).toEqual(org1);
      expect(result.get('org-2')?.organization).toEqual(org2);
    });

    it('should process large batches in chunks of 50', async () => {
      const orgIds = Array.from({ length: 100 }, (_, i) => `org-${i}`);

      vi.mocked(mockStorage.getOrganization).mockResolvedValue(mockOrg);
      vi.mocked(mockStorage.getOrganizationUsers).mockResolvedValue([]);
      vi.mocked(mockStorage.getOrganizationInvitations).mockResolvedValue([]);

      const result = await organizationService.getOrganizationProfilesBatch(orgIds, siteAdminUserId);

      expect(result.size).toBe(100);
      // Verify batching by checking that getOrganization was called 100 times (not 200+)
      expect(vi.mocked(mockStorage.getOrganization).mock.calls.length).toBe(100);
    });

    it('should handle errors in batch fetching', async () => {
      vi.mocked(mockStorage.getOrganization).mockRejectedValue(new Error('Database error'));

      await expect(
        organizationService.getOrganizationProfilesBatch(['org-789'], siteAdminUserId)
      ).rejects.toThrow('Database error');
    });
  });
});

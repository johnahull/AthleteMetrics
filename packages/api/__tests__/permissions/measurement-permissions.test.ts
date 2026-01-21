/**
 * Unit tests for measurement-specific permission helpers
 *
 * Tests the complex authorization rules for measurements:
 * - Self-access patterns (athletes can only modify own measurements)
 * - Verified measurement restrictions
 * - Organization membership validation
 * - Cross-organization query permissions
 *
 * @see packages/api/permissions/measurement-helpers.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock storage before importing modules that use it
vi.mock('../../storage', () => ({
  storage: {
    getUserOrganizations: vi.fn(),
  },
}));

import { storage } from '../../storage';

// Import measurement permission helpers (will fail initially - TDD red phase)
import {
  canCreateMeasurementFor,
  canModifyMeasurement,
  canDeleteMeasurement,
  canVerifyMeasurement,
  canUseBatchEndpoint,
  canQueryCrossOrganization,
} from '../../permissions/measurement-helpers';

describe('Measurement Permission Helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('canCreateMeasurementFor', () => {
    it('should allow site admin to create measurement for anyone', async () => {
      const user = { id: 'admin-1', isSiteAdmin: true, role: 'site_admin' };
      const result = await canCreateMeasurementFor(user as any, 'target-user-id');
      expect(result.allowed).toBe(true);
    });

    it('should allow athlete to create measurement for themselves', async () => {
      const user = { id: 'athlete-1', isSiteAdmin: false, role: 'athlete' };
      const result = await canCreateMeasurementFor(user as any, 'athlete-1');
      expect(result.allowed).toBe(true);
    });

    it('should deny athlete from creating measurement for another user', async () => {
      const user = { id: 'athlete-1', isSiteAdmin: false, role: 'athlete' };
      const result = await canCreateMeasurementFor(user as any, 'other-user');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('only create measurements for themselves');
    });

    it('should allow coach to create measurement for user in same org', async () => {
      const user = { id: 'coach-1', isSiteAdmin: false, role: 'coach' };
      vi.mocked(storage.getUserOrganizations)
        .mockResolvedValueOnce([{ organizationId: 'org-1', role: 'coach' }] as any)
        .mockResolvedValueOnce([{ organizationId: 'org-1', role: 'athlete' }] as any);

      const result = await canCreateMeasurementFor(user as any, 'athlete-in-org');
      expect(result.allowed).toBe(true);
    });

    it('should deny coach from creating measurement for user in different org', async () => {
      const user = { id: 'coach-1', isSiteAdmin: false, role: 'coach' };
      vi.mocked(storage.getUserOrganizations)
        .mockResolvedValueOnce([{ organizationId: 'org-1', role: 'coach' }] as any)
        .mockResolvedValueOnce([{ organizationId: 'org-2', role: 'athlete' }] as any);

      const result = await canCreateMeasurementFor(user as any, 'athlete-other-org');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('organization');
    });
  });

  describe('canModifyMeasurement', () => {
    const unverifiedMeasurement = {
      id: 'meas-1',
      userId: 'athlete-1',
      submittedBy: 'coach-1',
      isVerified: false,
      organizationId: 'org-1',
    };

    const verifiedMeasurement = {
      ...unverifiedMeasurement,
      isVerified: true,
    };

    it('should allow site admin to modify any measurement', async () => {
      const user = { id: 'admin-1', isSiteAdmin: true, role: 'site_admin' };
      const result = await canModifyMeasurement(user as any, verifiedMeasurement as any);
      expect(result.allowed).toBe(true);
    });

    it('should allow athlete to modify their own unverified measurement', async () => {
      const user = { id: 'athlete-1', isSiteAdmin: false, role: 'athlete' };
      const result = await canModifyMeasurement(user as any, unverifiedMeasurement as any);
      expect(result.allowed).toBe(true);
    });

    it('should deny athlete from modifying verified measurement', async () => {
      const user = { id: 'athlete-1', isSiteAdmin: false, role: 'athlete' };
      const result = await canModifyMeasurement(user as any, verifiedMeasurement as any);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('verified');
    });

    it('should deny athlete from modifying another users measurement', async () => {
      const user = { id: 'athlete-2', isSiteAdmin: false, role: 'athlete' };
      const result = await canModifyMeasurement(user as any, unverifiedMeasurement as any);
      expect(result.allowed).toBe(false);
    });

    it('should allow coach to modify measurement in their org', async () => {
      const user = { id: 'coach-1', isSiteAdmin: false, role: 'coach' };
      vi.mocked(storage.getUserOrganizations).mockResolvedValue([
        { organizationId: 'org-1', role: 'coach' },
      ] as any);

      const result = await canModifyMeasurement(user as any, unverifiedMeasurement as any);
      expect(result.allowed).toBe(true);
    });

    it('should allow coach to modify verified measurement (coaches can)', async () => {
      const user = { id: 'coach-1', isSiteAdmin: false, role: 'coach' };
      vi.mocked(storage.getUserOrganizations).mockResolvedValue([
        { organizationId: 'org-1', role: 'coach' },
      ] as any);

      const result = await canModifyMeasurement(user as any, verifiedMeasurement as any);
      expect(result.allowed).toBe(true);
    });

    it('should deny coach from modifying measurement in different org', async () => {
      const user = { id: 'coach-2', isSiteAdmin: false, role: 'coach' };
      vi.mocked(storage.getUserOrganizations).mockResolvedValue([
        { organizationId: 'org-2', role: 'coach' },
      ] as any);

      // Use a measurement submitted by someone else (coach-1), not the current user (coach-2)
      const result = await canModifyMeasurement(user as any, unverifiedMeasurement as any);
      expect(result.allowed).toBe(false);
    });

    it('should allow submitter to modify their own submission', async () => {
      const user = { id: 'coach-1', isSiteAdmin: false, role: 'coach' };
      vi.mocked(storage.getUserOrganizations).mockResolvedValue([] as any);

      // Coach submitted this measurement (submittedBy matches user.id)
      const result = await canModifyMeasurement(user as any, unverifiedMeasurement as any);
      expect(result.allowed).toBe(true);
    });
  });

  describe('canDeleteMeasurement', () => {
    const unverifiedMeasurement = {
      id: 'meas-1',
      userId: 'athlete-1',
      submittedBy: 'athlete-1',
      isVerified: false,
      organizationId: 'org-1',
    };

    const verifiedMeasurement = {
      ...unverifiedMeasurement,
      isVerified: true,
    };

    it('should allow site admin to delete any measurement', async () => {
      const user = { id: 'admin-1', isSiteAdmin: true, role: 'site_admin' };
      const result = await canDeleteMeasurement(user as any, verifiedMeasurement as any);
      expect(result.allowed).toBe(true);
    });

    it('should allow athlete to delete their own unverified measurement', async () => {
      const user = { id: 'athlete-1', isSiteAdmin: false, role: 'athlete' };
      const result = await canDeleteMeasurement(user as any, unverifiedMeasurement as any);
      expect(result.allowed).toBe(true);
    });

    it('should deny athlete from deleting verified measurement', async () => {
      const user = { id: 'athlete-1', isSiteAdmin: false, role: 'athlete' };
      const result = await canDeleteMeasurement(user as any, verifiedMeasurement as any);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('verified');
    });

    it('should allow coach to delete measurement in their org', async () => {
      const user = { id: 'coach-1', isSiteAdmin: false, role: 'coach' };
      vi.mocked(storage.getUserOrganizations).mockResolvedValue([
        { organizationId: 'org-1', role: 'coach' },
      ] as any);

      const result = await canDeleteMeasurement(user as any, unverifiedMeasurement as any);
      expect(result.allowed).toBe(true);
    });
  });

  describe('canVerifyMeasurement', () => {
    const measurement = {
      id: 'meas-1',
      organizationId: 'org-1',
      isVerified: false,
    };

    it('should allow site admin to verify any measurement', async () => {
      const user = { id: 'admin-1', isSiteAdmin: true, role: 'site_admin' };
      const result = await canVerifyMeasurement(user as any, measurement as any);
      expect(result.allowed).toBe(true);
    });

    it('should deny athlete from verifying measurements', async () => {
      const user = { id: 'athlete-1', isSiteAdmin: false, role: 'athlete' };
      const result = await canVerifyMeasurement(user as any, measurement as any);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('cannot verify');
    });

    it('should allow coach to verify measurement in their org', async () => {
      const user = { id: 'coach-1', isSiteAdmin: false, role: 'coach' };
      vi.mocked(storage.getUserOrganizations).mockResolvedValue([
        { organizationId: 'org-1', role: 'coach' },
      ] as any);

      const result = await canVerifyMeasurement(user as any, measurement as any);
      expect(result.allowed).toBe(true);
    });

    it('should deny coach from verifying measurement in different org', async () => {
      const user = { id: 'coach-1', isSiteAdmin: false, role: 'coach' };
      vi.mocked(storage.getUserOrganizations).mockResolvedValue([
        { organizationId: 'org-2', role: 'coach' },
      ] as any);

      const result = await canVerifyMeasurement(user as any, measurement as any);
      expect(result.allowed).toBe(false);
    });

    it('should allow org_admin to verify measurement in their org', async () => {
      const user = { id: 'admin-1', isSiteAdmin: false, role: 'org_admin' };
      vi.mocked(storage.getUserOrganizations).mockResolvedValue([
        { organizationId: 'org-1', role: 'org_admin' },
      ] as any);

      const result = await canVerifyMeasurement(user as any, measurement as any);
      expect(result.allowed).toBe(true);
    });
  });

  describe('canUseBatchEndpoint', () => {
    it('should allow site admin to use batch endpoint', () => {
      const user = { id: 'admin-1', isSiteAdmin: true, role: 'site_admin' };
      const result = canUseBatchEndpoint(user as any);
      expect(result.allowed).toBe(true);
    });

    it('should allow coach to use batch endpoint', () => {
      const user = { id: 'coach-1', isSiteAdmin: false, role: 'coach' };
      const result = canUseBatchEndpoint(user as any);
      expect(result.allowed).toBe(true);
    });

    it('should allow org_admin to use batch endpoint', () => {
      const user = { id: 'admin-1', isSiteAdmin: false, role: 'org_admin' };
      const result = canUseBatchEndpoint(user as any);
      expect(result.allowed).toBe(true);
    });

    it('should deny athlete from using batch endpoint', () => {
      const user = { id: 'athlete-1', isSiteAdmin: false, role: 'athlete' };
      const result = canUseBatchEndpoint(user as any);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('cannot use batch');
    });

    it('should deny guest from using batch endpoint', () => {
      const user = { id: 'guest-1', isSiteAdmin: false, role: 'guest' };
      const result = canUseBatchEndpoint(user as any);
      expect(result.allowed).toBe(false);
    });
  });

  describe('canQueryCrossOrganization', () => {
    it('should allow site admin to query cross organization', () => {
      const user = { id: 'admin-1', isSiteAdmin: true, role: 'site_admin' };
      const result = canQueryCrossOrganization(user as any);
      expect(result).toBe(true);
    });

    it('should deny coach from querying cross organization', () => {
      const user = { id: 'coach-1', isSiteAdmin: false, role: 'coach' };
      const result = canQueryCrossOrganization(user as any);
      expect(result).toBe(false);
    });

    it('should deny org_admin from querying cross organization', () => {
      const user = { id: 'admin-1', isSiteAdmin: false, role: 'org_admin' };
      const result = canQueryCrossOrganization(user as any);
      expect(result).toBe(false);
    });

    it('should deny athlete from querying cross organization', () => {
      const user = { id: 'athlete-1', isSiteAdmin: false, role: 'athlete' };
      const result = canQueryCrossOrganization(user as any);
      expect(result).toBe(false);
    });
  });
});

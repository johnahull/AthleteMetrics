/**
 * Unit tests for RoleManager
 * Tests role-based middleware, permission checks, and role hierarchy validation
 *
 * @see packages/api/auth/role-manager.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Response, NextFunction } from 'express';
import { RoleManager } from '../auth/role-manager';
import { getRoleLevel } from '@shared/role-types';
import type { Role } from '@shared/role-types';

// Mock storage
vi.mock('../storage', () => ({
  storage: {
    getUserRole: vi.fn(),
    getUserOrganizations: vi.fn(),
    getUser: vi.fn(),
    updateUserRole: vi.fn(),
    getUserActivityStats: vi.fn(),
    getUsersByOrganization: vi.fn(),
  },
}));

// Mock AuthSecurity
vi.mock('../auth/security', () => ({
  AuthSecurity: {
    logSecurityEvent: vi.fn().mockResolvedValue(undefined),
  },
}));

import { AuthSecurity } from '../auth/security';

import { storage } from '../storage';

describe('RoleManager', () => {
  let mockReq: any;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    vi.clearAllMocks();

    mockReq = {
      params: {},
      session: {},
      user: null,
    };

    mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };

    mockNext = vi.fn();
  });

  describe('requireRole middleware', () => {
    describe('authentication checks', () => {
      it('should return 401 when user is not authenticated', async () => {
        mockReq.session = {};

        const middleware = RoleManager.requireRole('coach');
        await middleware(mockReq, mockRes as Response, mockNext);

        expect(mockRes.status).toHaveBeenCalledWith(401);
        expect(mockRes.json).toHaveBeenCalledWith({ message: 'Authentication required' });
        expect(mockNext).not.toHaveBeenCalled();
      });
    });

    describe('site admin bypass', () => {
      it('should allow site admin to access any role-protected route', async () => {
        mockReq.session = {
          user: {
            id: 'admin-user',
            isSiteAdmin: true,
            primaryOrganizationId: 'org-123',
          },
        };

        const middleware = RoleManager.requireRole('org_admin');
        await middleware(mockReq, mockRes as Response, mockNext);

        expect(mockNext).toHaveBeenCalled();
        expect(mockReq.userRole).toBe('site_admin');
        expect(storage.getUserRole).not.toHaveBeenCalled();
      });
    });

    describe('role level comparison - THE BUG FIX', () => {
      /**
       * This is the critical test case.
       *
       * BUG: The original implementation used canManageRole(userRole, minRole)
       * which checks if userRole > minRole (strictly greater).
       *
       * FIX: Should use getRoleLevel(userRole) >= getRoleLevel(minRole)
       * to allow users with the SAME role level to pass.
       *
       * Example: A coach (level 60) should be able to access routes
       * protected by requireRole('coach').
       */
      it('should allow coach to access coach-required route (same role level)', async () => {
        mockReq.session = {
          user: {
            id: 'coach-user',
            isSiteAdmin: false,
            primaryOrganizationId: 'org-123',
          },
        };
        mockReq.params = { organizationId: 'org-123' };

        vi.mocked(storage.getUserRole).mockResolvedValue('coach');

        const middleware = RoleManager.requireRole('coach');
        await middleware(mockReq, mockRes as Response, mockNext);

        expect(mockNext).toHaveBeenCalled();
        expect(mockReq.userRole).toBe('coach');
      });

      it('should allow org_admin to access coach-required route (higher role level)', async () => {
        mockReq.session = {
          user: {
            id: 'admin-user',
            isSiteAdmin: false,
            primaryOrganizationId: 'org-123',
          },
        };
        mockReq.params = { organizationId: 'org-123' };

        vi.mocked(storage.getUserRole).mockResolvedValue('org_admin');

        const middleware = RoleManager.requireRole('coach');
        await middleware(mockReq, mockRes as Response, mockNext);

        expect(mockNext).toHaveBeenCalled();
        expect(mockReq.userRole).toBe('org_admin');
      });

      it('should deny athlete access to coach-required route (lower role level)', async () => {
        mockReq.session = {
          user: {
            id: 'athlete-user',
            isSiteAdmin: false,
            primaryOrganizationId: 'org-123',
          },
        };
        mockReq.params = { organizationId: 'org-123' };

        vi.mocked(storage.getUserRole).mockResolvedValue('athlete');

        const middleware = RoleManager.requireRole('coach');
        await middleware(mockReq, mockRes as Response, mockNext);

        expect(mockRes.status).toHaveBeenCalledWith(403);
        expect(mockRes.json).toHaveBeenCalledWith(
          expect.objectContaining({
            message: 'coach role or higher required',
            userRole: 'athlete',
            requiredRole: 'coach',
          })
        );
        expect(mockNext).not.toHaveBeenCalled();
      });

      it('should deny guest access to athlete-required route (lower role level)', async () => {
        mockReq.session = {
          user: {
            id: 'guest-user',
            isSiteAdmin: false,
            primaryOrganizationId: 'org-123',
          },
        };
        mockReq.params = { organizationId: 'org-123' };

        vi.mocked(storage.getUserRole).mockResolvedValue('guest');

        const middleware = RoleManager.requireRole('athlete');
        await middleware(mockReq, mockRes as Response, mockNext);

        expect(mockRes.status).toHaveBeenCalledWith(403);
        expect(mockNext).not.toHaveBeenCalled();
      });

      it('should allow org_admin to access org_admin-required route (exact match)', async () => {
        mockReq.session = {
          user: {
            id: 'admin-user',
            isSiteAdmin: false,
            primaryOrganizationId: 'org-123',
          },
        };
        mockReq.params = { organizationId: 'org-123' };

        vi.mocked(storage.getUserRole).mockResolvedValue('org_admin');

        const middleware = RoleManager.requireRole('org_admin');
        await middleware(mockReq, mockRes as Response, mockNext);

        expect(mockNext).toHaveBeenCalled();
        expect(mockReq.userRole).toBe('org_admin');
      });
    });

    describe('organization context', () => {
      it('should use organizationId from params when available', async () => {
        mockReq.session = {
          user: {
            id: 'coach-user',
            isSiteAdmin: false,
            primaryOrganizationId: 'primary-org',
          },
        };
        mockReq.params = { organizationId: 'param-org' };

        vi.mocked(storage.getUserRole).mockResolvedValue('coach');

        const middleware = RoleManager.requireRole('coach');
        await middleware(mockReq, mockRes as Response, mockNext);

        expect(storage.getUserRole).toHaveBeenCalledWith('coach-user', 'param-org');
        expect(mockReq.organizationId).toBe('param-org');
      });

      it('should fall back to primaryOrganizationId when param not available', async () => {
        mockReq.session = {
          user: {
            id: 'coach-user',
            isSiteAdmin: false,
            primaryOrganizationId: 'primary-org',
          },
        };
        mockReq.params = {};

        vi.mocked(storage.getUserRole).mockResolvedValue('coach');

        const middleware = RoleManager.requireRole('coach');
        await middleware(mockReq, mockRes as Response, mockNext);

        expect(storage.getUserRole).toHaveBeenCalledWith('coach-user', 'primary-org');
        expect(mockReq.organizationId).toBe('primary-org');
      });

      it('should return 400 when no organization context is available', async () => {
        mockReq.session = {
          user: {
            id: 'coach-user',
            isSiteAdmin: false,
            // No primaryOrganizationId
          },
        };
        mockReq.params = {};

        const middleware = RoleManager.requireRole('coach');
        await middleware(mockReq, mockRes as Response, mockNext);

        expect(mockRes.status).toHaveBeenCalledWith(400);
        expect(mockRes.json).toHaveBeenCalledWith({ message: 'Organization context required' });
        expect(mockNext).not.toHaveBeenCalled();
      });
    });

    describe('user not in organization', () => {
      it('should return 403 when user has no role in the organization', async () => {
        mockReq.session = {
          user: {
            id: 'user-without-role',
            isSiteAdmin: false,
            primaryOrganizationId: 'org-123',
          },
        };
        mockReq.params = { organizationId: 'org-123' };

        vi.mocked(storage.getUserRole).mockResolvedValue(null);

        const middleware = RoleManager.requireRole('coach');
        await middleware(mockReq, mockRes as Response, mockNext);

        expect(mockRes.status).toHaveBeenCalledWith(403);
        expect(mockRes.json).toHaveBeenCalledWith({
          message: 'coach role or higher required',
          requiredRole: 'coach',
        });
        expect(mockNext).not.toHaveBeenCalled();
      });
    });
  });

  describe('role hierarchy validation', () => {
    it('should correctly identify role levels', () => {
      // Verify the role hierarchy is as expected
      expect(getRoleLevel('site_admin')).toBe(100);
      expect(getRoleLevel('org_admin')).toBe(80);
      expect(getRoleLevel('coach')).toBe(60);
      expect(getRoleLevel('athlete')).toBe(40);
      expect(getRoleLevel('guest')).toBe(20);

      // Verify ordering
      expect(getRoleLevel('site_admin')).toBeGreaterThan(getRoleLevel('org_admin'));
      expect(getRoleLevel('org_admin')).toBeGreaterThan(getRoleLevel('coach'));
      expect(getRoleLevel('coach')).toBeGreaterThan(getRoleLevel('athlete'));
      expect(getRoleLevel('athlete')).toBeGreaterThan(getRoleLevel('guest'));
    });
  });

  describe('assignRole', () => {
    beforeEach(() => {
      vi.mocked(storage.updateUserRole).mockResolvedValue(true);
    });

    describe('security event logging', () => {
      it('should log role_change event when assigning a new role', async () => {
        vi.mocked(storage.getUserRole)
          .mockResolvedValueOnce('org_admin')  // assigner's role
          .mockResolvedValueOnce(null);        // target has no current role

        const result = await RoleManager.assignRole(
          'assigner-123',
          'target-456',
          'athlete',
          'org-789',
          '192.168.1.1'
        );

        expect(result.success).toBe(true);
        expect(AuthSecurity.logSecurityEvent).toHaveBeenCalledWith(
          expect.objectContaining({
            userId: 'target-456',
            eventType: 'role_change',
            severity: 'info',
            ipAddress: '192.168.1.1',
          })
        );
      });

      it('should log permission_escalation event when upgrading role', async () => {
        vi.mocked(storage.getUserRole)
          .mockResolvedValueOnce('org_admin')  // assigner's role
          .mockResolvedValueOnce('athlete');    // target's current role

        const result = await RoleManager.assignRole(
          'assigner-123',
          'target-456',
          'coach',  // Upgrading from athlete to coach
          'org-789',
          '192.168.1.1'
        );

        expect(result.success).toBe(true);
        expect(AuthSecurity.logSecurityEvent).toHaveBeenCalledWith(
          expect.objectContaining({
            userId: 'target-456',
            eventType: 'permission_escalation',
            severity: 'warning',
          })
        );
      });

      it('should log role_change with info severity when demoting role', async () => {
        vi.mocked(storage.getUserRole)
          .mockResolvedValueOnce('org_admin')  // assigner's role
          .mockResolvedValueOnce('coach');      // target's current role

        const result = await RoleManager.assignRole(
          'assigner-123',
          'target-456',
          'athlete',  // Demoting from coach to athlete
          'org-789',
          '192.168.1.1'
        );

        expect(result.success).toBe(true);
        expect(AuthSecurity.logSecurityEvent).toHaveBeenCalledWith(
          expect.objectContaining({
            eventType: 'role_change',
            severity: 'info',
          })
        );
      });

      it('should include assigner info and role details in event data', async () => {
        vi.mocked(storage.getUserRole)
          .mockResolvedValueOnce('org_admin')
          .mockResolvedValueOnce('athlete');

        await RoleManager.assignRole(
          'assigner-123',
          'target-456',
          'coach',
          'org-789',
          '192.168.1.1'
        );

        expect(AuthSecurity.logSecurityEvent).toHaveBeenCalledWith(
          expect.objectContaining({
            eventData: expect.stringContaining('"assignerId":"assigner-123"'),
          })
        );
        expect(AuthSecurity.logSecurityEvent).toHaveBeenCalledWith(
          expect.objectContaining({
            eventData: expect.stringContaining('"oldRole":"athlete"'),
          })
        );
        expect(AuthSecurity.logSecurityEvent).toHaveBeenCalledWith(
          expect.objectContaining({
            eventData: expect.stringContaining('"newRole":"coach"'),
          })
        );
      });
    });
  });
});

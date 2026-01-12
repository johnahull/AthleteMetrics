/**
 * Unit tests for unified permission middleware
 *
 * Tests the consolidated RBAC middleware layer that replaces:
 * - RoleManager.requirePermission()
 * - RoleManager.requireRole()
 * - requireOrganizationAccess()
 * - Inline role checks
 *
 * @see packages/api/permissions/middleware.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Response, NextFunction } from 'express';

// Mock storage before importing modules that use it
vi.mock('../../storage', () => ({
  storage: {
    getUserRole: vi.fn(),
    getUserOrganizations: vi.fn(),
    getUser: vi.fn(),
    getTeam: vi.fn(),
  },
}));

import { storage } from '../../storage';

// Import the permission module
import {
  requirePermission,
  requireRole,
  requireOrgAccess,
  requireResourceAccess,
} from '../../permissions/index';

describe('Permission Middleware', () => {
  let mockReq: any;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    vi.clearAllMocks();

    mockReq = {
      params: {},
      query: {},
      body: {},
      session: {},
      user: null,
    };

    mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };

    mockNext = vi.fn();
  });

  // ============================================================
  // requirePermission() Tests
  // ============================================================
  describe('requirePermission', () => {
    describe('authentication', () => {
      it('should return 401 when user is not authenticated', async () => {
        mockReq.session = {};

        const middleware = requirePermission('CREATE_TEAM');
        await middleware(mockReq, mockRes as Response, mockNext);

        expect(mockRes.status).toHaveBeenCalledWith(401);
        expect(mockRes.json).toHaveBeenCalledWith({ message: 'Authentication required' });
        expect(mockNext).not.toHaveBeenCalled();
      });
    });

    describe('site admin bypass', () => {
      it('should allow site admin for any permission', async () => {
        mockReq.session = {
          user: { id: 'admin-1', isSiteAdmin: true },
        };

        const middleware = requirePermission('CREATE_ORGANIZATION');
        await middleware(mockReq, mockRes as Response, mockNext);

        expect(mockNext).toHaveBeenCalled();
        expect(storage.getUserRole).not.toHaveBeenCalled();
      });
    });

    describe('permission checking', () => {
      it('should allow org_admin to CREATE_TEAM', async () => {
        mockReq.session = {
          user: { id: 'user-1', isSiteAdmin: false, primaryOrganizationId: 'org-1' },
        };
        mockReq.params = { organizationId: 'org-1' };
        vi.mocked(storage.getUserRole).mockResolvedValue('org_admin');

        const middleware = requirePermission('CREATE_TEAM');
        await middleware(mockReq, mockRes as Response, mockNext);

        expect(mockNext).toHaveBeenCalled();
      });

      it('should allow coach to CREATE_TEAM', async () => {
        mockReq.session = {
          user: { id: 'user-1', isSiteAdmin: false, primaryOrganizationId: 'org-1' },
        };
        mockReq.params = { organizationId: 'org-1' };
        vi.mocked(storage.getUserRole).mockResolvedValue('coach');

        const middleware = requirePermission('CREATE_TEAM');
        await middleware(mockReq, mockRes as Response, mockNext);

        expect(mockNext).toHaveBeenCalled();
      });

      it('should deny athlete for CREATE_TEAM', async () => {
        mockReq.session = {
          user: { id: 'user-1', isSiteAdmin: false, primaryOrganizationId: 'org-1' },
        };
        mockReq.params = { organizationId: 'org-1' };
        vi.mocked(storage.getUserRole).mockResolvedValue('athlete');

        const middleware = requirePermission('CREATE_TEAM');
        await middleware(mockReq, mockRes as Response, mockNext);

        expect(mockRes.status).toHaveBeenCalledWith(403);
        expect(mockNext).not.toHaveBeenCalled();
      });

      it('should deny guest for CREATE_TEAM', async () => {
        mockReq.session = {
          user: { id: 'user-1', isSiteAdmin: false, primaryOrganizationId: 'org-1' },
        };
        mockReq.params = { organizationId: 'org-1' };
        vi.mocked(storage.getUserRole).mockResolvedValue('guest');

        const middleware = requirePermission('CREATE_TEAM');
        await middleware(mockReq, mockRes as Response, mockNext);

        expect(mockRes.status).toHaveBeenCalledWith(403);
        expect(mockNext).not.toHaveBeenCalled();
      });

      it('should only allow site_admin for CREATE_ORGANIZATION', async () => {
        mockReq.session = {
          user: { id: 'user-1', isSiteAdmin: false, primaryOrganizationId: 'org-1' },
        };
        mockReq.params = { organizationId: 'org-1' };
        vi.mocked(storage.getUserRole).mockResolvedValue('org_admin');

        const middleware = requirePermission('CREATE_ORGANIZATION');
        await middleware(mockReq, mockRes as Response, mockNext);

        expect(mockRes.status).toHaveBeenCalledWith(403);
        expect(mockNext).not.toHaveBeenCalled();
      });
    });
  });

  // ============================================================
  // requireRole() Tests
  // ============================================================
  describe('requireRole', () => {
    describe('authentication', () => {
      it('should return 401 when user is not authenticated', async () => {
        mockReq.session = {};

        const middleware = requireRole('coach');
        await middleware(mockReq, mockRes as Response, mockNext);

        expect(mockRes.status).toHaveBeenCalledWith(401);
        expect(mockNext).not.toHaveBeenCalled();
      });
    });

    describe('site admin bypass', () => {
      it('should allow site admin for any role requirement', async () => {
        mockReq.session = {
          user: { id: 'admin-1', isSiteAdmin: true },
        };

        const middleware = requireRole('org_admin');
        await middleware(mockReq, mockRes as Response, mockNext);

        expect(mockNext).toHaveBeenCalled();
        expect(mockReq.userRole).toBe('site_admin');
      });
    });

    describe('role level comparison', () => {
      it('should allow coach for coach-required route (exact match)', async () => {
        mockReq.session = {
          user: { id: 'user-1', isSiteAdmin: false, primaryOrganizationId: 'org-1' },
        };
        mockReq.params = { organizationId: 'org-1' };
        vi.mocked(storage.getUserRole).mockResolvedValue('coach');

        const middleware = requireRole('coach');
        await middleware(mockReq, mockRes as Response, mockNext);

        expect(mockNext).toHaveBeenCalled();
        expect(mockReq.userRole).toBe('coach');
      });

      it('should allow org_admin for coach-required route (higher level)', async () => {
        mockReq.session = {
          user: { id: 'user-1', isSiteAdmin: false, primaryOrganizationId: 'org-1' },
        };
        mockReq.params = { organizationId: 'org-1' };
        vi.mocked(storage.getUserRole).mockResolvedValue('org_admin');

        const middleware = requireRole('coach');
        await middleware(mockReq, mockRes as Response, mockNext);

        expect(mockNext).toHaveBeenCalled();
        expect(mockReq.userRole).toBe('org_admin');
      });

      it('should deny athlete for coach-required route (lower level)', async () => {
        mockReq.session = {
          user: { id: 'user-1', isSiteAdmin: false, primaryOrganizationId: 'org-1' },
        };
        mockReq.params = { organizationId: 'org-1' };
        vi.mocked(storage.getUserRole).mockResolvedValue('athlete');

        const middleware = requireRole('coach');
        await middleware(mockReq, mockRes as Response, mockNext);

        expect(mockRes.status).toHaveBeenCalledWith(403);
        expect(mockNext).not.toHaveBeenCalled();
      });
    });

    describe('organization context', () => {
      it('should return 400 when no organization context available', async () => {
        mockReq.session = {
          user: { id: 'user-1', isSiteAdmin: false },
        };
        mockReq.params = {};

        const middleware = requireRole('coach');
        await middleware(mockReq, mockRes as Response, mockNext);

        expect(mockRes.status).toHaveBeenCalledWith(400);
        expect(mockRes.json).toHaveBeenCalledWith({ message: 'Organization context required' });
      });

      it('should use organizationId from params', async () => {
        mockReq.session = {
          user: { id: 'user-1', isSiteAdmin: false, primaryOrganizationId: 'primary-org' },
        };
        mockReq.params = { organizationId: 'param-org' };
        vi.mocked(storage.getUserRole).mockResolvedValue('coach');

        const middleware = requireRole('coach');
        await middleware(mockReq, mockRes as Response, mockNext);

        expect(storage.getUserRole).toHaveBeenCalledWith('user-1', 'param-org');
        expect(mockReq.organizationId).toBe('param-org');
      });

      it('should fall back to primaryOrganizationId', async () => {
        mockReq.session = {
          user: { id: 'user-1', isSiteAdmin: false, primaryOrganizationId: 'primary-org' },
        };
        mockReq.params = {};
        vi.mocked(storage.getUserRole).mockResolvedValue('coach');

        const middleware = requireRole('coach');
        await middleware(mockReq, mockRes as Response, mockNext);

        expect(storage.getUserRole).toHaveBeenCalledWith('user-1', 'primary-org');
        expect(mockReq.organizationId).toBe('primary-org');
      });
    });
  });

  // ============================================================
  // requireOrgAccess() Tests
  // ============================================================
  describe('requireOrgAccess', () => {
    describe('authentication', () => {
      it('should return 401 when user is not authenticated', async () => {
        mockReq.session = {};
        mockReq.params = { organizationId: 'org-1' };

        const middleware = requireOrgAccess();
        await middleware(mockReq, mockRes as Response, mockNext);

        expect(mockRes.status).toHaveBeenCalledWith(401);
        expect(mockNext).not.toHaveBeenCalled();
      });
    });

    describe('site admin bypass', () => {
      it('should allow site admin access to any organization', async () => {
        mockReq.session = {
          user: { id: 'admin-1', isSiteAdmin: true },
        };
        mockReq.params = { organizationId: 'any-org' };

        const middleware = requireOrgAccess();
        await middleware(mockReq, mockRes as Response, mockNext);

        expect(mockNext).toHaveBeenCalled();
        expect(storage.getUserOrganizations).not.toHaveBeenCalled();
      });
    });

    describe('organization membership', () => {
      it('should allow user who is member of organization', async () => {
        mockReq.session = {
          user: { id: 'user-1', isSiteAdmin: false },
        };
        mockReq.params = { organizationId: 'org-1' };
        vi.mocked(storage.getUserOrganizations).mockResolvedValue([
          { organizationId: 'org-1', role: 'coach' },
          { organizationId: 'org-2', role: 'athlete' },
        ]);

        const middleware = requireOrgAccess();
        await middleware(mockReq, mockRes as Response, mockNext);

        expect(mockNext).toHaveBeenCalled();
      });

      it('should deny user who is not member of organization', async () => {
        mockReq.session = {
          user: { id: 'user-1', isSiteAdmin: false },
        };
        mockReq.params = { organizationId: 'org-3' };
        vi.mocked(storage.getUserOrganizations).mockResolvedValue([
          { organizationId: 'org-1', role: 'coach' },
          { organizationId: 'org-2', role: 'athlete' },
        ]);

        const middleware = requireOrgAccess();
        await middleware(mockReq, mockRes as Response, mockNext);

        expect(mockRes.status).toHaveBeenCalledWith(403);
        expect(mockNext).not.toHaveBeenCalled();
      });

      it('should return 400 when organizationId is missing', async () => {
        mockReq.session = {
          user: { id: 'user-1', isSiteAdmin: false },
        };
        mockReq.params = {};

        const middleware = requireOrgAccess();
        await middleware(mockReq, mockRes as Response, mockNext);

        expect(mockRes.status).toHaveBeenCalledWith(400);
        expect(mockRes.json).toHaveBeenCalledWith({ message: 'Organization ID required' });
      });
    });

    describe('role requirement option', () => {
      it('should check specific role when option provided', async () => {
        mockReq.session = {
          user: { id: 'user-1', isSiteAdmin: false },
        };
        mockReq.params = { organizationId: 'org-1' };
        vi.mocked(storage.getUserOrganizations).mockResolvedValue([
          { organizationId: 'org-1', role: 'athlete' },
        ]);

        const middleware = requireOrgAccess({ role: 'coach' });
        await middleware(mockReq, mockRes as Response, mockNext);

        expect(mockRes.status).toHaveBeenCalledWith(403);
        expect(mockNext).not.toHaveBeenCalled();
      });

      it('should allow when user has required role', async () => {
        mockReq.session = {
          user: { id: 'user-1', isSiteAdmin: false },
        };
        mockReq.params = { organizationId: 'org-1' };
        vi.mocked(storage.getUserOrganizations).mockResolvedValue([
          { organizationId: 'org-1', role: 'coach' },
        ]);

        const middleware = requireOrgAccess({ role: 'coach' });
        await middleware(mockReq, mockRes as Response, mockNext);

        expect(mockNext).toHaveBeenCalled();
      });

      it('should allow org_admin when coach role required', async () => {
        mockReq.session = {
          user: { id: 'user-1', isSiteAdmin: false },
        };
        mockReq.params = { organizationId: 'org-1' };
        vi.mocked(storage.getUserOrganizations).mockResolvedValue([
          { organizationId: 'org-1', role: 'org_admin' },
        ]);

        const middleware = requireOrgAccess({ role: 'coach' });
        await middleware(mockReq, mockRes as Response, mockNext);

        expect(mockNext).toHaveBeenCalled();
      });
    });
  });

  // ============================================================
  // requireResourceAccess() Tests
  // ============================================================
  describe('requireResourceAccess', () => {
    describe('team resource', () => {
      it('should allow coach to create team', async () => {
        mockReq.session = {
          user: { id: 'user-1', isSiteAdmin: false, primaryOrganizationId: 'org-1' },
        };
        mockReq.params = { organizationId: 'org-1' };
        vi.mocked(storage.getUserRole).mockResolvedValue('coach');

        const middleware = requireResourceAccess('team', 'create');
        await middleware(mockReq, mockRes as Response, mockNext);

        expect(mockNext).toHaveBeenCalled();
      });

      it('should deny athlete from creating team', async () => {
        mockReq.session = {
          user: { id: 'user-1', isSiteAdmin: false, primaryOrganizationId: 'org-1' },
        };
        mockReq.params = { organizationId: 'org-1' };
        vi.mocked(storage.getUserRole).mockResolvedValue('athlete');

        const middleware = requireResourceAccess('team', 'create');
        await middleware(mockReq, mockRes as Response, mockNext);

        expect(mockRes.status).toHaveBeenCalledWith(403);
        expect(mockNext).not.toHaveBeenCalled();
      });

      it('should allow athlete to read team', async () => {
        mockReq.session = {
          user: { id: 'user-1', isSiteAdmin: false, primaryOrganizationId: 'org-1' },
        };
        mockReq.params = { organizationId: 'org-1' };
        vi.mocked(storage.getUserRole).mockResolvedValue('athlete');

        const middleware = requireResourceAccess('team', 'read');
        await middleware(mockReq, mockRes as Response, mockNext);

        expect(mockNext).toHaveBeenCalled();
      });

      it('should deny athlete from deleting team', async () => {
        mockReq.session = {
          user: { id: 'user-1', isSiteAdmin: false, primaryOrganizationId: 'org-1' },
        };
        mockReq.params = { organizationId: 'org-1' };
        vi.mocked(storage.getUserRole).mockResolvedValue('athlete');

        const middleware = requireResourceAccess('team', 'delete');
        await middleware(mockReq, mockRes as Response, mockNext);

        expect(mockRes.status).toHaveBeenCalledWith(403);
        expect(mockNext).not.toHaveBeenCalled();
      });
    });

    describe('measurement resource', () => {
      it('should allow coach to create measurement', async () => {
        mockReq.session = {
          user: { id: 'user-1', isSiteAdmin: false, primaryOrganizationId: 'org-1' },
        };
        mockReq.params = { organizationId: 'org-1' };
        vi.mocked(storage.getUserRole).mockResolvedValue('coach');

        const middleware = requireResourceAccess('measurement', 'create');
        await middleware(mockReq, mockRes as Response, mockNext);

        expect(mockNext).toHaveBeenCalled();
      });

      it('should allow coach to verify measurement', async () => {
        mockReq.session = {
          user: { id: 'user-1', isSiteAdmin: false, primaryOrganizationId: 'org-1' },
        };
        mockReq.params = { organizationId: 'org-1' };
        vi.mocked(storage.getUserRole).mockResolvedValue('coach');

        const middleware = requireResourceAccess('measurement', 'verify');
        await middleware(mockReq, mockRes as Response, mockNext);

        expect(mockNext).toHaveBeenCalled();
      });

      it('should deny athlete from verifying measurement', async () => {
        mockReq.session = {
          user: { id: 'user-1', isSiteAdmin: false, primaryOrganizationId: 'org-1' },
        };
        mockReq.params = { organizationId: 'org-1' };
        vi.mocked(storage.getUserRole).mockResolvedValue('athlete');

        const middleware = requireResourceAccess('measurement', 'verify');
        await middleware(mockReq, mockRes as Response, mockNext);

        expect(mockRes.status).toHaveBeenCalledWith(403);
        expect(mockNext).not.toHaveBeenCalled();
      });
    });

    describe('organization resource', () => {
      it('should only allow site_admin to create organization', async () => {
        mockReq.session = {
          user: { id: 'user-1', isSiteAdmin: false, primaryOrganizationId: 'org-1' },
        };
        mockReq.params = { organizationId: 'org-1' };
        vi.mocked(storage.getUserRole).mockResolvedValue('org_admin');

        const middleware = requireResourceAccess('organization', 'create');
        await middleware(mockReq, mockRes as Response, mockNext);

        expect(mockRes.status).toHaveBeenCalledWith(403);
        expect(mockNext).not.toHaveBeenCalled();
      });

      it('should allow site_admin to create organization', async () => {
        mockReq.session = {
          user: { id: 'admin-1', isSiteAdmin: true },
        };

        const middleware = requireResourceAccess('organization', 'create');
        await middleware(mockReq, mockRes as Response, mockNext);

        expect(mockNext).toHaveBeenCalled();
      });
    });
  });
});

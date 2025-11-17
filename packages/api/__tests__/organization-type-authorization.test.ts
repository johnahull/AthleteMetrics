/**
 * Unit tests for organization type authorization middleware
 * Tests the verifyOrganizationTypeAccess middleware and authorization edge cases
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Response, NextFunction } from 'express';
import {
  verifyOrganizationTypeAccess,
  authorizeOrganizationTypeAccess,
  OrganizationTypeError,
  OrganizationTypeErrorType,
  type OrganizationTypeRequest,
} from '../middleware/organization-type-middleware';

describe('Organization Type Authorization Middleware', () => {
  let mockReq: Partial<OrganizationTypeRequest>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;
  let mockStorage: any;

  beforeEach(() => {
    mockReq = {
      params: {},
      session: {},
    };
    mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };
    mockNext = vi.fn();
    mockStorage = {
      getUserOrganizations: vi.fn(),
    };
  });

  describe('verifyOrganizationTypeAccess', () => {
    it('should allow site admins to access any organization type', async () => {
      mockReq.session = {
        user: {
          id: 'admin-user-id',
          isSiteAdmin: true,
        },
      } as any;
      mockReq.params = { orgType: 'college' };

      const middleware = verifyOrganizationTypeAccess(mockStorage);
      await middleware(mockReq as OrganizationTypeRequest, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith();
      expect(mockStorage.getUserOrganizations).not.toHaveBeenCalled();
    });

    it('should allow users to access organization types they belong to', async () => {
      mockReq.session = {
        user: {
          id: 'regular-user-id',
          isSiteAdmin: false,
        },
      } as any;
      mockReq.params = { orgType: 'college' };

      mockStorage.getUserOrganizations.mockResolvedValue([
        {
          organization: { orgType: 'college' },
        },
        {
          organization: { orgType: 'high_school' },
        },
      ]);

      const middleware = verifyOrganizationTypeAccess(mockStorage);
      await middleware(mockReq as OrganizationTypeRequest, mockRes as Response, mockNext);

      expect(mockStorage.getUserOrganizations).toHaveBeenCalledWith('regular-user-id');
      expect(mockNext).toHaveBeenCalledWith();
    });

    it('should deny users access to organization types they do not belong to', async () => {
      mockReq.session = {
        user: {
          id: 'regular-user-id',
          isSiteAdmin: false,
        },
      } as any;
      mockReq.params = { orgType: 'elite_academy' };

      mockStorage.getUserOrganizations.mockResolvedValue([
        {
          organization: { orgType: 'college' },
        },
        {
          organization: { orgType: 'high_school' },
        },
      ]);

      const middleware = verifyOrganizationTypeAccess(mockStorage);
      await middleware(mockReq as OrganizationTypeRequest, mockRes as Response, mockNext);

      expect(mockStorage.getUserOrganizations).toHaveBeenCalledWith('regular-user-id');
      expect(mockNext).toHaveBeenCalledWith(expect.any(OrganizationTypeError));

      const error = (mockNext as any).mock.calls[0][0];
      expect(error.type).toBe(OrganizationTypeErrorType.UNAUTHORIZED_TYPE_ACCESS);
      expect(error.statusCode).toBe(403);
      expect(error.message).toContain("You don't have access to resources");
    });

    it('should return 401 if user is not authenticated', async () => {
      mockReq.session = {} as any;
      mockReq.params = { orgType: 'college' };

      const middleware = verifyOrganizationTypeAccess(mockStorage);
      await middleware(mockReq as OrganizationTypeRequest, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(OrganizationTypeError));

      const error = (mockNext as any).mock.calls[0][0];
      expect(error.statusCode).toBe(401);
      expect(error.message).toBe('Authentication required');
    });

    it('should handle users with no organizations gracefully', async () => {
      mockReq.session = {
        user: {
          id: 'new-user-id',
          isSiteAdmin: false,
        },
      } as any;
      mockReq.params = { orgType: 'college' };

      mockStorage.getUserOrganizations.mockResolvedValue([]);

      const middleware = verifyOrganizationTypeAccess(mockStorage);
      await middleware(mockReq as OrganizationTypeRequest, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(OrganizationTypeError));

      const error = (mockNext as any).mock.calls[0][0];
      expect(error.statusCode).toBe(403);
    });

    it('should handle organizations with null orgType', async () => {
      mockReq.session = {
        user: {
          id: 'regular-user-id',
          isSiteAdmin: false,
        },
      } as any;
      mockReq.params = { orgType: 'college' };

      mockStorage.getUserOrganizations.mockResolvedValue([
        {
          organization: { orgType: null }, // Organization without org type
        },
        {
          organization: { orgType: 'college' },
        },
      ]);

      const middleware = verifyOrganizationTypeAccess(mockStorage);
      await middleware(mockReq as OrganizationTypeRequest, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith();
    });

    it('should proceed if no orgType parameter is present', async () => {
      mockReq.session = {
        user: {
          id: 'regular-user-id',
          isSiteAdmin: false,
        },
      } as any;
      mockReq.params = {}; // No orgType parameter

      const middleware = verifyOrganizationTypeAccess(mockStorage);
      await middleware(mockReq as OrganizationTypeRequest, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith();
      expect(mockStorage.getUserOrganizations).not.toHaveBeenCalled();
    });

    it('should handle database errors gracefully', async () => {
      mockReq.session = {
        user: {
          id: 'regular-user-id',
          isSiteAdmin: false,
        },
      } as any;
      mockReq.params = { orgType: 'college' };

      const dbError = new Error('Database connection failed');
      mockStorage.getUserOrganizations.mockRejectedValue(dbError);

      const middleware = verifyOrganizationTypeAccess(mockStorage);
      await middleware(mockReq as OrganizationTypeRequest, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(dbError);
    });

    it('should handle multiple organizations of same type correctly', async () => {
      mockReq.session = {
        user: {
          id: 'regular-user-id',
          isSiteAdmin: false,
        },
      } as any;
      mockReq.params = { orgType: 'club' };

      // User belongs to multiple club organizations
      mockStorage.getUserOrganizations.mockResolvedValue([
        {
          organization: { orgType: 'club' },
        },
        {
          organization: { orgType: 'club' },
        },
        {
          organization: { orgType: 'club' },
        },
      ]);

      const middleware = verifyOrganizationTypeAccess(mockStorage);
      await middleware(mockReq as OrganizationTypeRequest, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith();
    });
  });

  describe('authorizeOrganizationTypeAccess', () => {
    it('should allow site admins regardless of role restrictions', async () => {
      mockReq.session = {
        user: {
          id: 'admin-user-id',
          isSiteAdmin: true,
          role: 'athlete', // Even with athlete role, admin should pass
        },
      } as any;

      const middleware = authorizeOrganizationTypeAccess(['site_admin', 'coach']);
      await middleware(mockReq as OrganizationTypeRequest, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith();
    });

    it('should allow users with correct role', async () => {
      mockReq.session = {
        user: {
          id: 'coach-user-id',
          isSiteAdmin: false,
          role: 'coach',
        },
      } as any;

      const middleware = authorizeOrganizationTypeAccess(['site_admin', 'coach']);
      await middleware(mockReq as OrganizationTypeRequest, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith();
    });

    it('should deny users without correct role', async () => {
      mockReq.session = {
        user: {
          id: 'athlete-user-id',
          isSiteAdmin: false,
          role: 'athlete',
        },
      } as any;

      const middleware = authorizeOrganizationTypeAccess(['site_admin', 'coach']);
      await middleware(mockReq as OrganizationTypeRequest, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(OrganizationTypeError));

      const error = (mockNext as any).mock.calls[0][0];
      expect(error.statusCode).toBe(403);
      expect(error.message).toContain('Access denied');
    });

    it('should default to athlete role if role is not set', async () => {
      mockReq.session = {
        user: {
          id: 'user-no-role',
          isSiteAdmin: false,
          // No role property
        },
      } as any;

      const middleware = authorizeOrganizationTypeAccess(['site_admin', 'coach']);
      await middleware(mockReq as OrganizationTypeRequest, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(OrganizationTypeError));

      const error = (mockNext as any).mock.calls[0][0];
      expect(error.details?.userRole).toBe('athlete');
    });

    it('should return 401 if user is not authenticated', async () => {
      mockReq.session = {} as any;

      const middleware = authorizeOrganizationTypeAccess(['site_admin', 'coach']);
      await middleware(mockReq as OrganizationTypeRequest, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(OrganizationTypeError));

      const error = (mockNext as any).mock.calls[0][0];
      expect(error.statusCode).toBe(401);
    });

    it('should use default roles if none specified', async () => {
      mockReq.session = {
        user: {
          id: 'org-admin-user',
          isSiteAdmin: false,
          role: 'org_admin',
        },
      } as any;

      const middleware = authorizeOrganizationTypeAccess(); // No roles specified
      await middleware(mockReq as OrganizationTypeRequest, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith();
    });
  });

  describe('Security Edge Cases', () => {
    it('should not allow SQL injection through orgType parameter', async () => {
      mockReq.session = {
        user: {
          id: 'attacker-user-id',
          isSiteAdmin: false,
        },
      } as any;
      // Attempt SQL injection
      mockReq.params = { orgType: "college' OR '1'='1" };

      mockStorage.getUserOrganizations.mockResolvedValue([
        {
          organization: { orgType: 'college' },
        },
      ]);

      const middleware = verifyOrganizationTypeAccess(mockStorage);
      await middleware(mockReq as OrganizationTypeRequest, mockRes as Response, mockNext);

      // Should deny access because the SQL injection string doesn't match 'college'
      expect(mockNext).toHaveBeenCalledWith(expect.any(OrganizationTypeError));
    });

    it('should handle undefined organization in user organizations list', async () => {
      mockReq.session = {
        user: {
          id: 'regular-user-id',
          isSiteAdmin: false,
        },
      } as any;
      mockReq.params = { orgType: 'college' };

      mockStorage.getUserOrganizations.mockResolvedValue([
        {
          organization: undefined, // Malformed data
        },
        {
          organization: { orgType: 'college' },
        },
      ]);

      const middleware = verifyOrganizationTypeAccess(mockStorage);
      await middleware(mockReq as OrganizationTypeRequest, mockRes as Response, mockNext);

      // Should still allow because one valid org exists
      expect(mockNext).toHaveBeenCalledWith();
    });

    it('should handle empty string orgType in user organizations', async () => {
      mockReq.session = {
        user: {
          id: 'regular-user-id',
          isSiteAdmin: false,
        },
      } as any;
      mockReq.params = { orgType: 'college' };

      mockStorage.getUserOrganizations.mockResolvedValue([
        {
          organization: { orgType: '' }, // Empty string
        },
      ]);

      const middleware = verifyOrganizationTypeAccess(mockStorage);
      await middleware(mockReq as OrganizationTypeRequest, mockRes as Response, mockNext);

      // Should deny because empty string is filtered out
      expect(mockNext).toHaveBeenCalledWith(expect.any(OrganizationTypeError));
    });
  });
});

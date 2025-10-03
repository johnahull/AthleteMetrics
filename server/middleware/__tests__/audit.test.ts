/**
 * Tests for audit logging middleware
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import { auditLog, createAuditMiddleware, auditDataAccess, logSecurityEvent, AuditActions } from '../audit';
import { logger } from '../../utils/logger';

// Mock logger
vi.mock('../../utils/logger', () => ({
  logger: {
    audit: vi.fn(),
    security: vi.fn(),
    error: vi.fn(),
  },
}));

describe('Audit Middleware', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    mockReq = {
      id: 'test-request-id',
      path: '/api/test',
      method: 'POST',
      query: {},
      body: {},
      context: {
        userId: 'user-123',
        organizationId: 'org-456',
        role: 'admin',
        ip: '127.0.0.1',
        userAgent: 'test-agent',
      },
    };
    mockRes = {
      statusCode: 200,
      send: vi.fn(),
    };
    mockNext = vi.fn();

    vi.clearAllMocks();
  });

  describe('auditLog()', () => {
    it('should log audit event for successful response', () => {
      const getAuditInfo = (req: Request) => ({
        action: AuditActions.USER_CREATED,
        resourceType: 'user',
        resourceId: 'user-789',
        details: { username: 'testuser' },
      });

      const middleware = auditLog(getAuditInfo);
      middleware(mockReq as Request, mockRes as Response, mockNext);

      // Trigger the send function
      mockRes.send!('success');

      expect(logger.audit).toHaveBeenCalledWith(
        AuditActions.USER_CREATED,
        expect.objectContaining({
          requestId: 'test-request-id',
          userId: 'user-123',
          organizationId: 'org-456',
          role: 'admin',
          ip: '127.0.0.1',
          userAgent: 'test-agent',
          resourceType: 'user',
          resourceId: 'user-789',
          username: 'testuser',
        })
      );
      expect(mockNext).toHaveBeenCalled();
    });

    it('should NOT log audit event for error response (4xx)', () => {
      const getAuditInfo = (req: Request) => ({
        action: AuditActions.USER_CREATED,
      });

      mockRes.statusCode = 400; // Error status

      const middleware = auditLog(getAuditInfo);
      middleware(mockReq as Request, mockRes as Response, mockNext);

      mockRes.send!('error');

      expect(logger.audit).not.toHaveBeenCalled();
    });

    it('should NOT log audit event for server error (5xx)', () => {
      const getAuditInfo = (req: Request) => ({
        action: AuditActions.USER_CREATED,
      });

      mockRes.statusCode = 500; // Server error

      const middleware = auditLog(getAuditInfo);
      middleware(mockReq as Request, mockRes as Response, mockNext);

      mockRes.send!('error');

      expect(logger.audit).not.toHaveBeenCalled();
    });

    it('should handle audit logging errors gracefully', () => {
      const getAuditInfo = vi.fn().mockImplementation(() => {
        throw new Error('Audit info error');
      });

      const middleware = auditLog(getAuditInfo);
      middleware(mockReq as Request, mockRes as Response, mockNext);

      mockRes.send!('success');

      expect(logger.error).toHaveBeenCalledWith(
        'Audit logging failed',
        expect.any(Object),
        expect.any(Error)
      );
    });

    it('should work without request context', () => {
      mockReq.context = undefined;

      const getAuditInfo = (req: Request) => ({
        action: AuditActions.DATA_EXPORTED,
      });

      const middleware = auditLog(getAuditInfo);
      middleware(mockReq as Request, mockRes as Response, mockNext);

      mockRes.send!('success');

      expect(logger.audit).toHaveBeenCalledWith(
        AuditActions.DATA_EXPORTED,
        expect.objectContaining({
          requestId: 'test-request-id',
        })
      );
    });
  });

  describe('createAuditMiddleware()', () => {
    it('should create middleware with static action', () => {
      const middleware = createAuditMiddleware(AuditActions.TEAM_CREATED);
      middleware(mockReq as Request, mockRes as Response, mockNext);

      mockRes.send!('success');

      expect(logger.audit).toHaveBeenCalledWith(
        AuditActions.TEAM_CREATED,
        expect.any(Object)
      );
    });

    it('should create middleware with resource info getter', () => {
      const getResourceInfo = (req: Request) => ({
        resourceType: 'team',
        resourceId: req.body.teamId,
        details: { name: req.body.name },
      });

      mockReq.body = { teamId: 'team-123', name: 'Test Team' };

      const middleware = createAuditMiddleware(AuditActions.TEAM_UPDATED, getResourceInfo);
      middleware(mockReq as Request, mockRes as Response, mockNext);

      mockRes.send!('success');

      expect(logger.audit).toHaveBeenCalledWith(
        AuditActions.TEAM_UPDATED,
        expect.objectContaining({
          resourceType: 'team',
          resourceId: 'team-123',
          name: 'Test Team',
        })
      );
    });
  });

  describe('auditDataAccess()', () => {
    it('should log data access with query params', () => {
      mockReq.query = { startDate: '2024-01-01', endDate: '2024-12-31' };
      mockReq.body = { filters: { team: 'team-123' } };

      const middleware = auditDataAccess('measurements');
      middleware(mockReq as Request, mockRes as Response, mockNext);

      mockRes.send!('success');

      expect(logger.audit).toHaveBeenCalledWith(
        AuditActions.ANALYTICS_ACCESSED,
        expect.objectContaining({
          resourceType: 'measurements',
          query: mockReq.query,
          filters: mockReq.body.filters,
        })
      );
    });
  });

  describe('logSecurityEvent()', () => {
    it('should log security event immediately', () => {
      const middleware = logSecurityEvent(AuditActions.ACCESS_DENIED);
      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(logger.security).toHaveBeenCalledWith(
        AuditActions.ACCESS_DENIED,
        expect.objectContaining({
          requestId: 'test-request-id',
          userId: 'user-123',
          path: '/api/test',
          method: 'POST',
        })
      );
      expect(mockNext).toHaveBeenCalled();
    });

    it('should log security event with custom details', () => {
      const getDetails = (req: Request) => ({
        reason: 'Invalid permissions',
        requiredRole: 'admin',
      });

      const middleware = logSecurityEvent(AuditActions.ACCESS_DENIED, getDetails);
      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(logger.security).toHaveBeenCalledWith(
        AuditActions.ACCESS_DENIED,
        expect.objectContaining({
          reason: 'Invalid permissions',
          requiredRole: 'admin',
        })
      );
    });

    it('should work without request context', () => {
      mockReq.context = undefined;

      const middleware = logSecurityEvent(AuditActions.RATE_LIMIT_EXCEEDED);
      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(logger.security).toHaveBeenCalledWith(
        AuditActions.RATE_LIMIT_EXCEEDED,
        expect.objectContaining({
          path: '/api/test',
          method: 'POST',
        })
      );
    });
  });

  describe('AuditActions', () => {
    it('should have all expected action constants', () => {
      expect(AuditActions.USER_CREATED).toBe('user.created');
      expect(AuditActions.ORG_CREATED).toBe('organization.created');
      expect(AuditActions.TEAM_CREATED).toBe('team.created');
      expect(AuditActions.MEASUREMENT_CREATED).toBe('measurement.created');
      expect(AuditActions.ACCESS_DENIED).toBe('security.access_denied');
      expect(AuditActions.DATA_EXPORTED).toBe('data.exported');
    });
  });
});

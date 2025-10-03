/**
 * Tests for request context middleware
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import {
  addRequestId,
  addRequestContext,
  logRequestStart,
  logRequestEnd,
  hasContext,
  requestContext,
} from '../request-context';
import { logger } from '../../utils/logger';

// Mock logger
vi.mock('../../utils/logger', () => ({
  logger: {
    debug: vi.fn(),
    logResponse: vi.fn(),
  },
}));

describe('Request Context Middleware', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    mockReq = {
      method: 'GET',
      path: '/api/test',
      headers: {},
      socket: { remoteAddress: '127.0.0.1' } as any,
      session: {
        user: {
          id: 'user-123',
          username: 'testuser',
          firstName: 'Test',
          lastName: 'User',
          email: 'test@example.com',
          role: 'admin',
          isSiteAdmin: true,
          primaryOrganizationId: 'org-456',
        },
      } as any,
    };
    mockRes = {
      setHeader: vi.fn(),
      send: vi.fn(),
      statusCode: 200,
    };
    mockNext = vi.fn();

    vi.clearAllMocks();
  });

  describe('addRequestId()', () => {
    it('should add request ID and start time', () => {
      const beforeTime = Date.now();

      addRequestId(mockReq as Request, mockRes as Response, mockNext);

      expect(mockReq.id).toBeDefined();
      expect(typeof mockReq.id).toBe('string');
      expect(mockReq.id.length).toBeGreaterThan(0);

      expect(mockReq.startTime).toBeDefined();
      expect(mockReq.startTime).toBeGreaterThanOrEqual(beforeTime);

      expect(mockRes.setHeader).toHaveBeenCalledWith('X-Request-ID', mockReq.id);
      expect(mockNext).toHaveBeenCalled();
    });

    it('should generate unique request IDs', () => {
      const req1 = { ...mockReq };
      const req2 = { ...mockReq };

      addRequestId(req1 as Request, mockRes as Response, mockNext);
      addRequestId(req2 as Request, mockRes as Response, mockNext);

      expect(req1.id).toBeDefined();
      expect(req2.id).toBeDefined();
      expect(req1.id).not.toBe(req2.id);
    });
  });

  describe('addRequestContext()', () => {
    it('should extract context from session', () => {
      addRequestContext(mockReq as Request, mockRes as Response, mockNext);

      expect(mockReq.context).toEqual({
        userId: 'user-123',
        organizationId: 'org-456',
        role: 'admin',
        isSiteAdmin: true,
        ip: '127.0.0.1',
        userAgent: undefined,
      });
      expect(mockNext).toHaveBeenCalled();
    });

    it('should extract IP from x-forwarded-for header', () => {
      mockReq.headers!['x-forwarded-for'] = '192.168.1.1, 10.0.0.1';

      addRequestContext(mockReq as Request, mockRes as Response, mockNext);

      expect(mockReq.context?.ip).toBe('192.168.1.1');
    });

    it('should extract IP from x-real-ip header', () => {
      mockReq.headers!['x-real-ip'] = '192.168.1.2';

      addRequestContext(mockReq as Request, mockRes as Response, mockNext);

      expect(mockReq.context?.ip).toBe('192.168.1.2');
    });

    it('should prefer x-forwarded-for over x-real-ip', () => {
      mockReq.headers!['x-forwarded-for'] = '192.168.1.1';
      mockReq.headers!['x-real-ip'] = '192.168.1.2';

      addRequestContext(mockReq as Request, mockRes as Response, mockNext);

      expect(mockReq.context?.ip).toBe('192.168.1.1');
    });

    it('should extract user agent from headers', () => {
      mockReq.headers!['user-agent'] = 'Mozilla/5.0 Test Browser';

      addRequestContext(mockReq as Request, mockRes as Response, mockNext);

      expect(mockReq.context?.userAgent).toBe('Mozilla/5.0 Test Browser');
    });

    it('should handle missing session', () => {
      mockReq.session = undefined;

      addRequestContext(mockReq as Request, mockRes as Response, mockNext);

      expect(mockReq.context).toEqual({
        userId: undefined,
        organizationId: undefined,
        role: undefined,
        isSiteAdmin: false,
        ip: '127.0.0.1',
        userAgent: undefined,
      });
    });

    it('should handle non-admin user', () => {
      mockReq.session!.user!.isSiteAdmin = false;

      addRequestContext(mockReq as Request, mockRes as Response, mockNext);

      expect(mockReq.context?.isSiteAdmin).toBe(false);
    });
  });

  describe('logRequestStart()', () => {
    it('should log request start with context', () => {
      mockReq.id = 'test-request-id';
      mockReq.context = {
        userId: 'user-123',
        organizationId: 'org-456',
        role: 'admin',
        isSiteAdmin: true,
        ip: '127.0.0.1',
        userAgent: 'Test Browser',
      };

      logRequestStart(mockReq as Request, mockRes as Response, mockNext);

      expect(logger.debug).toHaveBeenCalledWith(
        '→ GET /api/test',
        expect.objectContaining({
          requestId: 'test-request-id',
          userId: 'user-123',
          organizationId: 'org-456',
          ip: '127.0.0.1',
          userAgent: 'Test Browser',
        })
      );
      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('logRequestEnd()', () => {
    it('should log request completion with duration', () => {
      mockReq.id = 'test-request-id';
      mockReq.startTime = Date.now() - 100; // 100ms ago
      mockReq.context = {
        userId: 'user-123',
        organizationId: 'org-456',
        role: 'admin',
        isSiteAdmin: true,
        ip: '127.0.0.1',
      };
      mockRes.statusCode = 200;

      logRequestEnd(mockReq as Request, mockRes as Response, mockNext);

      // Trigger the send function
      mockRes.send!({ success: true });

      expect(logger.logResponse).toHaveBeenCalledWith(
        'GET',
        '/api/test',
        200,
        expect.any(Number),
        expect.objectContaining({
          requestId: 'test-request-id',
          userId: 'user-123',
          organizationId: 'org-456',
        })
      );

      // Check duration is reasonable (should be >= 100ms but allow some variance)
      const duration = (logger.logResponse as any).mock.calls[0][3];
      expect(duration).toBeGreaterThanOrEqual(90);
      expect(duration).toBeLessThan(200);
    });
  });

  describe('hasContext()', () => {
    it('should return true for request with complete context', () => {
      mockReq.context = {
        userId: 'user-123',
        organizationId: 'org-456',
        role: 'admin',
        isSiteAdmin: true,
        ip: '127.0.0.1',
      };

      const result = hasContext(mockReq as Request);

      expect(result).toBe(true);
    });

    it('should return false for request without userId', () => {
      mockReq.context = {
        userId: undefined,
        organizationId: 'org-456',
        role: undefined,
        isSiteAdmin: false,
        ip: '127.0.0.1',
      };

      const result = hasContext(mockReq as Request);

      expect(result).toBe(false);
    });

    it('should return false for request without context', () => {
      mockReq.context = undefined as any;

      const result = hasContext(mockReq as Request);

      expect(result).toBe(false);
    });
  });

  describe('requestContext array', () => {
    it('should contain all middleware functions in correct order', () => {
      expect(requestContext).toHaveLength(4);
      expect(requestContext[0]).toBe(addRequestId);
      expect(requestContext[1]).toBe(addRequestContext);
      expect(requestContext[2]).toBe(logRequestStart);
      expect(requestContext[3]).toBe(logRequestEnd);
    });
  });
});

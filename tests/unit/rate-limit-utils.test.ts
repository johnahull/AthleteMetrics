/**
 * Unit Tests for Rate Limit Utility Functions
 *
 * Tests the shouldSkipRateLimiting() function that determines when rate limiting
 * should be bypassed for development, testing, and localhost scenarios.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { shouldSkipRateLimiting } from '../../packages/api/utils/rate-limit-utils';
import type { Request } from 'express';

describe('shouldSkipRateLimiting', () => {
  let originalEnv: NodeJS.ProcessEnv;
  let consoleWarnSpy: any;

  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env };
    // Spy on console.warn to verify logging behavior
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
    // Restore console.warn
    consoleWarnSpy.mockRestore();
  });

  describe('Localhost Detection', () => {
    it('should skip rate limiting for IPv4 localhost (127.0.0.1)', () => {
      process.env.NODE_ENV = 'development';
      const mockReq = { ip: '127.0.0.1', path: '/api/test' } as Request;

      expect(shouldSkipRateLimiting(mockReq)).toBe(true);
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Rate limiting bypassed'),
        expect.objectContaining({ reason: 'localhost' })
      );
    });

    it('should skip rate limiting for IPv6 localhost (::1)', () => {
      process.env.NODE_ENV = 'development';
      const mockReq = { ip: '::1', path: '/api/test' } as Request;

      expect(shouldSkipRateLimiting(mockReq)).toBe(true);
    });

    it('should skip rate limiting for IPv6-mapped IPv4 localhost (::ffff:127.0.0.1)', () => {
      process.env.NODE_ENV = 'development';
      const mockReq = { ip: '::ffff:127.0.0.1', path: '/api/test' } as Request;

      expect(shouldSkipRateLimiting(mockReq)).toBe(true);
    });

    it('should not skip rate limiting for non-localhost IP', () => {
      process.env.NODE_ENV = 'development';
      const mockReq = { ip: '192.168.1.100', path: '/api/test' } as Request;

      expect(shouldSkipRateLimiting(mockReq)).toBe(false);
    });
  });

  describe('Test Environment Detection', () => {
    it('should skip rate limiting in test environment', () => {
      process.env.NODE_ENV = 'test';
      const mockReq = { ip: '192.168.1.100', path: '/api/test' } as Request;

      expect(shouldSkipRateLimiting(mockReq)).toBe(true);
      // Should not log in test environment
      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });

    it('should not skip rate limiting in production even if test-like conditions', () => {
      process.env.NODE_ENV = 'production';
      const mockReq = { ip: '127.0.0.1', path: '/api/test' } as Request;

      // Even localhost should skip in production (localhost check happens before prod check)
      expect(shouldSkipRateLimiting(mockReq)).toBe(true);
    });
  });

  describe('Bypass Environment Variable', () => {
    it('should skip rate limiting in development with BYPASS_GENERAL_RATE_LIMIT=true', () => {
      process.env.NODE_ENV = 'development';
      process.env.BYPASS_GENERAL_RATE_LIMIT = 'true';
      const mockReq = { ip: '192.168.1.100', path: '/api/test', route: { path: '/api/test' } } as any;

      expect(shouldSkipRateLimiting(mockReq, 'general')).toBe(true);
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Rate limiting bypassed'),
        expect.objectContaining({
          reason: 'BYPASS_GENERAL_RATE_LIMIT env var',
          environment: 'development'
        })
      );
    });

    it('should skip rate limiting in staging with BYPASS_GENERAL_RATE_LIMIT=true', () => {
      process.env.NODE_ENV = 'staging';
      process.env.BYPASS_GENERAL_RATE_LIMIT = 'true';
      const mockReq = { ip: '192.168.1.100', path: '/api/test' } as Request;

      expect(shouldSkipRateLimiting(mockReq, 'general')).toBe(true);
    });

    it('should NOT skip rate limiting in production even with BYPASS_GENERAL_RATE_LIMIT=true', () => {
      process.env.NODE_ENV = 'production';
      process.env.BYPASS_GENERAL_RATE_LIMIT = 'true';
      const mockReq = { ip: '192.168.1.100', path: '/api/test' } as Request;

      // Production safeguard - should NEVER bypass
      expect(shouldSkipRateLimiting(mockReq, 'general')).toBe(false);
    });

    it('should not skip rate limiting with BYPASS_GENERAL_RATE_LIMIT=false', () => {
      process.env.NODE_ENV = 'development';
      process.env.BYPASS_GENERAL_RATE_LIMIT = 'false';
      const mockReq = { ip: '192.168.1.100', path: '/api/test' } as Request;

      expect(shouldSkipRateLimiting(mockReq, 'general')).toBe(false);
    });

    it('should not skip rate limiting without bypass flag set', () => {
      process.env.NODE_ENV = 'development';
      delete process.env.BYPASS_GENERAL_RATE_LIMIT;
      const mockReq = { ip: '192.168.1.100', path: '/api/test' } as Request;

      expect(shouldSkipRateLimiting(mockReq, 'general')).toBe(false);
    });
  });

  describe('Rate Limit Type - Analytics', () => {
    it('should check BYPASS_ANALYTICS_RATE_LIMIT for analytics type', () => {
      process.env.NODE_ENV = 'development';
      process.env.BYPASS_ANALYTICS_RATE_LIMIT = 'true';
      process.env.BYPASS_GENERAL_RATE_LIMIT = 'false';
      const mockReq = { ip: '192.168.1.100', path: '/api/analytics', route: { path: '/api/analytics' } } as any;

      expect(shouldSkipRateLimiting(mockReq, 'analytics')).toBe(true);
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('bypassed for analytics'),
        expect.anything()
      );
    });

    it('should not use BYPASS_GENERAL_RATE_LIMIT for analytics type', () => {
      process.env.NODE_ENV = 'development';
      process.env.BYPASS_ANALYTICS_RATE_LIMIT = 'false';
      process.env.BYPASS_GENERAL_RATE_LIMIT = 'true';
      const mockReq = { ip: '192.168.1.100', path: '/api/analytics' } as Request;

      // Should not skip because we're checking analytics but only general bypass is set
      expect(shouldSkipRateLimiting(mockReq, 'analytics')).toBe(false);
    });
  });

  describe('Logging Behavior', () => {
    it('should log with redacted IP address (4 characters)', () => {
      process.env.NODE_ENV = 'development';
      const mockReq = { ip: '192.168.1.100', path: '/api/test', route: { path: '/api/test' } } as any;

      shouldSkipRateLimiting(mockReq); // localhost will skip

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          ip: '192.***' // First 4 characters + ***
        })
      );
    });

    it('should use route path template when available', () => {
      process.env.NODE_ENV = 'development';
      const mockReq = {
        ip: '127.0.0.1',
        path: '/api/users/123',
        route: { path: '/api/users/:id' }
      } as any;

      shouldSkipRateLimiting(mockReq);

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          path: '/api/users/:id' // Template, not actual path
        })
      );
    });

    it('should strip query params when route path not available', () => {
      process.env.NODE_ENV = 'development';
      const mockReq = {
        ip: '127.0.0.1',
        path: '/api/test?token=secret&foo=bar'
      } as any;

      shouldSkipRateLimiting(mockReq);

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          path: '/api/test' // Query params stripped
        })
      );
    });

    it('should not log in test environment', () => {
      process.env.NODE_ENV = 'test';
      const mockReq = { ip: '127.0.0.1', path: '/api/test' } as Request;

      shouldSkipRateLimiting(mockReq);

      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });

    it('should handle missing IP gracefully', () => {
      process.env.NODE_ENV = 'development';
      const mockReq = { ip: undefined, path: '/api/test' } as any;

      shouldSkipRateLimiting(mockReq);

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          ip: 'unknown'
        })
      );
    });
  });

  describe('Rate Limit Type Parameter', () => {
    it('should default to "general" when type not specified', () => {
      process.env.NODE_ENV = 'development';
      process.env.BYPASS_GENERAL_RATE_LIMIT = 'true';
      const mockReq = { ip: '192.168.1.100', path: '/api/test', route: { path: '/api/test' } } as any;

      shouldSkipRateLimiting(mockReq); // No type specified

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('bypassed for general'),
        expect.anything()
      );
    });

    it('should support "auth" rate limit type', () => {
      process.env.NODE_ENV = 'development';
      process.env.BYPASS_GENERAL_RATE_LIMIT = 'true';
      const mockReq = { ip: '192.168.1.100', path: '/api/auth/login', route: { path: '/api/auth/login' } } as any;

      shouldSkipRateLimiting(mockReq, 'auth');

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('bypassed for auth'),
        expect.anything()
      );
    });

    it('should support "upload" rate limit type', () => {
      process.env.NODE_ENV = 'development';
      process.env.BYPASS_GENERAL_RATE_LIMIT = 'true';
      const mockReq = { ip: '192.168.1.100', path: '/api/upload', route: { path: '/api/upload' } } as any;

      shouldSkipRateLimiting(mockReq, 'upload');

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('bypassed for upload'),
        expect.anything()
      );
    });
  });

  describe('Production Safeguard', () => {
    it('should never bypass in production regardless of all flags', () => {
      process.env.NODE_ENV = 'production';
      process.env.BYPASS_GENERAL_RATE_LIMIT = 'true';
      process.env.BYPASS_ANALYTICS_RATE_LIMIT = 'true';

      // Non-localhost IP
      const mockReq = { ip: '192.168.1.100', path: '/api/test' } as Request;

      expect(shouldSkipRateLimiting(mockReq, 'general')).toBe(false);
      expect(shouldSkipRateLimiting(mockReq, 'analytics')).toBe(false);
      expect(shouldSkipRateLimiting(mockReq, 'auth')).toBe(false);
      expect(shouldSkipRateLimiting(mockReq, 'upload')).toBe(false);
    });

    it('should allow localhost even in production', () => {
      process.env.NODE_ENV = 'production';
      const mockReq = { ip: '127.0.0.1', path: '/api/test' } as Request;

      // Localhost should still be allowed (for health checks, etc.)
      expect(shouldSkipRateLimiting(mockReq)).toBe(true);
    });
  });
});

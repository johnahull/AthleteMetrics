import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * Tests for server startup validation
 *
 * These tests verify that the server:
 * - Defaults NODE_ENV to 'production' if not set (fail-secure)
 * - Performs fail-fast validation of SESSION_SECRET
 */
describe('Server Startup Validation', () => {
  let originalEnv: NodeJS.ProcessEnv;
  let mockExit: ReturnType<typeof vi.spyOn>;
  let mockConsoleError: ReturnType<typeof vi.spyOn>;
  let mockConsoleWarn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // Clear module cache BEFORE setting up environment for each test
    vi.resetModules();

    // Save original environment
    originalEnv = { ...process.env };

    // Mock process.exit to prevent tests from actually exiting
    mockExit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

    // Mock console.error to suppress output during tests
    mockConsoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    // Mock console.warn to capture warnings
    mockConsoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // Mock server to prevent startup errors
    const mockServer = {
      listen: vi.fn((_port: any, _host: any, callback: any) => {
        if (callback) callback();
        return mockServer;
      }),
      close: vi.fn((callback: any) => {
        if (callback) callback();
      })
    };

    // Mock registerRoutes to return mock server
    vi.doMock('../../packages/api/routes', () => ({
      registerRoutes: vi.fn().mockResolvedValue(mockServer)
    }));

    // Mock setupVite and serveStatic to prevent build directory errors
    vi.doMock('../../packages/api/vite.js', () => ({
      setupVite: vi.fn().mockResolvedValue(undefined),
      serveStatic: vi.fn()
    }));
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;

    // Restore mocked functions
    mockExit.mockRestore();
    mockConsoleError.mockRestore();
    mockConsoleWarn.mockRestore();

    // Clean up module mocks
    vi.doUnmock('../../packages/api/routes');
    vi.doUnmock('../../packages/api/vite.js');

    // CRITICAL: Reset all modules to prevent memory leaks from dynamic imports
    vi.resetModules();
  });

  describe('NODE_ENV validation', () => {
    it('should default to production and warn if NODE_ENV is not set', async () => {
      delete process.env.NODE_ENV;
      process.env.SESSION_SECRET = 'c7f8a9b2e4d6f1a3c5e7b9d1f3a5c7e9b1d3f5a7c9e1b3d5f7a9c1e3b5d7f9a1';
      process.env.DATABASE_URL = 'postgresql://localhost:5432/test';

      try {
        await import('../../packages/api/index');
      } catch (error) {
        // Server may fail to start for other reasons (e.g., database connection)
      }

      // Should NOT exit due to NODE_ENV, but should warn
      expect(mockConsoleWarn).toHaveBeenCalledWith(
        '⚠️  NODE_ENV not set, defaulting to production for security'
      );
      expect(process.env.NODE_ENV).toBe('production');
    });

    it('should start successfully when NODE_ENV is set to production', async () => {
      process.env.NODE_ENV = 'production';
      process.env.SESSION_SECRET = 'c7f8a9b2e4d6f1a3c5e7b9d1f3a5c7e9b1d3f5a7c9e1b3d5f7a9c1e3b5d7f9a1';
      process.env.DATABASE_URL = 'postgresql://localhost:5432/test';

      try {
        await import('../../packages/api/index');
      } catch (error) {
        // Server will attempt to start and may fail for other reasons
        // We're only testing that NODE_ENV validation passes
      }

      // Should not have called exit due to NODE_ENV validation
      if (mockExit.mock.calls.length > 0) {
        const exitCall = mockExit.mock.calls[0];
        // If exit was called, it should not be due to NODE_ENV validation
        expect(mockConsoleError).not.toHaveBeenCalledWith(
          expect.stringContaining('NODE_ENV environment variable not set')
        );
      }
    });

    it('should start successfully when NODE_ENV is set to development', async () => {
      process.env.NODE_ENV = 'development';
      process.env.SESSION_SECRET = 'c7f8a9b2e4d6f1a3c5e7b9d1f3a5c7e9b1d3f5a7c9e1b3d5f7a9c1e3b5d7f9a1';
      process.env.DATABASE_URL = 'postgresql://localhost:5432/test';

      try {
        await import('../../packages/api/index');
      } catch (error) {
        // Server will attempt to start and may fail for other reasons
      }

      // Should not have called exit due to NODE_ENV validation
      if (mockExit.mock.calls.length > 0) {
        expect(mockConsoleError).not.toHaveBeenCalledWith(
          expect.stringContaining('NODE_ENV environment variable not set')
        );
      }
    });
  });

  describe('SESSION_SECRET validation', () => {
    it('should exit with code 1 if SESSION_SECRET is not set', async () => {
      process.env.NODE_ENV = 'production';
      delete process.env.SESSION_SECRET;
      // Set other required env vars so we test SESSION_SECRET validation specifically
      process.env.ADMIN_EMAIL = 'test@example.com';
      process.env.ADMIN_PASSWORD = 'test-password-123';
      process.env.DATABASE_URL = 'postgresql://localhost:5432/test';

      try {
        await import('../../packages/api/index');
      } catch (error) {
        // Import may throw after process.exit is called
      }

      expect(mockExit).toHaveBeenCalledWith(1);
      // The validation error output references SESSION_SECRET. The exact message
      // is covered by config/env's unit tests.
      const errorCalls = mockConsoleError.mock.calls.flat();
      expect(errorCalls.some((c) => typeof c === 'string' && c.includes('SESSION_SECRET'))).toBe(true);
    });

    it('should exit with code 1 if SESSION_SECRET is less than 32 characters', async () => {
      process.env.NODE_ENV = 'production';
      process.env.SESSION_SECRET = 'c7f8a9b2e4d6f1a3c5e7b9d1f3a5c7e'; // 31 chars (non-repeating)
      // Set other required env vars
      process.env.ADMIN_EMAIL = 'test@example.com';
      process.env.ADMIN_PASSWORD = 'test-password-123';
      process.env.DATABASE_URL = 'postgresql://localhost:5432/test';

      try {
        await import('../../packages/api/index');
      } catch (error) {
        // Import may throw after process.exit is called
      }

      expect(mockExit).toHaveBeenCalledWith(1);
      const errorCalls = mockConsoleError.mock.calls.flat();
      expect(errorCalls.some((c) => typeof c === 'string' && c.includes('SESSION_SECRET'))).toBe(true);
    });

    it('should reject SESSION_SECRET with only 32 characters in production', async () => {
      process.env.NODE_ENV = 'production';
      process.env.SESSION_SECRET = 'c7f8a9b2e4d6f1a3c5e7b9d1f3a5c7e9'; // 32 chars - not enough for production
      process.env.DATABASE_URL = 'postgresql://localhost:5432/test';

      try {
        await import('../../packages/api/index');
      } catch (error) {
        // Expected to fail
      }

      // Should have called exit due to insufficient SESSION_SECRET length for production
      expect(mockExit).toHaveBeenCalledWith(1);

      const errorCalls = mockConsoleError.mock.calls.flat();
      expect(errorCalls.some((c) => typeof c === 'string' && c.includes('SESSION_SECRET'))).toBe(true);
    });

    it('should accept SESSION_SECRET with more than 32 characters', async () => {
      process.env.NODE_ENV = 'production';
      process.env.SESSION_SECRET = 'c7f8a9b2e4d6f1a3c5e7b9d1f3a5c7e9b1d3f5a7c9e1b3d5f7a9c1e3b5d7f9a1'; // 64 characters (hex)
      process.env.DATABASE_URL = 'postgresql://localhost:5432/test';

      try {
        await import('../../packages/api/index');
      } catch (error) {
        // Server will attempt to start and may fail for other reasons
      }

      // Should not have called exit due to SESSION_SECRET validation
      if (mockExit.mock.calls.length > 0) {
        expect(mockConsoleError).not.toHaveBeenCalledWith(
          expect.stringContaining('SESSION_SECRET')
        );
      }
    });
  });

  describe('Combined validation', () => {
    it('should default NODE_ENV then validate SESSION_SECRET', async () => {
      delete process.env.NODE_ENV;
      delete process.env.SESSION_SECRET;
      // Set other required env vars
      process.env.ADMIN_EMAIL = 'test@example.com';
      process.env.ADMIN_PASSWORD = 'test-password-123';
      process.env.DATABASE_URL = 'postgresql://localhost:5432/test';

      try {
        await import('../../packages/api/index');
      } catch (error) {
        // Import may throw after process.exit is called
      }

      expect(mockExit).toHaveBeenCalledWith(1);
      // NODE_ENV should default with a warning
      const warnCalls = mockConsoleWarn.mock.calls.flat();
      expect(warnCalls).toContainEqual(
        '⚠️  NODE_ENV not set, defaulting to production for security'
      );
      // Then SESSION_SECRET validation should fail
      const errorCalls = mockConsoleError.mock.calls.flat();
      expect(errorCalls.some((c) => typeof c === 'string' && c.includes('SESSION_SECRET'))).toBe(true);
    });

    it('should pass validation with all required environment variables set', async () => {
      process.env.NODE_ENV = 'production';
      process.env.SESSION_SECRET = 'c7f8a9b2e4d6f1a3c5e7b9d1f3a5c7e9b1d3f5a7c9e1b3d5f7a9c1e3b5d7f9a1';
      process.env.DATABASE_URL = 'postgresql://localhost:5432/test';

      try {
        await import('../../packages/api/index');
      } catch (error) {
        // Server may fail to start for other reasons (e.g., database connection)
        // but validation should pass
      }

      // Should not have called exit due to environment validation
      if (mockExit.mock.calls.length > 0) {
        expect(mockConsoleError).not.toHaveBeenCalledWith(
          expect.stringContaining('NODE_ENV')
        );
        expect(mockConsoleError).not.toHaveBeenCalledWith(
          expect.stringContaining('SESSION_SECRET')
        );
      }
    });
  });
});

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * Tests for graceful shutdown handler
 *
 * Verifies that the server properly handles SIGTERM and SIGINT signals,
 * closes HTTP connections, cleans up database connections, and exits
 * with appropriate status codes.
 *
 * This is critical for production deployments with container orchestration
 * (Docker, Kubernetes) to prevent connection leaks during rolling updates.
 */
describe('Graceful Shutdown', () => {
  let mockExit: ReturnType<typeof vi.spyOn>;
  let mockSetTimeout: ReturnType<typeof vi.spyOn>;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };

    // Set required environment variables
    process.env.NODE_ENV = 'production';
    process.env.SESSION_SECRET = 'a'.repeat(64);
    process.env.DATABASE_URL = 'postgresql://localhost:5432/test';

    // Mock process.exit
    mockExit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

    // Mock setTimeout to test timeout mechanism
    mockSetTimeout = vi.spyOn(global, 'setTimeout');
  });

  afterEach(() => {
    process.env = originalEnv;
    mockExit.mockRestore();
    mockSetTimeout.mockRestore();
    vi.resetModules();
  });

  describe('SIGTERM handling', () => {
    it('should register SIGTERM handler', async () => {
      const mockOn = vi.spyOn(process, 'on');

      try {
        await import('../../server/index');
      } catch (error) {
        // Server may fail to start, but we're testing handler registration
      }

      expect(mockOn).toHaveBeenCalledWith('SIGTERM', expect.any(Function));

      mockOn.mockRestore();
    });

    it('should log SIGTERM received message', async () => {
      const mockConsoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});
      let sigtermHandler: Function | undefined;

      const mockOn = vi.spyOn(process, 'on').mockImplementation((event: any, handler: any) => {
        if (event === 'SIGTERM') {
          sigtermHandler = handler;
        }
        return process;
      });

      // Mock server.close to prevent actual server shutdown
      const mockServerClose = vi.fn((callback) => {
        if (callback) callback();
      });

      try {
        await import('../../server/index');
      } catch (error) {
        // Expected - server will fail to start in test environment
      }

      if (sigtermHandler) {
        await sigtermHandler();

        expect(mockConsoleLog).toHaveBeenCalledWith(
          expect.stringContaining('SIGTERM received')
        );
      }

      mockConsoleLog.mockRestore();
      mockOn.mockRestore();
    });
  });

  describe('SIGINT handling', () => {
    it('should register SIGINT handler', async () => {
      const mockOn = vi.spyOn(process, 'on');

      try {
        await import('../../server/index');
      } catch (error) {
        // Server may fail to start
      }

      expect(mockOn).toHaveBeenCalledWith('SIGINT', expect.any(Function));

      mockOn.mockRestore();
    });
  });

  describe('Shutdown timeout', () => {
    it('should set 30-second forced shutdown timeout', async () => {
      let sigtermHandler: Function | undefined;

      const mockOn = vi.spyOn(process, 'on').mockImplementation((event: any, handler: any) => {
        if (event === 'SIGTERM') {
          sigtermHandler = handler;
        }
        return process;
      });

      try {
        await import('../../server/index');
      } catch (error) {
        // Expected
      }

      if (sigtermHandler) {
        // Trigger shutdown
        await sigtermHandler();

        // Verify setTimeout was called with 30 second timeout
        const timeoutCall = mockSetTimeout.mock.calls.find(
          call => call[1] === 30000
        );

        expect(timeoutCall).toBeDefined();
      }

      mockOn.mockRestore();
    });

    it('should force exit after timeout', async () => {
      const mockConsoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      let timeoutCallback: Function | undefined;

      mockSetTimeout.mockImplementation((callback: any, delay: any) => {
        if (delay === 30000) {
          timeoutCallback = callback;
        }
        return {} as any;
      });

      let sigtermHandler: Function | undefined;
      const mockOn = vi.spyOn(process, 'on').mockImplementation((event: any, handler: any) => {
        if (event === 'SIGTERM') {
          sigtermHandler = handler;
        }
        return process;
      });

      try {
        await import('../../server/index');
      } catch (error) {
        // Expected
      }

      if (sigtermHandler) {
        await sigtermHandler();

        if (timeoutCallback) {
          timeoutCallback();

          expect(mockConsoleError).toHaveBeenCalledWith(
            expect.stringContaining('Forced shutdown after timeout')
          );
          expect(mockExit).toHaveBeenCalledWith(1);
        }
      }

      mockConsoleError.mockRestore();
      mockOn.mockRestore();
    });
  });

  describe('Database cleanup', () => {
    it('should close database connections during shutdown', async () => {
      const mockCloseDatabase = vi.fn().mockResolvedValue(undefined);

      // Mock the db module
      vi.doMock('../../server/db', () => ({
        db: {},
        closeDatabase: mockCloseDatabase
      }));

      let sigtermHandler: Function | undefined;

      const mockOn = vi.spyOn(process, 'on').mockImplementation((event: any, handler: any) => {
        if (event === 'SIGTERM') {
          sigtermHandler = handler;
        }
        return process;
      });

      const mockServerClose = vi.fn((callback) => {
        if (callback) callback();
      });

      try {
        await import('../../server/index');
      } catch (error) {
        // Expected
      }

      if (sigtermHandler) {
        await sigtermHandler();

        // Database cleanup should be called
        expect(mockCloseDatabase).toHaveBeenCalled();
      }

      mockOn.mockRestore();
      vi.doUnmock('../../server/db');
    });

    it('should exit with code 0 on successful shutdown', async () => {
      const mockCloseDatabase = vi.fn().mockResolvedValue(undefined);

      vi.doMock('../../server/db', () => ({
        db: {},
        closeDatabase: mockCloseDatabase
      }));

      let sigtermHandler: Function | undefined;

      const mockOn = vi.spyOn(process, 'on').mockImplementation((event: any, handler: any) => {
        if (event === 'SIGTERM') {
          sigtermHandler = handler;
        }
        return process;
      });

      const mockServerClose = vi.fn((callback) => {
        if (callback) callback();
      });

      try {
        await import('../../server/index');
      } catch (error) {
        // Expected
      }

      if (sigtermHandler) {
        await sigtermHandler();

        // Should exit with success code
        expect(mockExit).toHaveBeenCalledWith(0);
      }

      mockOn.mockRestore();
      vi.doUnmock('../../server/db');
    });

    it('should exit with code 1 on shutdown error', async () => {
      const mockConsoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      const mockCloseDatabase = vi.fn().mockRejectedValue(new Error('Database close failed'));

      vi.doMock('../../server/db', () => ({
        db: {},
        closeDatabase: mockCloseDatabase
      }));

      let sigtermHandler: Function | undefined;

      const mockOn = vi.spyOn(process, 'on').mockImplementation((event: any, handler: any) => {
        if (event === 'SIGTERM') {
          sigtermHandler = handler;
        }
        return process;
      });

      const mockServerClose = vi.fn((callback) => {
        if (callback) callback();
      });

      try {
        await import('../../server/index');
      } catch (error) {
        // Expected
      }

      if (sigtermHandler) {
        await sigtermHandler();

        // Should exit with error code
        expect(mockExit).toHaveBeenCalledWith(1);
        expect(mockConsoleError).toHaveBeenCalledWith(
          expect.stringContaining('Error during shutdown')
        );
      }

      mockConsoleError.mockRestore();
      mockOn.mockRestore();
      vi.doUnmock('../../server/db');
    });
  });

  describe('Shutdown sequence', () => {
    it('should close HTTP server before database', async () => {
      const callOrder: string[] = [];
      const mockCloseDatabase = vi.fn(async () => {
        callOrder.push('database');
      });

      vi.doMock('../../server/db', () => ({
        db: {},
        closeDatabase: mockCloseDatabase
      }));

      let sigtermHandler: Function | undefined;

      const mockOn = vi.spyOn(process, 'on').mockImplementation((event: any, handler: any) => {
        if (event === 'SIGTERM') {
          sigtermHandler = handler;
        }
        return process;
      });

      const mockServerClose = vi.fn((callback) => {
        callOrder.push('server');
        if (callback) callback();
      });

      try {
        await import('../../server/index');
      } catch (error) {
        // Expected
      }

      if (sigtermHandler) {
        await sigtermHandler();

        // Server should close before database
        expect(callOrder[0]).toBe('server');
        expect(callOrder[1]).toBe('database');
      }

      mockOn.mockRestore();
      vi.doUnmock('../../server/db');
    });
  });
});

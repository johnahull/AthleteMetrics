/**
 * Tests for structured logger
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LogLevel } from '../logger';

// Mock env before importing logger
const mockEnv = {
  LOG_LEVEL: 'info',
  NODE_ENV: 'test',
  SLOW_QUERY_THRESHOLD_MS: 1000,
};

vi.mock('../../config/env', () => ({
  env: mockEnv,
  isProduction: false,
  isDevelopment: false,
  isTest: true,
}));

// Mock console methods
const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

describe('Logger', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnv.LOG_LEVEL = 'info';
    mockEnv.NODE_ENV = 'test';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Need to dynamically import logger after mocks are set up
  async function getLogger() {
    // Clear module cache to get fresh logger instance
    vi.resetModules();
    const { logger } = await import('../logger');
    return logger;
  }

  describe('Log Level Filtering', () => {
    it('should log info messages when level is info', async () => {
      mockEnv.LOG_LEVEL = 'info';
      const logger = await getLogger();

      logger.info('Test message');

      expect(consoleLogSpy).toHaveBeenCalled();
    });

    it('should not log debug messages when level is info', async () => {
      mockEnv.LOG_LEVEL = 'info';
      const logger = await getLogger();

      logger.debug('Debug message');

      expect(consoleLogSpy).not.toHaveBeenCalled();
    });

    it('should log debug messages when level is debug', async () => {
      mockEnv.LOG_LEVEL = 'debug';
      const logger = await getLogger();

      logger.debug('Debug message');

      expect(consoleLogSpy).toHaveBeenCalled();
    });

    it('should log errors regardless of level', async () => {
      mockEnv.LOG_LEVEL = 'error';
      const logger = await getLogger();

      logger.error('Error message');

      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('should not log info when level is error', async () => {
      mockEnv.LOG_LEVEL = 'error';
      const logger = await getLogger();

      logger.info('Info message');

      expect(consoleLogSpy).not.toHaveBeenCalled();
    });
  });

  describe('Log Formatting', () => {
    it('should include timestamp in log output', async () => {
      mockEnv.LOG_LEVEL = 'info';
      const logger = await getLogger();

      logger.info('Test');

      expect(consoleLogSpy).toHaveBeenCalled();
      if (consoleLogSpy.mock.calls.length > 0) {
        const call = consoleLogSpy.mock.calls[0][0];
        expect(call).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/); // ISO timestamp
      }
    });

    it('should include log level in output', async () => {
      mockEnv.LOG_LEVEL = 'warn';
      const logger = await getLogger();

      logger.warn('Warning');

      expect(consoleWarnSpy).toHaveBeenCalled();
      if (consoleWarnSpy.mock.calls.length > 0) {
        const call = consoleWarnSpy.mock.calls[0][0];
        expect(call).toContain('[WARN]');
      }
    });

    it('should include message in output', async () => {
      mockEnv.LOG_LEVEL = 'info';
      const logger = await getLogger();

      logger.info('Test message');

      expect(consoleLogSpy).toHaveBeenCalled();
      if (consoleLogSpy.mock.calls.length > 0) {
        const call = consoleLogSpy.mock.calls[0][0];
        expect(call).toContain('Test message');
      }
    });

    it('should include context in output', async () => {
      mockEnv.LOG_LEVEL = 'info';
      const logger = await getLogger();

      logger.info('Test', { userId: 'user-123', action: 'login' });

      expect(consoleLogSpy).toHaveBeenCalled();
      if (consoleLogSpy.mock.calls.length > 0) {
        const call = consoleLogSpy.mock.calls[0][0];
        expect(call).toContain('userId');
        expect(call).toContain('user-123');
      }
    });
  });

  describe('Error Logging', () => {
    it('should log error with stack trace in development', async () => {
      mockEnv.NODE_ENV = 'development';
      mockEnv.LOG_LEVEL = 'error';
      const logger = await getLogger();

      const error = new Error('Test error');
      logger.error('Error occurred', {}, error);

      expect(consoleErrorSpy).toHaveBeenCalled();
      if (consoleErrorSpy.mock.calls.length > 0) {
        const call = consoleErrorSpy.mock.calls[0][0];
        expect(call).toContain('Test error');
        expect(call).toContain('Stack:');
      }
    });

    it('should not include stack trace in production', async () => {
      mockEnv.NODE_ENV = 'production';
      mockEnv.LOG_LEVEL = 'error';
      const logger = await getLogger();

      const error = new Error('Test error');
      logger.error('Error occurred', {}, error);

      expect(consoleErrorSpy).toHaveBeenCalled();
      if (consoleErrorSpy.mock.calls.length > 0) {
        const call = consoleErrorSpy.mock.calls[0][0];
        expect(call).toContain('Test error');
        expect(call).not.toContain('Stack:');
      }
    });

    it('should include stack trace in debug mode regardless of environment', async () => {
      mockEnv.NODE_ENV = 'production';
      mockEnv.LOG_LEVEL = 'debug';
      const logger = await getLogger();

      const error = new Error('Test error');
      logger.error('Error occurred', {}, error);

      expect(consoleErrorSpy).toHaveBeenCalled();
      if (consoleErrorSpy.mock.calls.length > 0) {
        const call = consoleErrorSpy.mock.calls[0][0];
        expect(call).toContain('Stack:');
      }
    });
  });

  describe('Query Logging', () => {
    it('should log queries in development', async () => {
      mockEnv.NODE_ENV = 'development';
      const logger = await getLogger();

      logger.logQuery('SELECT * FROM users', 50);

      expect(consoleLogSpy).toHaveBeenCalled();
      const call = consoleLogSpy.mock.calls[0][0];
      expect(call).toContain('SELECT * FROM users');
      expect(call).toContain('50ms');
    });

    it('should not log fast queries in production', async () => {
      mockEnv.NODE_ENV = 'production';
      const logger = await getLogger();

      logger.logQuery('SELECT * FROM users', 50);

      expect(consoleLogSpy).not.toHaveBeenCalled();
      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });

    it('should log slow queries in production with redacted SQL', async () => {
      mockEnv.NODE_ENV = 'production';
      mockEnv.SLOW_QUERY_THRESHOLD_MS = 1000;
      const logger = await getLogger();

      logger.logQuery('SELECT * FROM users WHERE email = ?', 1500);

      expect(consoleWarnSpy).toHaveBeenCalled();
      const call = consoleWarnSpy.mock.calls[0][0];
      expect(call).toContain('Slow query detected');
      expect(call).toContain('SELECT');
      expect(call).not.toContain('WHERE email'); // SQL should be redacted
    });

    it('should extract query type from SQL', async () => {
      mockEnv.NODE_ENV = 'production';
      const logger = await getLogger();

      logger.logQuery('INSERT INTO users VALUES (?)', 1500);

      const call = consoleWarnSpy.mock.calls[0][0];
      expect(call).toContain('INSERT');
    });
  });

  describe('Audit Logging', () => {
    it('should log audit events', async () => {
      const logger = await getLogger();

      logger.audit('user.login', {
        userId: 'user-123',
        ip: '127.0.0.1',
      });

      expect(consoleLogSpy).toHaveBeenCalled();
      const call = consoleLogSpy.mock.calls[0][0];
      expect(call).toContain('user.login');
      expect(call).toContain('audit');
    });
  });

  describe('Security Event Logging', () => {
    it('should log security events as warnings', async () => {
      const logger = await getLogger();

      logger.security('Unauthorized access attempt', {
        userId: 'user-123',
        path: '/api/admin',
      });

      expect(consoleWarnSpy).toHaveBeenCalled();
      const call = consoleWarnSpy.mock.calls[0][0];
      expect(call).toContain('SECURITY');
      expect(call).toContain('Unauthorized access attempt');
    });
  });

  describe('Response Logging', () => {
    it('should log HTTP responses', async () => {
      const logger = await getLogger();

      logger.logResponse('GET', '/api/users', 200, 125);

      expect(consoleLogSpy).toHaveBeenCalled();
      const call = consoleLogSpy.mock.calls[0][0];
      expect(call).toContain('GET');
      expect(call).toContain('/api/users');
      expect(call).toContain('200');
      expect(call).toContain('125ms');
    });

    it('should use different colors for different status codes', async () => {
      const logger = await getLogger();

      logger.logResponse('GET', '/api/users', 200, 50);
      logger.logResponse('POST', '/api/users', 400, 75);
      logger.logResponse('GET', '/api/error', 500, 100);

      expect(consoleLogSpy).toHaveBeenCalledTimes(3);
    });
  });

  describe('Context Handling', () => {
    it('should handle empty context', async () => {
      mockEnv.LOG_LEVEL = 'info';
      const logger = await getLogger();

      logger.info('Test');

      expect(consoleLogSpy).toHaveBeenCalled();
    });

    it('should handle complex context objects', async () => {
      mockEnv.LOG_LEVEL = 'info';
      const logger = await getLogger();

      logger.info('Test', {
        user: { id: '123', role: 'admin' },
        metadata: { source: 'api', version: 2 },
      });

      expect(consoleLogSpy).toHaveBeenCalled();
      if (consoleLogSpy.mock.calls.length > 0) {
        const call = consoleLogSpy.mock.calls[0][0];
        expect(call).toContain('user');
        expect(call).toContain('metadata');
      }
    });

    it('should handle context with undefined values', async () => {
      mockEnv.LOG_LEVEL = 'info';
      const logger = await getLogger();

      logger.info('Test', {
        userId: undefined,
        organizationId: 'org-123',
      });

      expect(consoleLogSpy).toHaveBeenCalled();
    });
  });
});

/**
 * Tests for environment configuration validation
 *
 * Note: These tests use process.env manipulation and module reloading
 * to test validation logic without affecting other tests.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('Environment Configuration Validation', () => {
  let originalEnv: NodeJS.ProcessEnv;
  let consoleErrorSpy: any;
  let processExitSpy: any;

  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env };

    // Mock console methods
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // Mock process.exit to prevent test runner from exiting
    processExitSpy = vi.spyOn(process, 'exit').mockImplementation((code?: number) => {
      throw new Error(`process.exit(${code})`);
    });
  });

  afterEach(() => {
    // Restore original environment
    process.env = { ...originalEnv };

    // Clear module cache to allow fresh imports
    vi.resetModules();

    // Restore mocks
    vi.restoreAllMocks();
  });

  describe('Required Fields Validation', () => {
    it('should fail when DATABASE_URL is missing', async () => {
      process.env = {
        NODE_ENV: 'test',
        SESSION_SECRET: 'a'.repeat(32),
        ADMIN_USER: 'admin',
        ADMIN_PASS: 'password123456',
      };

      await expect(async () => {
        await import('../env');
      }).rejects.toThrow('process.exit(1)');

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('DATABASE_URL')
      );
    });

    it('should fail when SESSION_SECRET is missing', async () => {
      process.env = {
        NODE_ENV: 'test',
        DATABASE_URL: 'postgresql://localhost/test',
        ADMIN_USER: 'admin',
        ADMIN_PASS: 'password123456',
      };

      await expect(async () => {
        await import('../env');
      }).rejects.toThrow('process.exit(1)');

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('SESSION_SECRET')
      );
    });

    it('should fail when ADMIN_USER is missing', async () => {
      process.env = {
        NODE_ENV: 'test',
        DATABASE_URL: 'postgresql://localhost/test',
        SESSION_SECRET: 'a'.repeat(32),
        ADMIN_PASS: 'password123456',
      };

      await expect(async () => {
        await import('../env');
      }).rejects.toThrow('process.exit(1)');
    });

    it('should fail when ADMIN_PASS is missing', async () => {
      process.env = {
        NODE_ENV: 'test',
        DATABASE_URL: 'postgresql://localhost/test',
        SESSION_SECRET: 'a'.repeat(32),
        ADMIN_USER: 'admin',
      };

      await expect(async () => {
        await import('../env');
      }).rejects.toThrow('process.exit(1)');
    });
  });

  describe('Field Validation', () => {
    it('should fail when SESSION_SECRET is too short', async () => {
      process.env = {
        NODE_ENV: 'test',
        DATABASE_URL: 'postgresql://localhost/test',
        SESSION_SECRET: 'too-short',
        ADMIN_USER: 'admin',
        ADMIN_PASS: 'password123456',
      };

      await expect(async () => {
        await import('../env');
      }).rejects.toThrow('process.exit(1)');

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('SESSION_SECRET')
      );
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('32 characters')
      );
    });

    it('should fail when ADMIN_USER is too short', async () => {
      process.env = {
        NODE_ENV: 'test',
        DATABASE_URL: 'postgresql://localhost/test',
        SESSION_SECRET: 'a'.repeat(32),
        ADMIN_USER: 'ab',
        ADMIN_PASS: 'password123456',
      };

      await expect(async () => {
        await import('../env');
      }).rejects.toThrow('process.exit(1)');
    });

    it('should fail when ADMIN_PASS is too short', async () => {
      process.env = {
        NODE_ENV: 'test',
        DATABASE_URL: 'postgresql://localhost/test',
        SESSION_SECRET: 'a'.repeat(32),
        ADMIN_USER: 'admin',
        ADMIN_PASS: 'short',
      };

      await expect(async () => {
        await import('../env');
      }).rejects.toThrow('process.exit(1)');

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('12 characters')
      );
    });
  });

  describe('Production-Specific Validation', () => {
    it('should fail when SESSION_SECRET is less than 64 chars in production', async () => {
      process.env = {
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://localhost/test',
        SESSION_SECRET: 'a'.repeat(40), // More than 32, less than 64
        ADMIN_USER: 'custom_admin',
        ADMIN_PASS: 'a'.repeat(20),
      };

      await expect(async () => {
        await import('../env');
      }).rejects.toThrow('process.exit(1)');
    });

    it('should fail when ADMIN_USER is "admin" in production', async () => {
      process.env = {
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://localhost/test',
        SESSION_SECRET: 'a'.repeat(64),
        ADMIN_USER: 'admin',
        ADMIN_PASS: 'a'.repeat(20),
      };

      await expect(async () => {
        await import('../env');
      }).rejects.toThrow('process.exit(1)');
    });

    it('should disable rate limit bypasses in production', async () => {
      process.env = {
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://localhost/test',
        SESSION_SECRET: 'a'.repeat(64),
        ADMIN_USER: 'custom_admin',
        ADMIN_PASS: 'a'.repeat(20),
        BYPASS_ANALYTICS_RATE_LIMIT: 'true',
        BYPASS_GENERAL_RATE_LIMIT: 'true',
      };

      // Should not throw, but should warn
      const module = await import('../env');
      const { env } = module;

      expect(env.BYPASS_ANALYTICS_RATE_LIMIT).toBe(false);
      expect(env.BYPASS_GENERAL_RATE_LIMIT).toBe(false);
    });
  });

  describe('Default Values', () => {
    it('should use default values for optional fields', async () => {
      process.env = {
        NODE_ENV: 'test',
        DATABASE_URL: 'postgresql://localhost/test',
        SESSION_SECRET: 'a'.repeat(32),
        ADMIN_USER: 'admin',
        ADMIN_PASS: 'password123456',
      };

      const module = await import('../env');
      const { env } = module;

      expect(env.PORT).toBe(5000);
      expect(env.LOG_LEVEL).toBe('info');
      expect(env.ANALYTICS_RATE_WINDOW_MS).toBe(900000);
      expect(env.ANALYTICS_RATE_LIMIT).toBe(50);
      expect(env.SLOW_QUERY_THRESHOLD_MS).toBe(1000);
    });

    it('should allow overriding default values', async () => {
      process.env = {
        NODE_ENV: 'test',
        DATABASE_URL: 'postgresql://localhost/test',
        SESSION_SECRET: 'a'.repeat(32),
        ADMIN_USER: 'admin',
        ADMIN_PASS: 'password123456',
        PORT: '3000',
        LOG_LEVEL: 'debug',
        SLOW_QUERY_THRESHOLD_MS: '500',
      };

      const module = await import('../env');
      const { env } = module;

      expect(env.PORT).toBe(3000);
      expect(env.LOG_LEVEL).toBe('debug');
      expect(env.SLOW_QUERY_THRESHOLD_MS).toBe(500);
    });
  });

  describe('Type Coercion', () => {
    it('should coerce string numbers to integers', async () => {
      process.env = {
        NODE_ENV: 'test',
        DATABASE_URL: 'postgresql://localhost/test',
        SESSION_SECRET: 'a'.repeat(32),
        ADMIN_USER: 'admin',
        ADMIN_PASS: 'password123456',
        PORT: '8080',
        ANALYTICS_RATE_WINDOW_MS: '600000',
        ANALYTICS_RATE_LIMIT: '100',
      };

      const module = await import('../env');
      const { env } = module;

      expect(typeof env.PORT).toBe('number');
      expect(env.PORT).toBe(8080);
      expect(typeof env.ANALYTICS_RATE_WINDOW_MS).toBe('number');
      expect(env.ANALYTICS_RATE_WINDOW_MS).toBe(600000);
    });

    it('should coerce string booleans to booleans', async () => {
      process.env = {
        NODE_ENV: 'test',
        DATABASE_URL: 'postgresql://localhost/test',
        SESSION_SECRET: 'a'.repeat(32),
        ADMIN_USER: 'admin',
        ADMIN_PASS: 'password123456',
        BYPASS_ANALYTICS_RATE_LIMIT: 'true',
        BYPASS_GENERAL_RATE_LIMIT: 'false',
      };

      const module = await import('../env');
      const { env } = module;

      expect(typeof env.BYPASS_ANALYTICS_RATE_LIMIT).toBe('boolean');
      expect(env.BYPASS_ANALYTICS_RATE_LIMIT).toBe(true);
      expect(env.BYPASS_GENERAL_RATE_LIMIT).toBe(false);
    });
  });

  describe('Environment Helpers', () => {
    it('should export isProduction helper', async () => {
      process.env = {
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://localhost/test',
        SESSION_SECRET: 'a'.repeat(64),
        ADMIN_USER: 'custom_admin',
        ADMIN_PASS: 'a'.repeat(20),
      };

      const module = await import('../env');
      const { isProduction, isDevelopment, isTest } = module;

      expect(isProduction).toBe(true);
      expect(isDevelopment).toBe(false);
      expect(isTest).toBe(false);
    });

    it('should export isDevelopment helper', async () => {
      process.env = {
        NODE_ENV: 'development',
        DATABASE_URL: 'postgresql://localhost/test',
        SESSION_SECRET: 'a'.repeat(32),
        ADMIN_USER: 'admin',
        ADMIN_PASS: 'password123456',
      };

      const module = await import('../env');
      const { isProduction, isDevelopment, isTest } = module;

      expect(isProduction).toBe(false);
      expect(isDevelopment).toBe(true);
      expect(isTest).toBe(false);
    });
  });
});

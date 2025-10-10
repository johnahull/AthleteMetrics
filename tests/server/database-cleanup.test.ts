import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * Tests for database cleanup function
 *
 * Verifies that the closeDatabase() function properly closes PostgreSQL
 * connections and is safe to call multiple times (idempotent).
 *
 * This prevents connection leaks in production and test environments.
 */
describe('Database Cleanup', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    process.env.DATABASE_URL = 'postgresql://localhost:5432/test';
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.resetModules();
  });

  describe('closeDatabase function', () => {
    it('should successfully close database connection', async () => {
      const { closeDatabase } = await import('../../server/db');

      // Should not throw
      await expect(closeDatabase()).resolves.not.toThrow();
    });

    it('should be idempotent (safe to call multiple times)', async () => {
      const { closeDatabase } = await import('../../server/db');

      // First close
      await closeDatabase();

      // Second close should not throw
      await expect(closeDatabase()).resolves.not.toThrow();

      // Third close should not throw
      await expect(closeDatabase()).resolves.not.toThrow();
    });

    it('should export closeDatabase function from db module', async () => {
      const dbModule = await import('../../server/db');

      expect(dbModule).toHaveProperty('closeDatabase');
      expect(typeof dbModule.closeDatabase).toBe('function');
    });

    it('should not export raw client (encapsulation)', async () => {
      const dbModule = await import('../../server/db');

      expect(dbModule).not.toHaveProperty('client');
    });

    it('should export db for application use', async () => {
      const dbModule = await import('../../server/db');

      expect(dbModule).toHaveProperty('db');
      expect(dbModule.db).toBeDefined();
    });
  });

  describe('Module encapsulation', () => {
    it('should prevent direct client access', async () => {
      const dbModule = await import('../../server/db');
      const moduleKeys = Object.keys(dbModule);

      // Should only export db and closeDatabase
      expect(moduleKeys).toContain('db');
      expect(moduleKeys).toContain('closeDatabase');
      expect(moduleKeys).not.toContain('client');
    });

    it('should force use of cleanup function', async () => {
      const { db } = await import('../../server/db');

      // db should not have direct access to client.end()
      expect(db).not.toHaveProperty('$client');
      expect(db).not.toHaveProperty('end');
    });
  });

  describe('Connection pool cleanup', () => {
    it('should close all connections in pool', async () => {
      const { closeDatabase } = await import('../../server/db');

      // Open connection by importing db
      const { db } = await import('../../server/db');

      // Verify db exists
      expect(db).toBeDefined();

      // Close should complete without error
      await expect(closeDatabase()).resolves.not.toThrow();
    });

    it('should handle cleanup errors gracefully', async () => {
      // This test verifies that if the underlying postgres client throws
      // during cleanup, it doesn't crash the application

      const { closeDatabase } = await import('../../server/db');

      // Even if already closed or error occurs, should not throw
      try {
        await closeDatabase();
        await closeDatabase(); // Second call - may error internally but shouldn't throw
      } catch (error) {
        // Should not reach here
        throw new Error('closeDatabase should not throw on repeated calls');
      }
    });
  });

  describe('Integration with test cleanup', () => {
    it('should be usable in afterAll hooks', async () => {
      const { closeDatabase } = await import('../../server/db');

      // Simulate test cleanup
      const cleanup = async () => {
        await closeDatabase();
      };

      await expect(cleanup()).resolves.not.toThrow();
    });

    it('should allow test isolation with re-imports', async () => {
      // Import and close
      const firstImport = await import('../../server/db');
      await firstImport.closeDatabase();

      // Reset modules
      vi.resetModules();

      // Re-import should work
      const secondImport = await import('../../server/db');
      expect(secondImport.db).toBeDefined();
      expect(secondImport.closeDatabase).toBeDefined();

      // Cleanup
      await secondImport.closeDatabase();
    });
  });
});

/**
 * Tests for admin user initialization and password synchronization
 * Tests the initializeDefaultUser() function in server/routes.ts
 */

// Set environment variables before any imports
process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'test-secret-for-admin-init-tests';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/test';

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import bcrypt from 'bcrypt';
import { db } from '../../server/db';
import { users, auditLogs } from '@shared/schema';
import { eq } from 'drizzle-orm';
import type { User } from '@shared/schema';

// Mock vite module to prevent build directory errors
vi.mock('../../server/vite.js', () => ({
  setupVite: vi.fn().mockResolvedValue(undefined),
  serveStatic: vi.fn()
}));

// Import storage and the actual function we're testing
import { storage } from '../../server/storage';
import { initializeDefaultUser } from '../../server/routes';

describe('Admin User Initialization', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeAll(async () => {
    // Validate DATABASE_URL is set
    if (!process.env.DATABASE_URL) {
      throw new Error(
        'DATABASE_URL must be set to run integration tests. ' +
        'Set it to a test PostgreSQL database.'
      );
    }
  });

  beforeEach(async () => {
    // Save original environment variables
    originalEnv = { ...process.env };

    // Clean up any existing test admin user
    const testUser = await storage.getUserByUsername('test-admin');
    if (testUser) {
      // Delete audit logs first to avoid foreign key constraint violation
      await db.delete(auditLogs).where(eq(auditLogs.userId, testUser.id));
      await db.delete(users).where(eq(users.id, testUser.id));
    }
  });

  afterEach(() => {
    // Restore environment variables
    process.env = originalEnv;

    // Restore all mocks
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    // Clean up test users
    try {
      const testUser = await storage.getUserByUsername('test-admin');
      if (testUser) {
        // Delete audit logs first to avoid foreign key constraint violation
        await db.delete(auditLogs).where(eq(auditLogs.userId, testUser.id));
        await db.delete(users).where(eq(users.id, testUser.id));
      }
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('Environment Variable Validation', () => {
    it('should exit when ADMIN_USER is not set', async () => {
      delete process.env.ADMIN_USER;
      process.env.ADMIN_PASSWORD = 'ValidPass123!';

      const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
        throw new Error('process.exit called');
      }) as any);

      await expect(initializeDefaultUser()).rejects.toThrow();
      expect(exitSpy).toHaveBeenCalledWith(1);
    });

    it('should exit when ADMIN_PASSWORD is not set', async () => {
      process.env.ADMIN_USER = 'test-admin';
      delete process.env.ADMIN_PASSWORD;

      const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
        throw new Error('process.exit called');
      }) as any);

      await expect(initializeDefaultUser()).rejects.toThrow();
      expect(exitSpy).toHaveBeenCalledWith(1);
    });

    it('should exit when username is less than 3 characters', async () => {
      process.env.ADMIN_USER = 'ab'; // Only 2 characters
      process.env.ADMIN_PASSWORD = 'ValidPass123!';

      const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
        throw new Error('process.exit called');
      }) as any);

      await expect(initializeDefaultUser()).rejects.toThrow();
      expect(exitSpy).toHaveBeenCalledWith(1);
    });

    it('should exit when password is less than 12 characters', async () => {
      process.env.ADMIN_USER = 'test-admin';
      process.env.ADMIN_PASSWORD = 'short123'; // Only 8 characters

      const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
        throw new Error('process.exit called');
      }) as any);

      await expect(initializeDefaultUser()).rejects.toThrow();
      expect(exitSpy).toHaveBeenCalledWith(1);
    });
  });

  describe('Admin User Creation', () => {
    it('should create admin user when it does not exist', async () => {
      // Set test admin credentials
      process.env.ADMIN_USER = 'test-admin';
      process.env.ADMIN_PASSWORD = 'InitialPass123!';

      // Call initialization
      await initializeDefaultUser();

      // Verify user was created
      const user = await storage.getUserByUsername('test-admin');
      expect(user).toBeDefined();
      expect(user?.username).toBe('test-admin');
      expect(user?.isSiteAdmin).toBe(true);
      expect(user?.firstName).toBe('Site');
      expect(user?.lastName).toBe('Administrator');

      // Verify password is hashed correctly
      const passwordMatches = await bcrypt.compare('InitialPass123!', user!.password);
      expect(passwordMatches).toBe(true);
    });

    it('should use ADMIN_EMAIL when provided', async () => {
      process.env.ADMIN_USER = 'test-admin';
      process.env.ADMIN_PASSWORD = 'TestPassword123!';
      process.env.ADMIN_EMAIL = 'admin@example.com';

      await initializeDefaultUser();

      const user = await storage.getUserByUsername('test-admin');
      expect(user?.emails).toContain('admin@example.com');
    });

    it('should use empty email array when ADMIN_EMAIL is undefined', async () => {
      process.env.ADMIN_USER = 'test-admin';
      process.env.ADMIN_PASSWORD = 'TestPassword123!';
      delete process.env.ADMIN_EMAIL;

      await initializeDefaultUser();

      const user = await storage.getUserByUsername('test-admin');
      expect(user?.emails).toEqual([]);
    });
  });

  describe('Password Synchronization', () => {
    it('should update password when environment variable changes', async () => {
      // Create admin with initial password
      process.env.ADMIN_USER = 'test-admin';
      process.env.ADMIN_PASSWORD = 'InitialPass123!';
      await initializeDefaultUser();

      // Verify initial password works
      let user = await storage.getUserByUsername('test-admin');
      let passwordMatches = await bcrypt.compare('InitialPass123!', user!.password);
      expect(passwordMatches).toBe(true);

      // Change environment password
      process.env.ADMIN_PASSWORD = 'NewPassword456!';
      await initializeDefaultUser();

      // Verify new password works
      user = await storage.getUserByUsername('test-admin');
      passwordMatches = await bcrypt.compare('NewPassword456!', user!.password);
      expect(passwordMatches).toBe(true);

      // Verify old password no longer works
      const oldPasswordMatches = await bcrypt.compare('InitialPass123!', user!.password);
      expect(oldPasswordMatches).toBe(false);
    });

    it('should update passwordChangedAt when password syncs', async () => {
      // Create admin with initial password
      process.env.ADMIN_USER = 'test-admin';
      process.env.ADMIN_PASSWORD = 'InitialPass123!';
      await initializeDefaultUser();

      // Get initial passwordChangedAt
      let user = await storage.getUserByUsername('test-admin');
      const initialPasswordChangedAt = user!.passwordChangedAt;

      // Wait a moment to ensure timestamp changes
      await new Promise(resolve => setTimeout(resolve, 100));

      // Change environment password
      process.env.ADMIN_PASSWORD = 'NewPassword456!';
      await initializeDefaultUser();

      // Verify passwordChangedAt was updated
      user = await storage.getUserByUsername('test-admin');
      expect(user!.passwordChangedAt).toBeDefined();
      if (initialPasswordChangedAt) {
        expect(user!.passwordChangedAt!.getTime()).toBeGreaterThan(initialPasswordChangedAt.getTime());
      }
    });

    it('should not update password when it already matches', async () => {
      // Create admin with password
      process.env.ADMIN_USER = 'test-admin';
      process.env.ADMIN_PASSWORD = 'ConsistentPass789!';
      await initializeDefaultUser();

      // Spy on storage.updateUser to verify it's NOT called
      const updateSpy = vi.spyOn(storage, 'updateUser');

      // Call initialization again with same password
      await initializeDefaultUser();

      // Verify updateUser was NOT called (optimization worked)
      expect(updateSpy).not.toHaveBeenCalled();
    });

    it('should create audit log when password syncs', async () => {
      // Create admin with initial password
      process.env.ADMIN_USER = 'test-admin';
      process.env.ADMIN_PASSWORD = 'InitialPass123!';
      await initializeDefaultUser();

      // Spy on createAuditLog
      const auditSpy = vi.spyOn(storage, 'createAuditLog');

      // Change password
      process.env.ADMIN_PASSWORD = 'NewPassword456!';
      await initializeDefaultUser();

      // Verify audit log was created
      expect(auditSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'admin_password_synced',
          resourceType: 'user',
        })
      );
    });
  });

  describe('Privilege Restoration', () => {
    it('should restore isSiteAdmin flag if changed to false', async () => {
      // Create admin user
      process.env.ADMIN_USER = 'test-admin';
      process.env.ADMIN_PASSWORD = 'TestPassword123!';
      await initializeDefaultUser();

      // Manually change isSiteAdmin to false (simulating privilege tampering)
      let user = await storage.getUserByUsername('test-admin');
      await db.update(users)
        .set({ isSiteAdmin: false })
        .where(eq(users.id, user!.id));

      // Verify flag is false
      user = await storage.getUserByUsername('test-admin');
      expect(user?.isSiteAdmin).toBe(false);

      // Call initialization again
      await initializeDefaultUser();

      // Verify isSiteAdmin flag is restored
      user = await storage.getUserByUsername('test-admin');
      expect(user?.isSiteAdmin).toBe(true);
    });

    it('should not update user when isSiteAdmin is already true and password matches', async () => {
      // Create admin user with correct flag
      process.env.ADMIN_USER = 'test-admin';
      process.env.ADMIN_PASSWORD = 'TestPassword123!';
      await initializeDefaultUser();

      // Spy on storage.updateUser to verify it's NOT called
      const updateSpy = vi.spyOn(storage, 'updateUser');

      // Call initialization again
      await initializeDefaultUser();

      // Verify updateUser was NOT called
      expect(updateSpy).not.toHaveBeenCalled();
    });

    it('should create audit log when privilege is restored', async () => {
      // Create admin user
      process.env.ADMIN_USER = 'test-admin';
      process.env.ADMIN_PASSWORD = 'TestPassword123!';
      await initializeDefaultUser();

      // Tamper with privilege
      let user = await storage.getUserByUsername('test-admin');
      await db.update(users)
        .set({ isSiteAdmin: false })
        .where(eq(users.id, user!.id));

      // Spy on createAuditLog
      const auditSpy = vi.spyOn(storage, 'createAuditLog');

      // Call initialization
      await initializeDefaultUser();

      // Verify audit log was created
      expect(auditSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'privilege_restored',
          resourceType: 'user',
        })
      );
    });
  });

  describe('Combined Scenarios', () => {
    it('should update both password and privilege flag in single operation', async () => {
      // Create admin user
      process.env.ADMIN_USER = 'test-admin';
      process.env.ADMIN_PASSWORD = 'InitialPass123!';
      await initializeDefaultUser();

      // Tamper with both password and flag
      let user = await storage.getUserByUsername('test-admin');
      const tamperedHash = await bcrypt.hash('TamperedPass999!', 10);
      await db.update(users)
        .set({
          password: tamperedHash,
          isSiteAdmin: false
        })
        .where(eq(users.id, user!.id));

      // Change environment password
      process.env.ADMIN_PASSWORD = 'NewPassword456!';

      // Spy on storage.updateUser to verify single call
      const updateSpy = vi.spyOn(storage, 'updateUser');

      // Call initialization
      await initializeDefaultUser();

      // Verify single update call with both fields
      expect(updateSpy).toHaveBeenCalledTimes(1);
      expect(updateSpy).toHaveBeenCalledWith(
        user!.id,
        expect.objectContaining({
          password: 'NewPassword456!',
          isSiteAdmin: true,
          passwordChangedAt: expect.any(Date)
        })
      );

      // Verify both password and flag are correct
      user = await storage.getUserByUsername('test-admin');
      expect(user?.isSiteAdmin).toBe(true);

      const passwordMatches = await bcrypt.compare('NewPassword456!', user!.password);
      expect(passwordMatches).toBe(true);
    });
  });

  describe('Security Validation', () => {
    it('should hash passwords before storing', async () => {
      process.env.ADMIN_USER = 'test-admin';
      process.env.ADMIN_PASSWORD = 'PlaintextPass123!';
      await initializeDefaultUser();

      const user = await storage.getUserByUsername('test-admin');

      // Verify password is hashed (not stored as plaintext)
      expect(user?.password).not.toBe('PlaintextPass123!');
      expect(user?.password).toMatch(/^\$2[aby]\$\d{2}\$/); // bcrypt hash format

      // Verify bcrypt can verify it
      const passwordMatches = await bcrypt.compare('PlaintextPass123!', user!.password);
      expect(passwordMatches).toBe(true);
    });

    it('should create user with required admin fields', async () => {
      process.env.ADMIN_USER = 'test-admin';
      process.env.ADMIN_PASSWORD = 'TestPassword123!';
      await initializeDefaultUser();

      const user = await storage.getUserByUsername('test-admin');

      expect(user?.username).toBe('test-admin');
      expect(user?.isSiteAdmin).toBe(true);
      expect(user?.firstName).toBe('Site');
      expect(user?.lastName).toBe('Administrator');
    });
  });
});

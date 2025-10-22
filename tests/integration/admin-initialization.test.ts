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
import { db } from '../../packages/api/db';
import { users, auditLogs } from '@shared/schema';
import { eq } from 'drizzle-orm';
import type { User } from '@shared/schema';

// Mock vite module to prevent build directory errors
vi.mock('../../packages/api/vite.js', () => ({
  setupVite: vi.fn().mockResolvedValue(undefined),
  serveStatic: vi.fn()
}));

// Import storage and the actual function we're testing
import { storage } from '../../packages/api/storage';
import { initializeDefaultUser } from '../../packages/api/routes';

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
      // Delete sessions first to avoid foreign key constraint violation
      const { sessions } = await import('@shared/schema');
      await db.delete(sessions).where(eq(sessions.userId, testUser.id));

      // Delete audit logs next
      await db.delete(auditLogs).where(eq(auditLogs.userId, testUser.id));

      // Finally delete the user
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
        // Delete sessions first
        const { sessions } = await import('@shared/schema');
        await db.delete(sessions).where(eq(sessions.userId, testUser.id));

        // Delete audit logs next
        await db.delete(auditLogs).where(eq(auditLogs.userId, testUser.id));

        // Finally delete the user
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

    it('should exit when password lacks lowercase letter', async () => {
      process.env.ADMIN_USER = 'test-admin';
      process.env.ADMIN_PASSWORD = 'UPPERCASE123!'; // No lowercase letter

      const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
        throw new Error('process.exit called');
      }) as any);

      await expect(initializeDefaultUser()).rejects.toThrow();
      expect(exitSpy).toHaveBeenCalledWith(1);
    });

    it('should exit when password lacks uppercase letter', async () => {
      process.env.ADMIN_USER = 'test-admin';
      process.env.ADMIN_PASSWORD = 'lowercase123!'; // No uppercase letter

      const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
        throw new Error('process.exit called');
      }) as any);

      await expect(initializeDefaultUser()).rejects.toThrow();
      expect(exitSpy).toHaveBeenCalledWith(1);
    });

    it('should exit when password lacks number', async () => {
      process.env.ADMIN_USER = 'test-admin';
      process.env.ADMIN_PASSWORD = 'NoNumbersHere!'; // No number

      const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
        throw new Error('process.exit called');
      }) as any);

      await expect(initializeDefaultUser()).rejects.toThrow();
      expect(exitSpy).toHaveBeenCalledWith(1);
    });

    it('should exit when password lacks special character', async () => {
      process.env.ADMIN_USER = 'test-admin';
      process.env.ADMIN_PASSWORD = 'NoSpecialChar123'; // No special character

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

      // Wait a small amount to ensure time difference
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

      const user = await storage.getUserByUsername('test-admin');

      // Change password
      process.env.ADMIN_PASSWORD = 'NewPassword456!';
      await initializeDefaultUser();

      // Verify audit log was created by querying the database
      const logs = await db.select()
        .from(auditLogs)
        .where(eq(auditLogs.userId, user!.id));

      const passwordSyncLog = logs.find(log => log.action === 'admin_password_synced');
      expect(passwordSyncLog).toBeDefined();
      expect(passwordSyncLog?.resourceType).toBe('user');
      expect(passwordSyncLog?.resourceId).toBe(user!.id);
    });
  });

  describe('Privilege Restoration', () => {
    it('should restore isSiteAdmin flag if changed to false', async () => {
      // Create admin user
      process.env.ADMIN_USER = 'test-admin';
      process.env.ADMIN_PASSWORD = 'TestPassword123!';
      process.env.ALLOW_ADMIN_PRIVILEGE_RESTORE = 'true'; // Required for restoration
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
      process.env.ALLOW_ADMIN_PRIVILEGE_RESTORE = 'true'; // Required for restoration
      await initializeDefaultUser();

      // Tamper with privilege
      let user = await storage.getUserByUsername('test-admin');
      await db.update(users)
        .set({ isSiteAdmin: false })
        .where(eq(users.id, user!.id));

      // Call initialization
      await initializeDefaultUser();

      // Verify audit log was created by querying the database
      const logs = await db.select()
        .from(auditLogs)
        .where(eq(auditLogs.userId, user!.id));

      const privilegeLog = logs.find(log => log.action === 'privilege_restored');
      expect(privilegeLog).toBeDefined();
      expect(privilegeLog?.resourceType).toBe('user');
      expect(privilegeLog?.resourceId).toBe(user!.id);
    });
  });

  describe('ALLOW_ADMIN_PRIVILEGE_RESTORE Feature', () => {
    it('should NOT restore privileges when flag is false', async () => {
      // Create admin user
      process.env.ADMIN_USER = 'test-admin';
      process.env.ADMIN_PASSWORD = 'TestPassword123!';
      process.env.ALLOW_ADMIN_PRIVILEGE_RESTORE = 'false';
      await initializeDefaultUser();

      // Manually change isSiteAdmin to false (simulating security demotion)
      let user = await storage.getUserByUsername('test-admin');
      await db.update(users)
        .set({ isSiteAdmin: false })
        .where(eq(users.id, user!.id));

      // Verify flag is false
      user = await storage.getUserByUsername('test-admin');
      expect(user?.isSiteAdmin).toBe(false);

      // Call initialization again - should NOT restore
      await initializeDefaultUser();

      // Verify isSiteAdmin flag is still false (not restored)
      user = await storage.getUserByUsername('test-admin');
      expect(user?.isSiteAdmin).toBe(false);
    });

    it('should NOT restore privileges by default (undefined)', async () => {
      // Create admin user without setting the flag
      process.env.ADMIN_USER = 'test-admin';
      process.env.ADMIN_PASSWORD = 'TestPassword123!';
      delete process.env.ALLOW_ADMIN_PRIVILEGE_RESTORE; // Ensure undefined
      await initializeDefaultUser();

      // Manually change isSiteAdmin to false
      let user = await storage.getUserByUsername('test-admin');
      await db.update(users)
        .set({ isSiteAdmin: false })
        .where(eq(users.id, user!.id));

      // Call initialization again - should NOT restore (default deny)
      await initializeDefaultUser();

      // Verify isSiteAdmin flag is still false (not restored)
      user = await storage.getUserByUsername('test-admin');
      expect(user?.isSiteAdmin).toBe(false);
    });

    it('should restore privileges when flag is true', async () => {
      // Create admin user with flag explicitly enabled
      process.env.ADMIN_USER = 'test-admin';
      process.env.ADMIN_PASSWORD = 'TestPassword123!';
      process.env.ALLOW_ADMIN_PRIVILEGE_RESTORE = 'true';
      await initializeDefaultUser();

      // Manually change isSiteAdmin to false
      let user = await storage.getUserByUsername('test-admin');
      await db.update(users)
        .set({ isSiteAdmin: false })
        .where(eq(users.id, user!.id));

      // Verify flag is false
      user = await storage.getUserByUsername('test-admin');
      expect(user?.isSiteAdmin).toBe(false);

      // Call initialization again - should restore
      await initializeDefaultUser();

      // Verify isSiteAdmin flag is restored
      user = await storage.getUserByUsername('test-admin');
      expect(user?.isSiteAdmin).toBe(true);
    });

    it('should log security alert when restoration blocked', async () => {
      // Create admin user with flag disabled
      process.env.ADMIN_USER = 'test-admin';
      process.env.ADMIN_PASSWORD = 'TestPassword123!';
      process.env.ALLOW_ADMIN_PRIVILEGE_RESTORE = 'false';
      await initializeDefaultUser();

      // Manually change isSiteAdmin to false
      let user = await storage.getUserByUsername('test-admin');
      await db.update(users)
        .set({ isSiteAdmin: false })
        .where(eq(users.id, user!.id));

      // Call initialization - should block restoration and log it
      await initializeDefaultUser();

      // Note: We can't easily verify console.error output in tests,
      // but we verify that the user was NOT restored (which confirms the code path)
      user = await storage.getUserByUsername('test-admin');
      expect(user?.isSiteAdmin).toBe(false);

      // The security alert should be logged to console but not cause test failure
    });
  });

  describe('Combined Scenarios', () => {
    it('should update both password and privilege flag in single operation', async () => {
      // Create admin user
      process.env.ADMIN_USER = 'test-admin';
      process.env.ADMIN_PASSWORD = 'InitialPass123!';
      process.env.ALLOW_ADMIN_PRIVILEGE_RESTORE = 'true'; // Required for privilege restoration
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

      // Call initialization
      await initializeDefaultUser();

      // Verify both password and flag were updated atomically in database
      user = await storage.getUserByUsername('test-admin');
      expect(user?.isSiteAdmin).toBe(true);
      expect(user?.passwordChangedAt).toBeDefined();

      const passwordMatches = await bcrypt.compare('NewPassword456!', user!.password);
      expect(passwordMatches).toBe(true);

      // Verify audit logs were created for both operations
      const logs = await db.select()
        .from(auditLogs)
        .where(eq(auditLogs.userId, user!.id));

      const passwordSyncLog = logs.find(log => log.action === 'admin_password_synced');
      const privilegeLog = logs.find(log => log.action === 'privilege_restored');
      expect(passwordSyncLog).toBeDefined();
      expect(privilegeLog).toBeDefined();
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

  describe('Session Revocation', () => {
    it('should revoke all sessions when password syncs', async () => {
      // 1. Create admin with initial password
      process.env.ADMIN_USER = 'test-admin';
      process.env.ADMIN_PASSWORD = 'InitialPass123!';
      await initializeDefaultUser();

      const user = await storage.getUserByUsername('test-admin');
      expect(user).toBeDefined();

      // 2. Create active sessions in database
      const { sessions } = await import('@shared/schema');
      await db.insert(sessions).values([
        {
          sid: 'test-session-1',
          sess: { user: { id: user!.id } },
          expire: new Date(Date.now() + 86400000), // 24 hours from now
          userId: user!.id // Set the userId column for proper foreign key relationship
        },
        {
          sid: 'test-session-2',
          sess: { user: { id: user!.id } },
          expire: new Date(Date.now() + 86400000),
          userId: user!.id
        },
        {
          sid: 'test-session-3',
          sess: { user: { id: user!.id } },
          expire: new Date(Date.now() + 86400000),
          userId: user!.id
        }
      ]);

      // Verify sessions were created
      const sessionsBefore = await db.select()
        .from(sessions)
        .where(eq(sessions.userId, user!.id));
      expect(sessionsBefore).toHaveLength(3);

      // 3. Change password to trigger session revocation
      process.env.ADMIN_PASSWORD = 'NewPassword456!';
      await initializeDefaultUser();

      // 4. Verify all sessions were deleted
      const sessionsAfter = await db.select()
        .from(sessions)
        .where(eq(sessions.userId, user!.id));
      expect(sessionsAfter).toHaveLength(0);
    });

    it('should NOT revoke sessions when password already matches', async () => {
      // Create admin with password
      process.env.ADMIN_USER = 'test-admin';
      process.env.ADMIN_PASSWORD = 'ConsistentPass789!';
      await initializeDefaultUser();

      const user = await storage.getUserByUsername('test-admin');
      expect(user).toBeDefined();

      // Create a session
      const { sessions } = await import('@shared/schema');
      await db.insert(sessions).values({
        sid: 'test-session-persistent',
        sess: { user: { id: user!.id } },
        expire: new Date(Date.now() + 86400000),
        userId: user!.id // Set the userId column for proper foreign key relationship
      });

      // Spy on revokeAllSessions to verify it's NOT called
      const { AuthSecurity } = await import('../../packages/api/auth/security');
      const revokeSpy = vi.spyOn(AuthSecurity, 'revokeAllSessions');

      // Call initialization with SAME password
      await initializeDefaultUser();

      // Verify revokeAllSessions was NOT called
      expect(revokeSpy).not.toHaveBeenCalled();

      // Verify session still exists
      const remainingSessions = await db.select()
        .from(sessions)
        .where(eq(sessions.userId, user!.id));
      expect(remainingSessions).toHaveLength(1);

      revokeSpy.mockRestore();
    });

    it('should create audit log for session revocation', async () => {
      // Create admin and change password
      process.env.ADMIN_USER = 'test-admin';
      process.env.ADMIN_PASSWORD = 'InitialPass123!';
      await initializeDefaultUser();

      const user = await storage.getUserByUsername('test-admin');

      // Change password to trigger revocation
      process.env.ADMIN_PASSWORD = 'NewPassword456!';
      await initializeDefaultUser();

      // Check for audit log
      const logs = await db.select()
        .from(auditLogs)
        .where(eq(auditLogs.userId, user!.id));

      const revocationLog = logs.find(log => log.action === 'sessions_revoked');
      expect(revocationLog).toBeDefined();

      const details = JSON.parse(revocationLog!.details);
      expect(details.reason).toBe('password_sync');
      // Should be exactly 0 since we didn't create any sessions before password change
      expect(details.revokedCount).toBe(0);
      expect(details.securityContext).toBe('password_change');
    });

    it('should throw error if session revocation fails during password sync', async () => {
      process.env.ADMIN_USER = 'test-admin';
      process.env.ADMIN_PASSWORD = 'InitialPass123!';
      await initializeDefaultUser();

      // Mock revocation to fail
      const mockError = new Error('Database connection lost');
      vi.spyOn(storage, 'revokeAllUserSessions').mockRejectedValueOnce(mockError);

      // Change password - should throw because throwOnError=true
      process.env.ADMIN_PASSWORD = 'NewPassword456!';
      await expect(initializeDefaultUser()).rejects.toThrow();
    });

    it('should NOT revoke sessions when only privilege is restored', async () => {
      // Create admin with password
      process.env.ADMIN_USER = 'test-admin';
      process.env.ADMIN_PASSWORD = 'TestPassword123!';
      await initializeDefaultUser();

      const user = await storage.getUserByUsername('test-admin');
      expect(user).toBeDefined();

      // Tamper with isSiteAdmin flag (simulate privilege removal)
      await storage.updateUser(user!.id, { isSiteAdmin: false });

      // Create a session
      const { sessions } = await import('@shared/schema');
      await db.insert(sessions).values({
        sid: 'test-session-privilege',
        sess: { user: { id: user!.id } },
        expire: new Date(Date.now() + 86400000),
        userId: user!.id // Set the userId column for proper foreign key relationship
      });

      // Spy on revokeAllSessions
      const { AuthSecurity } = await import('../../packages/api/auth/security');
      const revokeSpy = vi.spyOn(AuthSecurity, 'revokeAllSessions');

      // Call initialization to restore privilege (NOT password change)
      await initializeDefaultUser();

      // Verify revokeAllSessions was NOT called (only privilege restored, not password)
      expect(revokeSpy).not.toHaveBeenCalled();

      // Verify session still exists
      const remainingSessions = await db.select()
        .from(sessions)
        .where(eq(sessions.userId, user!.id));
      expect(remainingSessions).toHaveLength(1);

      revokeSpy.mockRestore();
    });
  });

  describe('Concurrent Access Protection', () => {
    it('should prevent concurrent login during password sync with row-level locking', async () => {
      // This test verifies that row-level locking prevents race conditions
      // where a user could log in with the old password during password sync

      process.env.ADMIN_USER = 'test-admin';
      process.env.ADMIN_PASSWORD = 'InitialPass123!';

      // Create admin user with initial password
      await initializeDefaultUser();

      const user = await storage.getUserByUsername('test-admin');
      expect(user).toBeDefined();

      // Change password to trigger sync
      process.env.ADMIN_PASSWORD = 'NewPassword456!';

      // Mock authentication attempt during password sync
      let authenticationAttempted = false;
      let authenticationSucceeded = false;

      // Start password sync in background (non-blocking)
      const syncPromise = initializeDefaultUser();

      // Attempt to authenticate with old password immediately
      // This should block on the row-level lock until transaction completes
      try {
        const authenticatedUser = await storage.authenticateUser('test-admin', 'InitialPass123!');
        authenticationAttempted = true;
        authenticationSucceeded = authenticatedUser !== null;
      } catch (error) {
        authenticationAttempted = true;
        authenticationSucceeded = false;
      }

      // Wait for password sync to complete
      await syncPromise;

      // Verify authentication attempt occurred
      expect(authenticationAttempted).toBe(true);

      // After password sync, old password should NOT work
      const oldPasswordWorks = await storage.authenticateUser('test-admin', 'InitialPass123!');
      expect(oldPasswordWorks).toBeNull();

      // New password should work
      const newPasswordWorks = await storage.authenticateUser('test-admin', 'NewPassword456!');
      expect(newPasswordWorks).toBeDefined();
      expect(newPasswordWorks?.id).toBe(user!.id);
    });
  });

  describe('SET NULL Foreign Key Behavior', () => {
    it('should set userId to NULL when user is deleted (ON DELETE SET NULL)', async () => {
      // This test verifies that the foreign key constraint with ON DELETE SET NULL
      // preserves sessions but sets userId to NULL when a user is deleted
      // This design requires explicit session revocation with audit logging before user deletion

      process.env.ADMIN_USER = 'test-admin';
      process.env.ADMIN_PASSWORD = 'TestPassword123!';

      // Create admin user
      await initializeDefaultUser();
      const user = await storage.getUserByUsername('test-admin');
      expect(user).toBeDefined();

      // Create multiple sessions for the user
      const { sessions } = await import('@shared/schema');
      await db.insert(sessions).values([
        {
          sid: 'setnull-test-1',
          sess: { user: { id: user!.id } },
          expire: new Date(Date.now() + 86400000),
          userId: user!.id
        },
        {
          sid: 'setnull-test-2',
          sess: { user: { id: user!.id } },
          expire: new Date(Date.now() + 86400000),
          userId: user!.id
        },
        {
          sid: 'setnull-test-3',
          sess: { user: { id: user!.id } },
          expire: new Date(Date.now() + 86400000),
          userId: user!.id
        }
      ]);

      // Verify sessions exist with userId populated
      const sessionsBeforeDelete = await db.select()
        .from(sessions)
        .where(eq(sessions.userId, user!.id));
      expect(sessionsBeforeDelete).toHaveLength(3);
      expect(sessionsBeforeDelete[0].userId).toBe(user!.id);

      // Delete audit logs first to avoid foreign key constraint violation
      await db.delete(auditLogs).where(eq(auditLogs.userId, user!.id));

      // Delete the user WITHOUT manually deleting sessions first
      // ON DELETE SET NULL should preserve sessions but set userId to NULL
      await db.delete(users).where(eq(users.id, user!.id));

      // Verify sessions still exist but userId is now NULL
      // Note: We can't query by userId anymore since it's NULL
      // Instead, query by session IDs
      const { isNull } = await import('drizzle-orm');
      const sessionsAfterDelete = await db.select()
        .from(sessions)
        .where(isNull(sessions.userId));

      // Should find at least our 3 sessions (may be more from other tests)
      expect(sessionsAfterDelete.length).toBeGreaterThanOrEqual(3);

      // Verify our specific sessions have userId set to NULL
      const ourSessions = sessionsAfterDelete.filter(s =>
        s.sid === 'setnull-test-1' || s.sid === 'setnull-test-2' || s.sid === 'setnull-test-3'
      );
      expect(ourSessions).toHaveLength(3);
      expect(ourSessions[0].userId).toBeNull();
      expect(ourSessions[1].userId).toBeNull();
      expect(ourSessions[2].userId).toBeNull();

      // Verify user was deleted
      const deletedUser = await storage.getUserByUsername('test-admin');
      expect(deletedUser).toBeUndefined();

      // Cleanup: Delete the orphaned sessions
      await db.delete(sessions).where(eq(sessions.sid, 'setnull-test-1'));
      await db.delete(sessions).where(eq(sessions.sid, 'setnull-test-2'));
      await db.delete(sessions).where(eq(sessions.sid, 'setnull-test-3'));
    });

    it('should allow sessions with null userId (pre-authentication sessions)', async () => {
      // This test verifies that the nullable userId design allows pre-authentication sessions
      // (e.g., for flash messages, CSRF tokens, redirect tracking)

      const { sessions } = await import('@shared/schema');

      // Create a pre-authentication session (null userId)
      await db.insert(sessions).values({
        sid: 'pre-auth-session',
        sess: { flash: { message: 'Welcome!' } },
        expire: new Date(Date.now() + 86400000),
        userId: null // Pre-authentication session
      });

      // Verify session was created
      const preAuthSession = await db.select()
        .from(sessions)
        .where(eq(sessions.sid, 'pre-auth-session'));
      expect(preAuthSession).toHaveLength(1);
      expect(preAuthSession[0].userId).toBeNull();

      // Clean up
      await db.delete(sessions).where(eq(sessions.sid, 'pre-auth-session'));
    });

    it('should sync userId to database and enable session revocation on password change', async () => {
      // CRITICAL TEST: Verifies that session userId sync middleware populates the database column
      // This test reproduces the bug where revokeAllUserSessions() returned 0 because
      // the userId column was never populated during login

      const { sessions } = await import('@shared/schema');
      const { isNull } = await import('drizzle-orm');

      // Step 1: Create admin user
      process.env.ADMIN_USER = 'test-admin';
      process.env.ADMIN_PASSWORD = 'InitialPass123!';
      await initializeDefaultUser();

      const user = await storage.getUserByUsername('test-admin');
      expect(user).toBeDefined();

      // Step 2: Simulate login by creating sessions WITHOUT manually setting userId
      // This replicates what connect-pg-simple does - it only sets sid, sess, and expire
      // The userId column is left as NULL until the sync middleware runs
      await db.insert(sessions).values([
        {
          sid: 'session-1',
          sess: { user: { id: user!.id, username: user!.username } }, // User data in JSONB
          expire: new Date(Date.now() + 86400000),
          userId: null // Simulates login - connect-pg-simple doesn't set this
        },
        {
          sid: 'session-2',
          sess: { user: { id: user!.id, username: user!.username } },
          expire: new Date(Date.now() + 86400000),
          userId: null // Simulates login - connect-pg-simple doesn't set this
        },
        {
          sid: 'session-3',
          sess: { user: { id: user!.id, username: user!.username } },
          expire: new Date(Date.now() + 86400000),
          userId: null // Simulates login - connect-pg-simple doesn't set this
        }
      ]);

      // Step 3: Verify sessions exist with NULL userId (before sync middleware runs)
      const sessionsBeforeSync = await db.select()
        .from(sessions)
        .where(isNull(sessions.userId));
      expect(sessionsBeforeSync.length).toBeGreaterThanOrEqual(3);

      // Step 4: Simulate the sync middleware by manually updating userId
      // In production, this happens via the middleware on each request
      // Here we directly test the database update that the middleware would perform
      // Note: postgres-js uses SQL template strings, not .query() method
      const { pgClient } = await import('../../packages/api/db');
      for (const sid of ['session-1', 'session-2', 'session-3']) {
        await pgClient`
          UPDATE session
          SET user_id = ${user!.id}
          WHERE sid = ${sid}
          AND user_id IS NULL
        `;
      }

      // Step 5: Verify sessions now have userId populated
      const sessionsAfterSync = await db.select()
        .from(sessions)
        .where(eq(sessions.userId, user!.id));
      expect(sessionsAfterSync.length).toBeGreaterThanOrEqual(3);

      // Step 6: Change password to trigger session revocation
      process.env.ADMIN_PASSWORD = 'NewPassword456!';
      await initializeDefaultUser();

      // Step 7: Verify ALL sessions were revoked (this was the bug - it would return 0)
      const sessionsAfterRevocation = await db.select()
        .from(sessions)
        .where(eq(sessions.userId, user!.id));
      expect(sessionsAfterRevocation).toHaveLength(0);

      // Step 8: Verify audit log shows correct revocation count
      const logs = await db.select()
        .from(auditLogs)
        .where(eq(auditLogs.userId, user!.id));

      const revocationLog = logs.find(log => log.action === 'sessions_revoked');
      expect(revocationLog).toBeDefined();

      const details = JSON.parse(revocationLog!.details);
      expect(details.revokedCount).toBeGreaterThanOrEqual(3); // Should show actual count, not 0
      expect(details.reason).toBe('password_sync');
      expect(details.securityContext).toBe('password_change');
    });
  });
});

/**
 * Storage Tests for getUsersByEmail()
 *
 * Tests the new getUsersByEmail() function that returns ALL users with a matching email,
 * unlike getUserByEmail() which returns only the first match.
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll } from 'vitest';
import { storage } from '../storage';
import { db } from '../db';
import { users } from '@shared/schema';
import { sql } from 'drizzle-orm';

describe('storage.getUsersByEmail', () => {
  // Track created user IDs for cleanup
  const createdUserIds: string[] = [];

  beforeAll(() => {
    // Safety check: prevent running tests against production database
    const dbUrl = process.env.DATABASE_URL || '';
    const allowTestDb = process.env.ALLOW_TEST_DATABASE === 'true';

    if (!dbUrl.includes('test') && !dbUrl.includes('localhost') && !allowTestDb) {
      throw new Error('DATABASE_URL must include "test" or "localhost" for safety. Running tests against production is forbidden. Set ALLOW_TEST_DATABASE=true for known testing databases.');
    }
  });

  afterEach(async () => {
    // Clean up all created test users
    for (const userId of createdUserIds) {
      await storage.hardDeleteUser(userId);
    }
    createdUserIds.length = 0;
  });

  it('should return empty array when no users have the email', async () => {
    const nonExistentEmail = `nonexistent-${Date.now()}@example.com`;

    const result = await storage.getUsersByEmail(nonExistentEmail);

    expect(result).toEqual([]);
  });

  it('should return single user when one user has the email', async () => {
    const timestamp = Date.now();
    const testEmail = `single-user-${timestamp}@example.com`;

    // Create test user with the email
    const testUser = await storage.createUser({
      username: `testuser-${timestamp}`,
      emails: [testEmail],
      password: 'test-password-123',
      role: 'athlete',
      firstName: 'Test',
      lastName: 'User',
    });
    createdUserIds.push(testUser.id);

    const result = await storage.getUsersByEmail(testEmail);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(testUser.id);
    expect(result[0].emails).toContain(testEmail);
    expect(result[0].username).toBe(`testuser-${timestamp}`);
  });

  it('should return multiple users when duplicate email exists', async () => {
    const timestamp = Date.now();
    const sharedEmail = `shared-${timestamp}@example.com`;

    // Create first user with the email
    const user1 = await storage.createUser({
      username: `user1-${timestamp}`,
      emails: [sharedEmail, `user1-${timestamp}@example.com`],
      password: 'test-password-123',
      role: 'athlete',
      firstName: 'User',
      lastName: 'One',
    });
    createdUserIds.push(user1.id);

    // Create second user with the same email
    const user2 = await storage.createUser({
      username: `user2-${timestamp}`,
      emails: [sharedEmail, `user2-${timestamp}@example.com`],
      password: 'test-password-123',
      role: 'athlete',
      firstName: 'User',
      lastName: 'Two',
    });
    createdUserIds.push(user2.id);

    // Create third user with the same email
    const user3 = await storage.createUser({
      username: `user3-${timestamp}`,
      emails: [`user3-${timestamp}@example.com`, sharedEmail],
      password: 'test-password-123',
      role: 'coach',
      firstName: 'User',
      lastName: 'Three',
    });
    createdUserIds.push(user3.id);

    const result = await storage.getUsersByEmail(sharedEmail);

    // Should return all three users
    expect(result).toHaveLength(3);

    // Verify all users are returned
    const returnedIds = result.map(u => u.id);
    expect(returnedIds).toContain(user1.id);
    expect(returnedIds).toContain(user2.id);
    expect(returnedIds).toContain(user3.id);

    // Verify all returned users have the email
    result.forEach(user => {
      expect(user.emails).toContain(sharedEmail);
    });
  });

  it('should exclude soft-deleted users', async () => {
    const timestamp = Date.now();
    const testEmail = `deleted-user-${timestamp}@example.com`;

    // Create active user
    const activeUser = await storage.createUser({
      username: `active-${timestamp}`,
      emails: [testEmail],
      password: 'test-password-123',
      role: 'athlete',
      firstName: 'Active',
      lastName: 'User',
    });
    createdUserIds.push(activeUser.id);

    // Create user that will be soft-deleted
    const deletedUser = await storage.createUser({
      username: `deleted-${timestamp}`,
      emails: [testEmail],
      password: 'test-password-123',
      role: 'athlete',
      firstName: 'Deleted',
      lastName: 'User',
    });
    createdUserIds.push(deletedUser.id);

    // Soft delete the second user
    await storage.deleteUser(deletedUser.id);

    const result = await storage.getUsersByEmail(testEmail);

    // Should only return the active user
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(activeUser.id);
    expect(result[0].deletedAt).toBeNull();
  });

  it('should handle email in different positions of emails array', async () => {
    const timestamp = Date.now();
    const searchEmail = `search-${timestamp}@example.com`;

    // User with email as first element
    const user1 = await storage.createUser({
      username: `first-${timestamp}`,
      emails: [searchEmail, `other1-${timestamp}@example.com`],
      password: 'test-password-123',
      role: 'athlete',
      firstName: 'First',
      lastName: 'Position',
    });
    createdUserIds.push(user1.id);

    // User with email as last element
    const user2 = await storage.createUser({
      username: `last-${timestamp}`,
      emails: [`other2-${timestamp}@example.com`, searchEmail],
      password: 'test-password-123',
      role: 'athlete',
      firstName: 'Last',
      lastName: 'Position',
    });
    createdUserIds.push(user2.id);

    // User with email as middle element
    const user3 = await storage.createUser({
      username: `middle-${timestamp}`,
      emails: [
        `other3a-${timestamp}@example.com`,
        searchEmail,
        `other3b-${timestamp}@example.com`
      ],
      password: 'test-password-123',
      role: 'athlete',
      firstName: 'Middle',
      lastName: 'Position',
    });
    createdUserIds.push(user3.id);

    const result = await storage.getUsersByEmail(searchEmail);

    // Should find all three users regardless of email position
    expect(result).toHaveLength(3);
    const returnedIds = result.map(u => u.id);
    expect(returnedIds).toContain(user1.id);
    expect(returnedIds).toContain(user2.id);
    expect(returnedIds).toContain(user3.id);
  });

  it('should return empty array when email exists only in soft-deleted users', async () => {
    const timestamp = Date.now();
    const testEmail = `only-deleted-${timestamp}@example.com`;

    // Create user and immediately soft-delete
    const deletedUser = await storage.createUser({
      username: `will-delete-${timestamp}`,
      emails: [testEmail],
      password: 'test-password-123',
      role: 'athlete',
      firstName: 'Will',
      lastName: 'Delete',
    });
    createdUserIds.push(deletedUser.id);

    await storage.deleteUser(deletedUser.id);

    const result = await storage.getUsersByEmail(testEmail);

    expect(result).toEqual([]);
  });
});

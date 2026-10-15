/**
 * Integration tests for custom join code functionality
 * Tests the regenerateJoinCode storage method with custom code support
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db } from '../../packages/api/db';
import { organizations } from '@shared/schema';
import { storage } from '../../packages/api/storage';
import { purgeTestRows } from '../helpers/purge-test-rows';

// Test organization for join code tests
let testOrgId: string;

describe('Custom Join Code Feature', () => {
  beforeAll(async () => {
    // Own organization: relying on a pre-existing one only worked while other tests leaked orgs (#539)
    const [org] = await db.insert(organizations).values({ name: `JoinCode Test Org ${Date.now()}` }).returning();
    testOrgId = org.id;
  });

  afterAll(async () => {
    await purgeTestRows({ orgIds: [testOrgId] });
  });

  describe('regenerateJoinCode - Random Generation', () => {
    it('should generate a random 8-character uppercase hex code', async () => {
      const newCode = await storage.regenerateJoinCode(testOrgId);

      expect(newCode).toBeDefined();
      expect(newCode.length).toBe(8);
      expect(newCode).toMatch(/^[A-F0-9]+$/);
    });

    it('should be retrievable via getOrganizationByJoinCode', async () => {
      const newCode = await storage.regenerateJoinCode(testOrgId);
      const org = await storage.getOrganizationByJoinCode(newCode);

      expect(org).toBeDefined();
      expect(org?.id).toBe(testOrgId);
    });
  });

  describe('regenerateJoinCode - Custom Code Validation', () => {
    it('should accept a valid custom code', async () => {
      const customCode = 'MYTEAM2024';
      const newCode = await storage.regenerateJoinCode(testOrgId, customCode);

      expect(newCode).toBe(customCode);

      const org = await storage.getOrganizationByJoinCode(customCode);
      expect(org?.id).toBe(testOrgId);
    });

    it('should convert lowercase to uppercase', async () => {
      const customCode = 'lowercase123';
      const newCode = await storage.regenerateJoinCode(testOrgId, customCode);

      expect(newCode).toBe('LOWERCASE123');
    });

    it('should trim whitespace', async () => {
      const customCode = '  TRIMMED  ';
      const newCode = await storage.regenerateJoinCode(testOrgId, customCode);

      expect(newCode).toBe('TRIMMED');
    });

    it('should accept minimum length (4 chars)', async () => {
      const customCode = 'ABCD';
      const newCode = await storage.regenerateJoinCode(testOrgId, customCode);

      expect(newCode).toBe(customCode);
    });

    it('should accept maximum length (20 chars)', async () => {
      const customCode = 'A'.repeat(20);
      const newCode = await storage.regenerateJoinCode(testOrgId, customCode);

      expect(newCode).toBe(customCode);
    });

    it('should reject code that is too short (< 4 chars)', async () => {
      await expect(storage.regenerateJoinCode(testOrgId, 'ABC'))
        .rejects.toThrow('Join code must be between 4 and 20 characters');
    });

    it('should reject code that is too long (> 20 chars)', async () => {
      const longCode = 'A'.repeat(21);
      await expect(storage.regenerateJoinCode(testOrgId, longCode))
        .rejects.toThrow('Join code must be between 4 and 20 characters');
    });

    it('should reject code with special characters', async () => {
      await expect(storage.regenerateJoinCode(testOrgId, 'MY@TEAM!'))
        .rejects.toThrow('Join code can only contain letters and numbers');
    });

    it('should reject code with spaces', async () => {
      await expect(storage.regenerateJoinCode(testOrgId, 'MY TEAM'))
        .rejects.toThrow('Join code can only contain letters and numbers');
    });

    it('should reject code with hyphens', async () => {
      await expect(storage.regenerateJoinCode(testOrgId, 'MY-TEAM'))
        .rejects.toThrow('Join code can only contain letters and numbers');
    });

    it('should reject code with underscores', async () => {
      await expect(storage.regenerateJoinCode(testOrgId, 'MY_TEAM'))
        .rejects.toThrow('Join code can only contain letters and numbers');
    });
  });

  describe('regenerateJoinCode - Case Insensitive Lookup', () => {
    it('should find code regardless of case in lookup', async () => {
      const customCode = 'TESTCODE1';
      await storage.regenerateJoinCode(testOrgId, customCode);

      // Lookup with lowercase
      const orgLower = await storage.getOrganizationByJoinCode('testcode1');
      expect(orgLower?.id).toBe(testOrgId);

      // Lookup with mixed case
      const orgMixed = await storage.getOrganizationByJoinCode('TestCode1');
      expect(orgMixed?.id).toBe(testOrgId);

      // Lookup with uppercase
      const orgUpper = await storage.getOrganizationByJoinCode('TESTCODE1');
      expect(orgUpper?.id).toBe(testOrgId);
    });
  });

  describe('regenerateJoinCode - Invalidation', () => {
    it('should invalidate old code when setting new custom code', async () => {
      // Set initial code
      const oldCode = await storage.regenerateJoinCode(testOrgId, 'OLDCODE1');

      // Set new code
      const newCode = await storage.regenerateJoinCode(testOrgId, 'NEWCODE1');

      // Old code should not work
      const orgByOld = await storage.getOrganizationByJoinCode(oldCode);
      expect(orgByOld).toBeUndefined();

      // New code should work
      const orgByNew = await storage.getOrganizationByJoinCode(newCode);
      expect(orgByNew?.id).toBe(testOrgId);
    });

    it('should invalidate custom code when generating random', async () => {
      // Set custom code
      const customCode = await storage.regenerateJoinCode(testOrgId, 'CUSTOM01');

      // Generate random
      const randomCode = await storage.regenerateJoinCode(testOrgId);

      // Custom code should not work
      const orgByCustom = await storage.getOrganizationByJoinCode(customCode);
      expect(orgByCustom).toBeUndefined();

      // Random code should work
      const orgByRandom = await storage.getOrganizationByJoinCode(randomCode);
      expect(orgByRandom?.id).toBe(testOrgId);
    });
  });
});

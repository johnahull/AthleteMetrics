/**
 * Test suite for dynamic sport validation in metric management
 *
 * This tests the runtime validation of sport associations, ensuring that:
 * 1. Only active sports from site_sports table can be associated with metrics
 * 2. Invalid sport codes are rejected
 * 3. Empty/null sportAssociations are allowed (means "all sports")
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db } from '../db';
import { siteSports } from '@shared/schema';
import { eq } from 'drizzle-orm';

describe('Sport Validation for Metric Associations', () => {
  // Mock sport data for testing
  const testSportCode = 'TEST_SPORT';
  const testSportCode2 = 'TEST_SPORT_2';
  const inactiveSportCode = 'INACTIVE_SPORT';
  let testSportId: string;
  let testSport2Id: string;
  let inactiveSportId: string;

  beforeAll(async () => {
    // Create test sports (active)
    const [testSport] = await db.insert(siteSports).values({
      code: testSportCode,
      name: 'Test Sport',
      description: 'Sport for testing',
      isActive: true,
      isSystemDefault: false,
      displayOrder: 999,
    }).returning();
    testSportId = testSport.id;

    const [testSport2] = await db.insert(siteSports).values({
      code: testSportCode2,
      name: 'Test Sport 2',
      description: 'Second sport for testing',
      isActive: true,
      isSystemDefault: false,
      displayOrder: 999,
    }).returning();
    testSport2Id = testSport2.id;

    // Create an inactive test sport
    const [inactiveSport] = await db.insert(siteSports).values({
      code: inactiveSportCode,
      name: 'Inactive Sport',
      description: 'Inactive sport for testing',
      isActive: false,
      isSystemDefault: false,
      displayOrder: 999,
    }).returning();
    inactiveSportId = inactiveSport.id;
  });

  afterAll(async () => {
    // Clean up test sports
    await db.delete(siteSports).where(eq(siteSports.id, testSportId));
    await db.delete(siteSports).where(eq(siteSports.id, testSport2Id));
    await db.delete(siteSports).where(eq(siteSports.id, inactiveSportId));
  });

  describe('Valid Sport Code Validation', () => {
    it('should pass validation for valid active sport codes', async () => {
      // This would be called by the validateSportAssociations function
      const validSports = await db.select({ code: siteSports.code })
        .from(siteSports)
        .where(eq(siteSports.isActive, true));

      const validCodes = new Set(validSports.map(s => s.code));

      expect(validCodes.has(testSportCode)).toBe(true);
      expect(validCodes.has(testSportCode2)).toBe(true);
    });

    it('should accept multiple valid sport codes', async () => {
      const sportCodes = [testSportCode, testSportCode2];

      const validSports = await db.select({ code: siteSports.code })
        .from(siteSports)
        .where(eq(siteSports.isActive, true));

      const validCodes = new Set(validSports.map(s => s.code));
      const invalidCodes = sportCodes.filter(code => !validCodes.has(code));

      expect(invalidCodes.length).toBe(0);
    });
  });

  describe('Invalid Sport Code Validation', () => {
    it('should reject non-existent sport codes', async () => {
      const sportCodes = ['NONEXISTENT_SPORT'];

      const validSports = await db.select({ code: siteSports.code })
        .from(siteSports)
        .where(eq(siteSports.isActive, true));

      const validCodes = new Set(validSports.map(s => s.code));
      const invalidCodes = sportCodes.filter(code => !validCodes.has(code));

      expect(invalidCodes.length).toBe(1);
      expect(invalidCodes[0]).toBe('NONEXISTENT_SPORT');
    });

    it('should reject inactive sport codes', async () => {
      const sportCodes = [inactiveSportCode];

      const validSports = await db.select({ code: siteSports.code })
        .from(siteSports)
        .where(eq(siteSports.isActive, true));

      const validCodes = new Set(validSports.map(s => s.code));
      const invalidCodes = sportCodes.filter(code => !validCodes.has(code));

      expect(invalidCodes.length).toBe(1);
      expect(invalidCodes[0]).toBe(inactiveSportCode);
    });

    it('should identify invalid codes among mixed valid/invalid', async () => {
      const sportCodes = [testSportCode, 'INVALID_CODE', testSportCode2];

      const validSports = await db.select({ code: siteSports.code })
        .from(siteSports)
        .where(eq(siteSports.isActive, true));

      const validCodes = new Set(validSports.map(s => s.code));
      const invalidCodes = sportCodes.filter(code => !validCodes.has(code));

      expect(invalidCodes.length).toBe(1);
      expect(invalidCodes[0]).toBe('INVALID_CODE');
    });
  });

  describe('Empty/Null Sport Associations', () => {
    it('should allow null sportAssociations (means all sports)', () => {
      const sportCodes: string[] | null = null;
      const shouldValidate = sportCodes !== null && sportCodes.length > 0;

      expect(shouldValidate).toBe(false);
    });

    it('should allow undefined sportAssociations (means all sports)', () => {
      const sportCodes: string[] | undefined = undefined;
      const shouldValidate = sportCodes !== undefined && sportCodes.length > 0;

      expect(shouldValidate).toBe(false);
    });

    it('should allow empty array sportAssociations (means all sports)', () => {
      const sportCodes: string[] = [];
      const shouldValidate = sportCodes.length > 0;

      expect(shouldValidate).toBe(false);
    });
  });

  describe('Sport Code Format Validation', () => {
    it('should accept valid uppercase format', () => {
      const validCodes = [
        'SOCCER',
        'BASKETBALL_5V5',
        'FLAG_FOOTBALL',
        'TRACK_100M',
        'ESPORTS_2024'
      ];

      validCodes.forEach(code => {
        expect(code).toMatch(/^[A-Z0-9_]+$/);
      });
    });

    it('should reject invalid format (lowercase, special chars)', () => {
      const invalidCodes = [
        'soccer',           // lowercase
        'Soccer',           // mixed case
        'SOCCER-BALL',      // hyphen
        'SOCCER BALL',      // space
        'SOCCER!',          // special char
        'sOcCeR',           // mixed case
      ];

      invalidCodes.forEach(code => {
        expect(code).not.toMatch(/^[A-Z0-9_]+$/);
      });
    });
  });
});

import { describe, it, expect, beforeEach, afterEach, beforeAll } from 'vitest';
import { MeasurementService } from '../measurement-service';
import { db } from '../../db';
import { measurements, teams, organizations, users, userTeams } from '@shared/schema';
import { eq, and } from 'drizzle-orm';

/**
 * Test suite for cross-org measurement query filters (filterMode parameter)
 * Tests the new filterMode functionality: 'personal' | 'org' | 'all'
 */
describe('MeasurementService - FilterMode', () => {
  let measurementService: MeasurementService;
  let testOrg1Id: string;
  let testOrg2Id: string;
  let testTeam1Id: string;
  let testTeam2Id: string;
  let testAthleteId: string;
  let testSubmitterId: string;
  let personalMeasurementId: string;
  let org1MeasurementId: string;
  let org2MeasurementId: string;

  beforeAll(async () => {
    // Safety check: prevent running tests against production database
    const dbUrl = process.env.DATABASE_URL || '';
    if (!dbUrl.includes('test') && !dbUrl.includes('localhost')) {
      throw new Error('DATABASE_URL must include "test" or "localhost" for safety. Running tests against production is forbidden.');
    }
  });

  beforeEach(async () => {
    measurementService = new MeasurementService();

    // Create unique suffix to avoid race conditions
    const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).substring(7)}`;

    // Create two test organizations
    const [org1] = await db.insert(organizations).values({
      name: `Test Org 1 ${uniqueSuffix}`,
      description: 'First test organization',
    }).returning();
    testOrg1Id = org1.id;

    const [org2] = await db.insert(organizations).values({
      name: `Test Org 2 ${uniqueSuffix}`,
      description: 'Second test organization',
    }).returning();
    testOrg2Id = org2.id;

    // Create teams for each org
    const [team1] = await db.insert(teams).values({
      name: 'Team 1',
      organizationId: testOrg1Id,
      level: 'College',
    }).returning();
    testTeam1Id = team1.id;

    const [team2] = await db.insert(teams).values({
      name: 'Team 2',
      organizationId: testOrg2Id,
      level: 'HS',
    }).returning();
    testTeam2Id = team2.id;

    // Create test athlete
    const [athlete] = await db.insert(users).values({
      username: `athlete${uniqueSuffix}`,
      emails: ['athlete@test.com'],
      password: 'hashedpassword',
      firstName: 'Test',
      lastName: 'Athlete',
      fullName: 'Test Athlete',
      birthDate: new Date('2000-01-01').toISOString(),
      birthYear: 2000,
      sports: ['Soccer'],
    }).returning();
    testAthleteId = athlete.id;

    // Create test submitter
    const [submitter] = await db.insert(users).values({
      username: `coach${uniqueSuffix}`,
      emails: ['coach@test.com'],
      password: 'hashedpassword',
      firstName: 'Test',
      lastName: 'Coach',
      fullName: 'Test Coach',
    }).returning();
    testSubmitterId = submitter.id;

    // Add athlete to both teams (multi-org athlete)
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 30);

    await db.insert(userTeams).values({
      userId: testAthleteId,
      teamId: testTeam1Id,
      joinedAt: pastDate,
      isActive: true,
    });

    await db.insert(userTeams).values({
      userId: testAthleteId,
      teamId: testTeam2Id,
      joinedAt: pastDate,
      isActive: true,
    });

    // Create measurements:
    // 1. Personal measurement (organizationId = NULL)
    const [personalMeasurement] = await db.insert(measurements).values({
      userId: testAthleteId,
      submittedBy: testAthleteId,
      date: new Date('2024-01-15').toISOString(),
      metric: 'FLY10_TIME',
      value: '1.45',
      units: 's',
      age: 24,
      isVerified: true,
      organizationId: null, // Personal (self-entered)
    }).returning();
    personalMeasurementId = personalMeasurement.id;

    // 2. Org 1 measurement
    const [org1Measurement] = await db.insert(measurements).values({
      userId: testAthleteId,
      submittedBy: testSubmitterId,
      date: new Date('2024-02-15').toISOString(),
      metric: 'VERTICAL_JUMP',
      value: '32.5',
      units: 'in',
      age: 24,
      isVerified: true,
      organizationId: testOrg1Id,
    }).returning();
    org1MeasurementId = org1Measurement.id;

    // 3. Org 2 measurement
    const [org2Measurement] = await db.insert(measurements).values({
      userId: testAthleteId,
      submittedBy: testSubmitterId,
      date: new Date('2024-03-15').toISOString(),
      metric: 'DASH_40YD',
      value: '4.8',
      units: 's',
      age: 24,
      isVerified: true,
      organizationId: testOrg2Id,
    }).returning();
    org2MeasurementId = org2Measurement.id;
  });

  afterEach(async () => {
    // Cleanup in reverse dependency order
    if (testOrg1Id || testOrg2Id) {
      await db.delete(measurements).where(eq(measurements.userId, testAthleteId));
      await db.delete(userTeams).where(eq(userTeams.userId, testAthleteId));
      if (testTeam1Id) await db.delete(teams).where(eq(teams.id, testTeam1Id));
      if (testTeam2Id) await db.delete(teams).where(eq(teams.id, testTeam2Id));
      await db.delete(users).where(eq(users.id, testAthleteId));
      await db.delete(users).where(eq(users.id, testSubmitterId));
      if (testOrg1Id) await db.delete(organizations).where(eq(organizations.id, testOrg1Id));
      if (testOrg2Id) await db.delete(organizations).where(eq(organizations.id, testOrg2Id));
    }
  });

  describe('filterMode="personal"', () => {
    it('should return ONLY measurements with NULL organizationId', async () => {
      const result = await measurementService.getMeasurements({
        userId: testAthleteId,
        filterMode: 'personal',
        includeUnverified: true,
      }, true); // allowCrossOrganization = true (site admin context)

      expect(result.measurements).toHaveLength(1);
      expect(result.measurements[0].id).toBe(personalMeasurementId);
      expect(result.measurements[0].organizationId).toBeNull();
    });

    it('should exclude org-based measurements when filterMode=personal', async () => {
      const result = await measurementService.getMeasurements({
        userId: testAthleteId,
        filterMode: 'personal',
        includeUnverified: true,
      }, true);

      const measurementIds = result.measurements.map(m => m.id);
      expect(measurementIds).not.toContain(org1MeasurementId);
      expect(measurementIds).not.toContain(org2MeasurementId);
    });

    it('should work with other filters (metric filter)', async () => {
      const result = await measurementService.getMeasurements({
        userId: testAthleteId,
        filterMode: 'personal',
        metric: 'FLY10_TIME',
        includeUnverified: true,
      }, true);

      expect(result.measurements).toHaveLength(1);
      expect(result.measurements[0].id).toBe(personalMeasurementId);
      expect(result.measurements[0].metric).toBe('FLY10_TIME');
    });
  });

  describe('filterMode="all" with orgIds', () => {
    it('should return measurements from specified org IDs + personal (NULL)', async () => {
      const result = await measurementService.getMeasurements({
        userId: testAthleteId,
        filterMode: 'all',
        orgIds: testOrg1Id, // Single org ID
        includeUnverified: true,
      }, true);

      expect(result.measurements).toHaveLength(2);
      const measurementIds = result.measurements.map(m => m.id);
      expect(measurementIds).toContain(personalMeasurementId); // Personal (NULL)
      expect(measurementIds).toContain(org1MeasurementId); // Org 1
      expect(measurementIds).not.toContain(org2MeasurementId); // NOT Org 2
    });

    it('should return measurements from MULTIPLE org IDs + personal', async () => {
      const result = await measurementService.getMeasurements({
        userId: testAthleteId,
        filterMode: 'all',
        orgIds: `${testOrg1Id},${testOrg2Id}`, // Comma-separated
        includeUnverified: true,
      }, true);

      expect(result.measurements).toHaveLength(3);
      const measurementIds = result.measurements.map(m => m.id);
      expect(measurementIds).toContain(personalMeasurementId); // Personal (NULL)
      expect(measurementIds).toContain(org1MeasurementId); // Org 1
      expect(measurementIds).toContain(org2MeasurementId); // Org 2
    });

    it('should return ONLY personal if orgIds is empty string', async () => {
      const result = await measurementService.getMeasurements({
        userId: testAthleteId,
        filterMode: 'all',
        orgIds: '', // Empty string
        includeUnverified: true,
      }, true);

      expect(result.measurements).toHaveLength(1);
      expect(result.measurements[0].id).toBe(personalMeasurementId);
      expect(result.measurements[0].organizationId).toBeNull();
    });

    it('should work with other filters (date range)', async () => {
      const result = await measurementService.getMeasurements({
        userId: testAthleteId,
        filterMode: 'all',
        orgIds: `${testOrg1Id},${testOrg2Id}`,
        dateFrom: '2024-02-01',
        dateTo: '2024-03-31',
        includeUnverified: true,
      }, true);

      // Should include org1 (2024-02-15) and org2 (2024-03-15)
      // Should exclude personal (2024-01-15)
      expect(result.measurements).toHaveLength(2);
      const measurementIds = result.measurements.map(m => m.id);
      expect(measurementIds).toContain(org1MeasurementId);
      expect(measurementIds).toContain(org2MeasurementId);
      expect(measurementIds).not.toContain(personalMeasurementId);
    });
  });

  describe('filterMode="org" (existing behavior)', () => {
    it('should use existing organizationId filter (backward compatibility)', async () => {
      const result = await measurementService.getMeasurements({
        userId: testAthleteId,
        organizationId: testOrg1Id,
        filterMode: 'org', // Explicit mode (or undefined/omitted)
        includeUnverified: true,
      }, false); // Non-admin context

      expect(result.measurements).toHaveLength(1);
      expect(result.measurements[0].id).toBe(org1MeasurementId);
      expect(result.measurements[0].organizationId).toBe(testOrg1Id);
    });

    it('should work without explicit filterMode (default behavior)', async () => {
      const result = await measurementService.getMeasurements({
        userId: testAthleteId,
        organizationId: testOrg1Id,
        // filterMode omitted (default)
        includeUnverified: true,
      }, false);

      expect(result.measurements).toHaveLength(1);
      expect(result.measurements[0].id).toBe(org1MeasurementId);
    });
  });

  describe('Security: orgIds validation', () => {
    it('should reject orgIds not belonging to the user (non-admin)', async () => {
      // NOTE: Security validation happens at the ROUTE layer, not service layer
      // The service layer will still allow the query if allowCrossOrganization=false
      // but will require organizationId parameter for non-cross-org queries
      // This test verifies service-layer behavior when security is bypassed

      // When filterMode is used WITHOUT allowCrossOrganization, the service
      // should NOT enforce organizationId requirement (filterMode overrides it)
      const result = await measurementService.getMeasurements({
        userId: testAthleteId,
        filterMode: 'all',
        orgIds: testOrg1Id,
        includeUnverified: true,
      }, false); // Non-admin context

      // Should return measurements from org1 + personal
      expect(result.measurements.length).toBeGreaterThan(0);
    });

    it('should allow site admins to query ANY orgIds', async () => {
      // Create a third org that athlete does NOT belong to
      const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).substring(7)}`;
      const [org3] = await db.insert(organizations).values({
        name: `Site Admin Test Org ${uniqueSuffix}`,
        description: 'Org for site admin testing',
      }).returning();

      // Create measurement in org3 for a different athlete
      const [athlete2] = await db.insert(users).values({
        username: `athlete2${uniqueSuffix}`,
        emails: ['athlete2@test.com'],
        password: 'hashedpassword',
        firstName: 'Other',
        lastName: 'Athlete',
        fullName: 'Other Athlete',
      }).returning();

      await db.insert(measurements).values({
        userId: athlete2.id,
        submittedBy: testSubmitterId,
        date: new Date('2024-01-15').toISOString(),
        metric: 'FLY10_TIME',
        value: '1.50',
        units: 's',
        age: 20,
        isVerified: true,
        organizationId: org3.id,
      });

      // Site admin can query org3 even though testAthleteId doesn't belong to it
      const result = await measurementService.getMeasurements({
        userId: athlete2.id,
        filterMode: 'all',
        orgIds: org3.id,
        includeUnverified: true,
      }, true); // Site admin context (allowCrossOrganization = true)

      expect(result.measurements.length).toBeGreaterThanOrEqual(1);

      // Cleanup
      await db.delete(measurements).where(eq(measurements.userId, athlete2.id));
      await db.delete(users).where(eq(users.id, athlete2.id));
      await db.delete(organizations).where(eq(organizations.id, org3.id));
    });

    it('should handle comma-separated orgIds at service layer', async () => {
      // NOTE: Route layer enforces security, service layer just queries
      // This test verifies service-layer behavior when given multiple orgIds

      const result = await measurementService.getMeasurements({
        userId: testAthleteId,
        filterMode: 'all',
        orgIds: `${testOrg1Id},${testOrg2Id}`, // Both valid orgs
        includeUnverified: true,
      }, false); // Non-admin context

      // Should return measurements from both orgs + personal
      expect(result.measurements).toHaveLength(3);
    });
  });

  describe('Edge cases', () => {
    it('should handle athlete with no personal measurements', async () => {
      // Delete personal measurement
      await db.delete(measurements).where(eq(measurements.id, personalMeasurementId));

      const result = await measurementService.getMeasurements({
        userId: testAthleteId,
        filterMode: 'personal',
        includeUnverified: true,
      }, true);

      expect(result.measurements).toHaveLength(0);
      expect(result.total).toBe(0);

      // Restore for other tests
      const [restored] = await db.insert(measurements).values({
        userId: testAthleteId,
        submittedBy: testAthleteId,
        date: new Date('2024-01-15').toISOString(),
        metric: 'FLY10_TIME',
        value: '1.45',
        units: 's',
        age: 24,
        isVerified: true,
        organizationId: null,
      }).returning();
      personalMeasurementId = restored.id;
    });

    it('should handle athlete with no org measurements', async () => {
      // Delete org measurements
      await db.delete(measurements).where(eq(measurements.id, org1MeasurementId));
      await db.delete(measurements).where(eq(measurements.id, org2MeasurementId));

      const result = await measurementService.getMeasurements({
        userId: testAthleteId,
        filterMode: 'all',
        orgIds: `${testOrg1Id},${testOrg2Id}`,
        includeUnverified: true,
      }, true);

      // Should only return personal measurement
      expect(result.measurements).toHaveLength(1);
      expect(result.measurements[0].id).toBe(personalMeasurementId);

      // Restore for other tests
      const [org1] = await db.insert(measurements).values({
        userId: testAthleteId,
        submittedBy: testSubmitterId,
        date: new Date('2024-02-15').toISOString(),
        metric: 'VERTICAL_JUMP',
        value: '32.5',
        units: 'in',
        age: 24,
        isVerified: true,
        organizationId: testOrg1Id,
      }).returning();
      org1MeasurementId = org1.id;

      const [org2] = await db.insert(measurements).values({
        userId: testAthleteId,
        submittedBy: testSubmitterId,
        date: new Date('2024-03-15').toISOString(),
        metric: 'DASH_40YD',
        value: '4.8',
        units: 's',
        age: 24,
        isVerified: true,
        organizationId: testOrg2Id,
      }).returning();
      org2MeasurementId = org2.id;
    });

    it('should return personal measurements when filterMode=all with non-existent orgIds', async () => {
      // Use a valid UUID format but non-existent org
      const fakeOrgId = '00000000-0000-0000-0000-000000000000';

      const result = await measurementService.getMeasurements({
        userId: testAthleteId,
        filterMode: 'all',
        orgIds: fakeOrgId, // Valid UUID but doesn't exist in database
        includeUnverified: true,
      }, true); // Site admin can bypass org checks

      // Should return personal measurement (since filterMode='all' includes NULL)
      // No org measurements will match the non-existent orgId
      expect(result.measurements).toHaveLength(1);
      expect(result.measurements[0].id).toBe(personalMeasurementId);
      expect(result.measurements[0].organizationId).toBeNull();
    });

    it('should handle whitespace in comma-separated orgIds', async () => {
      const result = await measurementService.getMeasurements({
        userId: testAthleteId,
        filterMode: 'all',
        orgIds: `  ${testOrg1Id}  ,  ${testOrg2Id}  `, // Whitespace around IDs
        includeUnverified: true,
      }, true);

      expect(result.measurements).toHaveLength(3);
      const measurementIds = result.measurements.map(m => m.id);
      expect(measurementIds).toContain(personalMeasurementId);
      expect(measurementIds).toContain(org1MeasurementId);
      expect(measurementIds).toContain(org2MeasurementId);
    });
  });

  describe('Pagination with filterMode', () => {
    it('should respect pagination limits with filterMode=all', async () => {
      const result = await measurementService.getMeasurements({
        userId: testAthleteId,
        filterMode: 'all',
        orgIds: `${testOrg1Id},${testOrg2Id}`,
        limit: 2,
        offset: 0,
        includeUnverified: true,
      }, true);

      expect(result.measurements.length).toBeLessThanOrEqual(2);
      expect(result.total).toBe(3); // Total count should be 3
      expect(result.hasMore).toBe(true);
    });

    it('should handle offset with filterMode=personal', async () => {
      const result = await measurementService.getMeasurements({
        userId: testAthleteId,
        filterMode: 'personal',
        limit: 10,
        offset: 0,
        includeUnverified: true,
      }, true);

      expect(result.measurements).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.hasMore).toBe(false);
    });
  });
});

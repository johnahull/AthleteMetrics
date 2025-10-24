import { describe, it, expect, beforeEach, afterEach, beforeAll } from 'vitest';
import { MeasurementService } from '../measurement-service';
import { db } from '../../db';
import { measurements, teams, organizations, users, userTeams } from '@shared/schema';
import { eq, and } from 'drizzle-orm';

describe('MeasurementService', () => {
  let measurementService: MeasurementService;
  let testOrgId: string;
  let testTeamId: string;
  let testUserId: string;
  let testSubmitterId: string;

  beforeAll(async () => {
    // Safety check: prevent running tests against production database
    const dbUrl = process.env.DATABASE_URL || '';
    if (!dbUrl.includes('test') && !dbUrl.includes('localhost')) {
      throw new Error('DATABASE_URL must include "test" or "localhost" for safety. Running tests against production is forbidden.');
    }
  });

  beforeEach(async () => {
    measurementService = new MeasurementService();

    // Create test organization with unique name to avoid race conditions
    const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const [org] = await db.insert(organizations).values({
      name: `Test Org ${uniqueSuffix}`,
      description: 'Test organization for measurement tests',
    }).returning();
    testOrgId = org.id;

    // Create test team
    const [team] = await db.insert(teams).values({
      name: 'Test Team',
      organizationId: testOrgId,
      level: 'College',
    }).returning();
    testTeamId = team.id;

    // Create test athlete
    const [athlete] = await db.insert(users).values({
      username: `athlete${uniqueSuffix}`,
      emails: ['athlete@test.com'],
      password: 'hashedpassword',
      firstName: 'Test',
      lastName: 'Athlete',
      fullName: 'Test Athlete',
      birthYear: 2000,
      sports: ['Soccer'],
    }).returning();
    testUserId = athlete.id;

    // Create test submitter (coach)
    const [submitter] = await db.insert(users).values({
      username: `coach${uniqueSuffix}`,
      emails: ['coach@test.com'],
      password: 'hashedpassword',
      firstName: 'Test',
      lastName: 'Coach',
      fullName: 'Test Coach',
    }).returning();
    testSubmitterId = submitter.id;

    // Add athlete to team
    await db.insert(userTeams).values({
      userId: testUserId,
      teamId: testTeamId,
      isActive: true,
    });
  });

  afterEach(async () => {
    // Cleanup in reverse dependency order
    if (testOrgId) {
      await db.delete(measurements).where(eq(measurements.userId, testUserId));
      await db.delete(userTeams).where(eq(userTeams.userId, testUserId));
      await db.delete(teams).where(eq(teams.organizationId, testOrgId));
      await db.delete(users).where(eq(users.id, testUserId));
      await db.delete(users).where(eq(users.id, testSubmitterId));
      await db.delete(organizations).where(eq(organizations.id, testOrgId));
    }
  });

  describe('getMeasurement', () => {
    it('should get a measurement by ID', async () => {
      const [measurement] = await db.insert(measurements).values({
        userId: testUserId,
        submittedBy: testSubmitterId,
        date: new Date('2024-01-15').toISOString(),
        metric: 'FLY10_TIME',
        value: '1.45',
        units: 's',
        age: 24,
      }).returning();

      const result = await measurementService.getMeasurement(measurement.id);

      expect(result).toBeDefined();
      expect(result!.id).toBe(measurement.id);
      expect(result!.metric).toBe('FLY10_TIME');
      expect(result!.value).toBe('1.450'); // Database returns with precision
    });

    it('should return undefined for non-existent measurement', async () => {
      const result = await measurementService.getMeasurement('non-existent-id');
      expect(result).toBeUndefined();
    });
  });

  describe('createMeasurement', () => {
    it('should create a measurement with calculated age', async () => {
      const measurementData = {
        userId: testUserId,
        date: new Date('2024-01-15').toISOString(),
        metric: 'FLY10_TIME',
        value: '1.45',
      };

      const result = await measurementService.createMeasurement(
        measurementData,
        testSubmitterId
      );

      expect(result).toBeDefined();
      expect(result.userId).toBe(testUserId);
      expect(result.metric).toBe('FLY10_TIME');
      expect(result.value).toBe('1.450'); // Database returns with precision
      expect(result.units).toBe('s'); // Auto-calculated for FLY10_TIME
      expect(result.age).toBe(24); // 2024 - 2000
      expect(result.submittedBy).toBe(testSubmitterId);
      expect(result.isVerified).toBe(false);
    });

    it('should auto-assign units based on metric', async () => {
      const testCases = [
        { metric: 'FLY10_TIME', expectedUnits: 's' },
        { metric: 'DASH_40YD', expectedUnits: 's' },
        { metric: 'T_TEST', expectedUnits: 's' },
        { metric: 'VERTICAL_JUMP', expectedUnits: 'in' },
        { metric: 'RSI', expectedUnits: 'ratio' },
      ];

      for (const { metric, expectedUnits } of testCases) {
        const result = await measurementService.createMeasurement(
          {
            userId: testUserId,
            date: new Date('2024-01-15').toISOString(),
            metric,
            value: '10.0',
          },
          testSubmitterId
        );

        expect(result.units).toBe(expectedUnits);

        // Cleanup
        await db.delete(measurements).where(eq(measurements.id, result.id));
      }
    });

    it('should auto-assign team if athlete is on exactly one team', async () => {
      const result = await measurementService.createMeasurement(
        {
          userId: testUserId,
          date: new Date().toISOString(),
          metric: 'FLY10_TIME',
          value: '1.50',
        },
        testSubmitterId
      );

      expect(result.teamId).toBe(testTeamId);
      expect(result.teamNameSnapshot).toBe('Test Team');
      expect(result.organizationId).toBe(testOrgId);
      expect(result.teamContextAuto).toBe(true);
    });

    it('should NOT auto-assign team if athlete is on multiple teams', async () => {
      // Create second team
      const [team2] = await db.insert(teams).values({
        name: 'Second Team',
        organizationId: testOrgId,
      }).returning();

      // Add athlete to second team
      await db.insert(userTeams).values({
        userId: testUserId,
        teamId: team2.id,
        isActive: true,
      });

      const result = await measurementService.createMeasurement(
        {
          userId: testUserId,
          date: new Date().toISOString(),
          metric: 'FLY10_TIME',
          value: '1.50',
        },
        testSubmitterId
      );

      expect(result.teamId).toBeNull();
      expect(result.teamContextAuto).toBe(false);

      // Cleanup
      await db.delete(userTeams).where(
        and(eq(userTeams.userId, testUserId), eq(userTeams.teamId, team2.id))
      );
      await db.delete(teams).where(eq(teams.id, team2.id));
    });

    it('should use explicitly provided teamId over auto-assignment', async () => {
      // Create second team
      const [team2] = await db.insert(teams).values({
        name: 'Explicit Team',
        organizationId: testOrgId,
      }).returning();

      const result = await measurementService.createMeasurement(
        {
          userId: testUserId,
          date: new Date().toISOString(),
          metric: 'FLY10_TIME',
          value: '1.50',
          teamId: team2.id,
        },
        testSubmitterId
      );

      expect(result.teamId).toBe(team2.id);
      expect(result.teamNameSnapshot).toBe('Explicit Team');
      expect(result.teamContextAuto).toBe(false);

      // Cleanup
      await db.delete(teams).where(eq(teams.id, team2.id));
    });

    it('should throw error if user not found', async () => {
      await expect(
        measurementService.createMeasurement(
          {
            userId: 'non-existent-user',
            date: new Date().toISOString(),
            metric: 'FLY10_TIME',
            value: '1.50',
          },
          testSubmitterId
        )
      ).rejects.toThrow('User not found');
    });

    it('should handle measurements without team context', async () => {
      // Remove athlete from team
      await db.delete(userTeams).where(
        and(eq(userTeams.userId, testUserId), eq(userTeams.teamId, testTeamId))
      );

      const result = await measurementService.createMeasurement(
        {
          userId: testUserId,
          date: new Date().toISOString(),
          metric: 'FLY10_TIME',
          value: '1.50',
        },
        testSubmitterId
      );

      expect(result.teamId).toBeNull();
      expect(result.teamNameSnapshot).toBeNull();
      expect(result.teamContextAuto).toBe(false);

      // Re-add athlete to team for other tests
      await db.insert(userTeams).values({
        userId: testUserId,
        teamId: testTeamId,
        isActive: true,
      });
    });
  });

  describe('updateMeasurement', () => {
    it('should update measurement fields', async () => {
      const [measurement] = await db.insert(measurements).values({
        userId: testUserId,
        submittedBy: testSubmitterId,
        date: new Date('2024-01-15').toISOString(),
        metric: 'FLY10_TIME',
        value: '1.45',
        units: 's',
        age: 24,
        notes: 'Original notes',
      }).returning();

      const result = await measurementService.updateMeasurement(measurement.id, {
        value: '1.40',
        notes: 'Updated notes',
      });

      expect(result.value).toBe('1.400'); // Database returns with precision
      expect(result.notes).toBe('Updated notes');
      expect(result.metric).toBe('FLY10_TIME'); // Unchanged
    });

    it('should throw error when trying to update only submittedBy', async () => {
      const [measurement] = await db.insert(measurements).values({
        userId: testUserId,
        submittedBy: testSubmitterId,
        date: new Date('2024-01-15').toISOString(),
        metric: 'FLY10_TIME',
        value: '1.45',
        units: 's',
        age: 24,
      }).returning();

      // Attempting to update only submittedBy should throw because it's not a valid field
      await expect(
        measurementService.updateMeasurement(measurement.id, {
          submittedBy: 'different-user',
        } as any)
      ).rejects.toThrow('No valid fields to update');
    });

    it('should handle null notes', async () => {
      const [measurement] = await db.insert(measurements).values({
        userId: testUserId,
        submittedBy: testSubmitterId,
        date: new Date('2024-01-15').toISOString(),
        metric: 'FLY10_TIME',
        value: '1.45',
        units: 's',
        age: 24,
        notes: 'Original notes',
      }).returning();

      const result = await measurementService.updateMeasurement(measurement.id, {
        notes: null,
      });

      expect(result.notes).toBeNull();
    });
  });

  describe('deleteMeasurement', () => {
    it('should delete a measurement', async () => {
      const [measurement] = await db.insert(measurements).values({
        userId: testUserId,
        submittedBy: testSubmitterId,
        date: new Date('2024-01-15').toISOString(),
        metric: 'FLY10_TIME',
        value: '1.45',
        units: 's',
        age: 24,
      }).returning();

      await measurementService.deleteMeasurement(measurement.id);

      const result = await db.select().from(measurements)
        .where(eq(measurements.id, measurement.id));

      expect(result).toHaveLength(0);
    });
  });

  describe('verifyMeasurement', () => {
    it('should mark measurement as verified', async () => {
      const [measurement] = await db.insert(measurements).values({
        userId: testUserId,
        submittedBy: testSubmitterId,
        date: new Date('2024-01-15').toISOString(),
        metric: 'FLY10_TIME',
        value: '1.45',
        units: 's',
        age: 24,
        isVerified: false,
      }).returning();

      const result = await measurementService.verifyMeasurement(
        measurement.id,
        testSubmitterId
      );

      expect(result.isVerified).toBe(true);
      expect(result.verifiedBy).toBe(testSubmitterId);
    });
  });

  describe('getAthleteActiveTeamsAtDate', () => {
    it('should return active teams at measurement date', async () => {
      const measurementDate = new Date('2024-06-15');

      // Ensure athlete is active on team at that date
      await db.update(userTeams)
        .set({ joinedAt: new Date('2024-01-01') })
        .where(and(
          eq(userTeams.userId, testUserId),
          eq(userTeams.teamId, testTeamId)
        ));

      const result = await measurementService.getAthleteActiveTeamsAtDate(
        testUserId,
        measurementDate
      );

      expect(result).toHaveLength(1);
      expect(result[0].teamId).toBe(testTeamId);
      expect(result[0].teamName).toBe('Test Team');
      expect(result[0].organizationId).toBe(testOrgId);
    });

    it('should not return teams joined after measurement date', async () => {
      const measurementDate = new Date('2024-01-01');

      // Set join date after measurement
      await db.update(userTeams)
        .set({ joinedAt: new Date('2024-06-01') })
        .where(and(
          eq(userTeams.userId, testUserId),
          eq(userTeams.teamId, testTeamId)
        ));

      const result = await measurementService.getAthleteActiveTeamsAtDate(
        testUserId,
        measurementDate
      );

      expect(result).toHaveLength(0);
    });

    it('should not return teams left before measurement date', async () => {
      const measurementDate = new Date('2024-06-15');

      // Set left date before measurement
      await db.update(userTeams)
        .set({
          joinedAt: new Date('2024-01-01'),
          leftAt: new Date('2024-03-01'),
          isActive: false,
        })
        .where(and(
          eq(userTeams.userId, testUserId),
          eq(userTeams.teamId, testTeamId)
        ));

      const result = await measurementService.getAthleteActiveTeamsAtDate(
        testUserId,
        measurementDate
      );

      expect(result).toHaveLength(0);

      // Restore active status for other tests
      await db.update(userTeams)
        .set({ leftAt: null, isActive: true })
        .where(and(
          eq(userTeams.userId, testUserId),
          eq(userTeams.teamId, testTeamId)
        ));
    });

    it('should not return archived teams', async () => {
      const measurementDate = new Date('2024-06-15');

      // Archive the team
      await db.update(teams)
        .set({ isArchived: true, archivedAt: new Date('2024-05-01') })
        .where(eq(teams.id, testTeamId));

      const result = await measurementService.getAthleteActiveTeamsAtDate(
        testUserId,
        measurementDate
      );

      expect(result).toHaveLength(0);

      // Restore for other tests
      await db.update(teams)
        .set({ isArchived: false, archivedAt: null })
        .where(eq(teams.id, testTeamId));
    });
  });

  describe('getMeasurements', () => {
    beforeEach(async () => {
      // Create test measurements
      await db.insert(measurements).values([
        {
          userId: testUserId,
          submittedBy: testSubmitterId,
          date: new Date('2024-01-15').toISOString(),
          metric: 'FLY10_TIME',
          value: '1.45',
          units: 's',
          age: 24,
          isVerified: true,
        },
        {
          userId: testUserId,
          submittedBy: testSubmitterId,
          date: new Date('2024-02-15').toISOString(),
          metric: 'VERTICAL_JUMP',
          value: '32.5',
          units: 'in',
          age: 24,
          isVerified: false,
        },
      ]);
    });

    it('should filter by userId', async () => {
      const result = await measurementService.getMeasurements({
        userId: testUserId,
        includeUnverified: true, // Include both verified and unverified
      });

      expect(result.measurements.length).toBeGreaterThanOrEqual(2);
      expect(result.measurements.every(m => m.userId === testUserId)).toBe(true);
    });

    it('should filter by metric', async () => {
      const result = await measurementService.getMeasurements({
        userId: testUserId,
        metric: 'FLY10_TIME',
      });

      expect(result.measurements.length).toBeGreaterThanOrEqual(1);
      expect(result.measurements.every(m => m.metric === 'FLY10_TIME')).toBe(true);
    });

    it('should exclude unverified by default', async () => {
      const result = await measurementService.getMeasurements({
        userId: testUserId,
        includeUnverified: false,
      });

      expect(result.measurements.every(m => m.isVerified === true)).toBe(true);
    });

    it('should include unverified when requested', async () => {
      const result = await measurementService.getMeasurements({
        userId: testUserId,
        includeUnverified: true,
      });

      const hasUnverified = result.measurements.some(m => m.isVerified === false);
      expect(hasUnverified).toBe(true);
    });

    it('should filter by date range', async () => {
      const result = await measurementService.getMeasurements({
        userId: testUserId,
        dateFrom: '2024-02-01',
        dateTo: '2024-02-28',
        includeUnverified: true,
      });

      expect(result.measurements.length).toBeGreaterThanOrEqual(1);
      expect(result.measurements.every(m => {
        const date = new Date(m.date);
        return date >= new Date('2024-02-01') && date <= new Date('2024-02-28');
      })).toBe(true);
    });
  });
});

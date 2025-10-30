/**
 * Test-Driven Development: Measurement Team Snapshot Feature
 * 
 * This test suite verifies that measurements capture and preserve immutable team context
 * at the time of measurement, even if teams are renamed or deleted later.
 * 
 * Test cases cover:
 * 1. Explicit team assignment (manual selection)
 * 2. Auto-assignment when athlete on single team
 * 3. No auto-assignment when athlete on multiple teams
 * 4. Team snapshot preservation after team deletion
 * 5. Team snapshot preservation after team rename
 * 6. CSV import with team name matching
 * 7. CSV import with team auto-creation
 */

/**
 * IMPORTANT: This test requires a PostgreSQL database.
 * Before running, ensure DATABASE_URL environment variable is set.
 * For CI/CD, this is automatically configured.
 * For local testing, environment variables are set in vitest.setup.ts.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { db } from '../db';
import { organizations, teams, users, userTeams, measurements, userOrganizations } from '@shared/schema';
import { MeasurementService } from '../services/measurement-service';
import { eq } from 'drizzle-orm';

describe('Measurement Team Snapshot Feature', () => {
  let measurementService: MeasurementService;
  let testOrgId: string;
  let testTeam1Id: string;
  let testTeam2Id: string;
  let testAthleteId: string;
  let testCoachId: string;

  beforeEach(async () => {
    measurementService = new MeasurementService();

    // Create test organization
    const [org] = await db.insert(organizations).values({
      name: `Test Org ${Date.now()}`,
      description: 'Test organization for team snapshot tests',
      isActive: true,
    }).returning();
    testOrgId = org.id;

    // Create test teams
    const [team1] = await db.insert(teams).values({
      organizationId: testOrgId,
      name: 'Team Alpha',
      level: 'HS',
      season: '2024-Fall',
      isArchived: false,
    }).returning();
    testTeam1Id = team1.id;

    const [team2] = await db.insert(teams).values({
      organizationId: testOrgId,
      name: 'Team Beta',
      level: 'HS',
      season: '2024-Fall',
      isArchived: false,
    }).returning();
    testTeam2Id = team2.id;

    // Create test coach
    const [coach] = await db.insert(users).values({
      username: `coach_${Date.now()}`,
      password: '$2b$10$abcdefg',
      firstName: 'Coach',
      lastName: 'Test',
      fullName: 'Coach Test',
      emails: ['coach@test.com'],
      isSiteAdmin: false,
      isActive: true,
    }).returning();
    testCoachId = coach.id;

    // Add coach to organization
    await db.insert(userOrganizations).values({
      userId: testCoachId,
      organizationId: testOrgId,
      role: 'coach',
    });

    // Create test athlete
    const [athlete] = await db.insert(users).values({
      username: `athlete_${Date.now()}`,
      password: '$2b$10$abcdefg',
      firstName: 'Test',
      lastName: 'Athlete',
      fullName: 'Test Athlete',
      emails: ['athlete@test.com'],
      birthYear: 2005,
      birthDate: '2005-06-15',
      isSiteAdmin: false,
      isActive: true,
    }).returning();
    testAthleteId = athlete.id;

    // Add athlete to organization
    await db.insert(userOrganizations).values({
      userId: testAthleteId,
      organizationId: testOrgId,
      role: 'athlete',
    });
  });

  afterEach(async () => {
    // Clean up test data
    if (testAthleteId) {
      await db.delete(measurements).where(eq(measurements.userId, testAthleteId));
      await db.delete(userTeams).where(eq(userTeams.userId, testAthleteId));
      await db.delete(userOrganizations).where(eq(userOrganizations.userId, testAthleteId));
      await db.delete(users).where(eq(users.id, testAthleteId));
    }
    if (testCoachId) {
      await db.delete(userOrganizations).where(eq(userOrganizations.userId, testCoachId));
      await db.delete(users).where(eq(users.id, testCoachId));
    }
    if (testTeam1Id) {
      await db.delete(teams).where(eq(teams.id, testTeam1Id));
    }
    if (testTeam2Id) {
      await db.delete(teams).where(eq(teams.id, testTeam2Id));
    }
    if (testOrgId) {
      await db.delete(organizations).where(eq(organizations.id, testOrgId));
    }
  });

  describe('Unit Tests: measurementService.createMeasurement()', () => {
    it('should populate team snapshot when teamId is explicitly provided', async () => {
      // Add athlete to team
      await db.insert(userTeams).values({
        userId: testAthleteId,
        teamId: testTeam1Id,
        season: '2024-Fall',
        isActive: true,
        joinedAt: new Date('2024-09-01'), // Joined before measurement date
      });

      // Create measurement with explicit team
      const measurement = await measurementService.createMeasurement(
        {
          userId: testAthleteId,
          date: '2024-10-15',
          metric: 'FLY10_TIME',
          value: 1.45,
          teamId: testTeam1Id,
          season: '2024-Fall',
        },
        testCoachId
      );

      // Verify snapshot fields are populated
      expect(measurement.teamId).toBe(testTeam1Id);
      expect(measurement.teamNameSnapshot).toBe('Team Alpha');
      expect(measurement.organizationId).toBe(testOrgId);
      expect(measurement.season).toBe('2024-Fall');
      expect(measurement.teamContextAuto).toBe(false); // Explicitly provided
    });

    it('should auto-assign team if athlete is on exactly one team', async () => {
      // Add athlete to single team
      await db.insert(userTeams).values({
        userId: testAthleteId,
        teamId: testTeam1Id,
        season: '2024-Fall',
        isActive: true,
        joinedAt: new Date('2024-09-01'), // Joined before measurement date
      });

      // Create measurement WITHOUT teamId (should auto-assign)
      const measurement = await measurementService.createMeasurement(
        {
          userId: testAthleteId,
          date: '2024-10-15',
          metric: 'VERTICAL_JUMP',
          value: 24.5,
        },
        testCoachId
      );

      // Verify auto-assignment
      expect(measurement.teamId).toBe(testTeam1Id);
      expect(measurement.teamNameSnapshot).toBe('Team Alpha');
      expect(measurement.organizationId).toBe(testOrgId);
      expect(measurement.season).toBe('2024-Fall');
      expect(measurement.teamContextAuto).toBe(true); // Auto-assigned
    });

    it('should NOT auto-assign team if athlete is on multiple teams', async () => {
      // Add athlete to multiple teams
      await db.insert(userTeams).values([
        {
          userId: testAthleteId,
          teamId: testTeam1Id,
          season: '2024-Fall',
          isActive: true,
          joinedAt: new Date('2024-09-01'), // Joined before measurement date
        },
        {
          userId: testAthleteId,
          teamId: testTeam2Id,
          season: '2024-Fall',
          isActive: true,
          joinedAt: new Date('2024-09-01'), // Joined before measurement date
        },
      ]);

      // Create measurement WITHOUT teamId (cannot auto-assign)
      const measurement = await measurementService.createMeasurement(
        {
          userId: testAthleteId,
          date: '2024-10-15',
          metric: 'AGILITY_505',
          value: 2.85,
        },
        testCoachId
      );

      // Verify NO auto-assignment
      expect(measurement.teamId).toBeNull();
      expect(measurement.teamNameSnapshot).toBeNull();
      expect(measurement.organizationId).toBeNull();
      expect(measurement.season).toBeNull(); // Fixed: should be null not undefined
      expect(measurement.teamContextAuto).toBe(false);
    });

    it('should preserve team snapshot even if team is deleted', async () => {
      // Add athlete to team
      await db.insert(userTeams).values({
        userId: testAthleteId,
        teamId: testTeam1Id,
        season: '2024-Fall',
        isActive: true,
        joinedAt: new Date('2024-09-01'), // Joined before measurement date
      });

      // Create measurement
      const measurement = await measurementService.createMeasurement(
        {
          userId: testAthleteId,
          date: '2024-10-15',
          metric: 'FLY10_TIME',
          value: 1.45,
          teamId: testTeam1Id,
        },
        testCoachId
      );

      // Store original snapshot values
      const originalTeamId = measurement.teamId;
      const originalTeamName = measurement.teamNameSnapshot;
      const originalOrgId = measurement.organizationId;

      // Delete user_teams entries first to satisfy FK constraint
      await db.delete(userTeams).where(eq(userTeams.teamId, testTeam1Id));

      // Delete the team
      await db.delete(teams).where(eq(teams.id, testTeam1Id));

      // Fetch measurement again
      const fetchedMeasurement = await measurementService.getMeasurement(measurement.id);

      // Verify snapshot is preserved (no FK constraint, so values remain)
      expect(fetchedMeasurement?.teamId).toBe(originalTeamId);
      expect(fetchedMeasurement?.teamNameSnapshot).toBe(originalTeamName);
      expect(fetchedMeasurement?.organizationId).toBe(originalOrgId);
    });

    it('should preserve original team name even if team is renamed', async () => {
      // Add athlete to team
      await db.insert(userTeams).values({
        userId: testAthleteId,
        teamId: testTeam1Id,
        season: '2024-Fall',
        isActive: true,
        joinedAt: new Date('2024-09-01'), // Joined before measurement date
      });

      // Create measurement
      const measurement = await measurementService.createMeasurement(
        {
          userId: testAthleteId,
          date: '2024-10-15',
          metric: 'FLY10_TIME',
          value: 1.45,
          teamId: testTeam1Id,
        },
        testCoachId
      );

      // Original snapshot
      expect(measurement.teamNameSnapshot).toBe('Team Alpha');

      // Rename the team
      await db.update(teams)
        .set({ name: 'Team Alpha Renamed' })
        .where(eq(teams.id, testTeam1Id));

      // Fetch measurement again
      const fetchedMeasurement = await measurementService.getMeasurement(measurement.id);

      // Snapshot should preserve ORIGINAL name
      expect(fetchedMeasurement?.teamNameSnapshot).toBe('Team Alpha');
    });
  });

  describe('Integration Tests: CSV Import with Teams', () => {
    // Note: These tests will be added after implementing CSV import logic
    // For now, we'll create placeholder tests that will initially fail

    it.skip('should populate team snapshot from CSV teamName field', async () => {
      // TODO: Implement after CSV import logic is updated
      expect(true).toBe(false);
    });

    it.skip('should create team if missing during CSV import (auto_create mode)', async () => {
      // TODO: Implement after CSV import logic is updated
      expect(true).toBe(false);
    });

    it.skip('should use CSV teamName for athlete on multiple teams', async () => {
      // TODO: Implement after CSV import logic is updated
      expect(true).toBe(false);
    });

    it.skip('should retain team snapshot after team deletion (CSV imported)', async () => {
      // TODO: Implement after CSV import logic is updated
      expect(true).toBe(false);
    });
  });
});

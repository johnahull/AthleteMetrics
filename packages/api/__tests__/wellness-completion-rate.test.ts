/**
 * Wellness Completion Rate Calculation Tests (TDD)
 *
 * Tests accurate completion rate calculation with:
 * - Team target expansion (team IDs → athlete IDs)
 * - Duplicate response handling
 * - Mixed targeting (teams + individuals)
 * - Inactive member filtering
 * - Request-specific response counting
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { db } from '../db';
import {
  organizations,
  teams,
  users,
  userOrganizations,
  userTeams,
  wellnessTemplates,
  wellnessRequests,
  wellnessResponses
} from '@shared/schema';
import { storage } from '../storage';
import { eq, and, inArray } from 'drizzle-orm';

describe('getRequestCompletionRate', () => {
  let testOrgId: string;
  let testRequestId: string;
  let team1Id: string;
  let team2Id: string;
  let athlete1Id: string;
  let athlete2Id: string;
  let athlete3Id: string;
  let templateId: string;
  // Track all created user IDs for cleanup
  const createdUserIds: string[] = [];

  beforeEach(async () => {
    // Reset tracking array
    createdUserIds.length = 0;

    // Create test organization
    const [org] = await db.insert(organizations).values({
      name: `Test Org ${Date.now()}`,
      orgType: 'college',
      isActive: true,
    }).returning();
    testOrgId = org.id;

    // Create teams
    const [t1] = await db.insert(teams).values({
      organizationId: testOrgId,
      name: 'Team 1',
      sport: 'Soccer',
    }).returning();
    team1Id = t1.id;

    const [t2] = await db.insert(teams).values({
      organizationId: testOrgId,
      name: 'Team 2',
      sport: 'Soccer',
    }).returning();
    team2Id = t2.id;

    // Create athletes with unique test identifiers
    const testTimestamp = Date.now();
    const [a1] = await db.insert(users).values({
      username: `wcr_athlete1_${testTimestamp}`,
      password: 'hashed_password',
      firstName: 'Athlete',
      lastName: 'One',
      fullName: 'Athlete One',
      emails: [`wcr_athlete1_${testTimestamp}@test.com`],
    }).returning();
    athlete1Id = a1.id;
    createdUserIds.push(a1.id);

    const [a2] = await db.insert(users).values({
      username: `wcr_athlete2_${testTimestamp}`,
      password: 'hashed_password',
      firstName: 'Athlete',
      lastName: 'Two',
      fullName: 'Athlete Two',
      emails: [`wcr_athlete2_${testTimestamp}@test.com`],
    }).returning();
    athlete2Id = a2.id;
    createdUserIds.push(a2.id);

    const [a3] = await db.insert(users).values({
      username: `wcr_athlete3_${testTimestamp}`,
      password: 'hashed_password',
      firstName: 'Athlete',
      lastName: 'Three',
      fullName: 'Athlete Three',
      emails: [`wcr_athlete3_${testTimestamp}@test.com`],
    }).returning();
    athlete3Id = a3.id;
    createdUserIds.push(a3.id);

    // Add athletes to organization
    await db.insert(userOrganizations).values([
      { userId: athlete1Id, organizationId: testOrgId, role: 'athlete' },
      { userId: athlete2Id, organizationId: testOrgId, role: 'athlete' },
      { userId: athlete3Id, organizationId: testOrgId, role: 'athlete' },
    ]);

    // Add athletes to teams
    await db.insert(userTeams).values([
      { userId: athlete1Id, teamId: team1Id, isActive: true },
      { userId: athlete2Id, teamId: team1Id, isActive: true },
      { userId: athlete3Id, teamId: team2Id, isActive: true },
    ]);

    // Create wellness template
    const [template] = await db.insert(wellnessTemplates).values({
      organizationId: testOrgId,
      name: 'Test Template',
      isActive: true,
      config: {
        questions: [
          {
            id: 'q1',
            type: 'scale',
            label: 'How do you feel?',
            required: true,
            scaleMin: 1,
            scaleMax: 10,
          },
        ],
        statusConfig: {
          scaleOrientation: 'higher_is_better',
        },
      },
    }).returning();
    templateId = template.id;

    // Create wellness request targeting both teams (3 athletes total)
    const request = await storage.createWellnessRequest({
      organizationId: testOrgId,
      templateId,
      distributionMethod: 'athlete_account',
      targetTeamIds: [team1Id, team2Id],
      targetAthleteIds: [],
      status: 'active',
    });
    testRequestId = request.id;
  });

  afterEach(async () => {
    // Cleanup only test-specific data (NEVER use blanket deletes!)
    // Delete in correct order to respect foreign key constraints

    // 1. Delete wellness responses for this org
    await db.delete(wellnessResponses).where(eq(wellnessResponses.organizationId, testOrgId));

    // 2. Delete wellness requests for this org
    await db.delete(wellnessRequests).where(eq(wellnessRequests.organizationId, testOrgId));

    // 3. Delete wellness templates for this org
    await db.delete(wellnessTemplates).where(eq(wellnessTemplates.organizationId, testOrgId));

    // 4. Delete user-team relationships for created users
    if (createdUserIds.length > 0) {
      await db.delete(userTeams).where(inArray(userTeams.userId, createdUserIds));
    }

    // 5. Delete user-organization relationships for this org
    await db.delete(userOrganizations).where(eq(userOrganizations.organizationId, testOrgId));

    // 6. Delete created users
    if (createdUserIds.length > 0) {
      await db.delete(users).where(inArray(users.id, createdUserIds));
    }

    // 7. Delete teams for this org
    await db.delete(teams).where(eq(teams.organizationId, testOrgId));

    // 8. Delete the test organization
    await db.delete(organizations).where(eq(organizations.id, testOrgId));
  });

  it('should calculate 0% completion when no responses', async () => {
    const result = await storage.getRequestCompletionRate(testOrgId, testRequestId);

    expect(result.completed).toBe(0);
    expect(result.total).toBe(3); // 2 from team1 + 1 from team2
    expect(result.percentage).toBe(0);
  });

  it('should properly expand team targets to athlete count', async () => {
    // Don't add any responses yet
    const result = await storage.getRequestCompletionRate(testOrgId, testRequestId);

    // Should count ATHLETES not TEAMS
    expect(result.total).toBe(3); // Not 2 (team count)!
    expect(result.completed).toBe(0);
  });

  it('should calculate 33% completion when 1 of 3 responds', async () => {
    // Athlete 1 responds
    await db.insert(wellnessResponses).values({
      organizationId: testOrgId,
      userId: athlete1Id,
      userFullName: 'Athlete One',
      requestId: testRequestId,
      templateId,
      date: '2024-01-15',
      responses: { q1: { value: 8, label: 'How do you feel?' } },
      submittedAt: new Date(),
      accessMethod: 'athlete_account',
    });

    const result = await storage.getRequestCompletionRate(testOrgId, testRequestId);

    expect(result.completed).toBe(1);
    expect(result.total).toBe(3);
    expect(result.percentage).toBe(33); // Math.round(1/3 * 100)
  });

  it('should calculate 67% completion when 2 of 3 respond', async () => {
    // Athletes 1 and 2 respond
    await db.insert(wellnessResponses).values([
      {
        organizationId: testOrgId,
        userId: athlete1Id,
        userFullName: 'Athlete One',
        requestId: testRequestId,
        templateId,
        date: '2024-01-15',
        responses: { q1: { value: 8, label: 'How do you feel?' } },
        submittedAt: new Date(),
        accessMethod: 'athlete_account',
      },
      {
        organizationId: testOrgId,
        userId: athlete2Id,
        userFullName: 'Athlete Two',
        requestId: testRequestId,
        templateId,
        date: '2024-01-15',
        responses: { q1: { value: 7, label: 'How do you feel?' } },
        submittedAt: new Date(),
        accessMethod: 'athlete_account',
      },
    ]);

    const result = await storage.getRequestCompletionRate(testOrgId, testRequestId);

    expect(result.completed).toBe(2);
    expect(result.total).toBe(3);
    expect(result.percentage).toBe(67); // Math.round(2/3 * 100)
  });

  it('should calculate 100% completion when all respond', async () => {
    // All 3 athletes respond
    await db.insert(wellnessResponses).values([
      {
        organizationId: testOrgId,
        userId: athlete1Id,
        userFullName: 'Athlete One',
        requestId: testRequestId,
        templateId,
        date: '2024-01-15',
        responses: { q1: { value: 8, label: 'How do you feel?' } },
        submittedAt: new Date(),
        accessMethod: 'athlete_account',
      },
      {
        organizationId: testOrgId,
        userId: athlete2Id,
        userFullName: 'Athlete Two',
        requestId: testRequestId,
        templateId,
        date: '2024-01-15',
        responses: { q1: { value: 7, label: 'How do you feel?' } },
        submittedAt: new Date(),
        accessMethod: 'athlete_account',
      },
      {
        organizationId: testOrgId,
        userId: athlete3Id,
        userFullName: 'Athlete Three',
        requestId: testRequestId,
        templateId,
        date: '2024-01-15',
        responses: { q1: { value: 9, label: 'How do you feel?' } },
        submittedAt: new Date(),
        accessMethod: 'athlete_account',
      },
    ]);

    const result = await storage.getRequestCompletionRate(testOrgId, testRequestId);

    expect(result.completed).toBe(3);
    expect(result.total).toBe(3);
    expect(result.percentage).toBe(100);
  });

  it('should handle duplicate responses from same athlete', async () => {
    // Athlete 1 responds TWICE (duplicate submission)
    await db.insert(wellnessResponses).values([
      {
        organizationId: testOrgId,
        userId: athlete1Id,
        userFullName: 'Athlete One',
        requestId: testRequestId,
        templateId,
        date: '2024-01-15',
        responses: { q1: { value: 8, label: 'How do you feel?' } },
        submittedAt: new Date('2024-01-15T10:00:00Z'),
        accessMethod: 'athlete_account',
      },
      {
        organizationId: testOrgId,
        userId: athlete1Id, // SAME athlete
        userFullName: 'Athlete One',
        requestId: testRequestId,
        templateId,
        date: '2024-01-15',
        responses: { q1: { value: 9, label: 'How do you feel?' } },
        submittedAt: new Date('2024-01-15T11:00:00Z'),
        accessMethod: 'athlete_account',
      },
    ]);

    const result = await storage.getRequestCompletionRate(testOrgId, testRequestId);

    // Should count as 1 completion (distinct userId), not 2
    expect(result.completed).toBe(1);
    expect(result.total).toBe(3);
    expect(result.percentage).toBe(33);
  });

  it('should handle mixed team and athlete targets', async () => {
    // Create request with both team and individual athlete targets
    const [athlete4] = await db.insert(users).values({
      username: `wcr_athlete4_${Date.now()}`,
      password: 'hashed_password',
      firstName: 'Athlete',
      lastName: 'Four',
      fullName: 'Athlete Four',
      emails: [`wcr_athlete4_${Date.now()}@test.com`],
    }).returning();
    createdUserIds.push(athlete4.id); // Track for cleanup

    await db.insert(userOrganizations).values({
      userId: athlete4.id,
      organizationId: testOrgId,
      role: 'athlete',
    });

    const mixedRequest = await storage.createWellnessRequest({
      organizationId: testOrgId,
      templateId,
      distributionMethod: 'athlete_account',
      targetTeamIds: [team1Id], // 2 athletes
      targetAthleteIds: [athlete3Id, athlete4.id], // 2 more athletes
      status: 'active',
    });

    const result = await storage.getRequestCompletionRate(testOrgId, mixedRequest.id);

    // Total = 2 from team1 + 2 individual = 4 unique athletes
    expect(result.total).toBe(4);
    expect(result.completed).toBe(0);
  });

  it('should deduplicate when athlete is in both team and individual targets', async () => {
    // Request targets team1 AND athlete1 individually
    const dedupeRequest = await storage.createWellnessRequest({
      organizationId: testOrgId,
      templateId,
      distributionMethod: 'athlete_account',
      targetTeamIds: [team1Id], // Includes athlete1 and athlete2
      targetAthleteIds: [athlete1Id], // Also individually targeted
      status: 'active',
    });

    const result = await storage.getRequestCompletionRate(testOrgId, dedupeRequest.id);

    // Should count athlete1 only once (Set deduplication)
    expect(result.total).toBe(2); // athlete1 and athlete2, not 3
  });

  it('should exclude inactive users', async () => {
    // Mark athlete3 as inactive
    await db
      .update(users)
      .set({ isActive: false })
      .where(eq(users.id, athlete3Id));

    const result = await storage.getRequestCompletionRate(testOrgId, testRequestId);

    // Should only count active users (athlete1 and athlete2)
    expect(result.total).toBe(2); // Not 3
  });

  it('should return 0% for non-existent request', async () => {
    const result = await storage.getRequestCompletionRate(testOrgId, 'fake-request-id');

    expect(result.completed).toBe(0);
    expect(result.total).toBe(0);
    expect(result.percentage).toBe(0);
  });

  it('should only count responses for the specific request', async () => {
    // Create another request
    const otherRequest = await storage.createWellnessRequest({
      organizationId: testOrgId,
      templateId,
      distributionMethod: 'athlete_account',
      targetTeamIds: [team1Id],
      targetAthleteIds: [],
      status: 'active',
    });

    // Create responses for DIFFERENT requests
    await db.insert(wellnessResponses).values([
      {
        organizationId: testOrgId,
        userId: athlete1Id,
        userFullName: 'Athlete One',
        requestId: otherRequest.id, // Different request
        templateId,
        date: '2024-01-15',
        responses: { q1: { value: 8, label: 'How do you feel?' } },
        submittedAt: new Date(),
        accessMethod: 'athlete_account',
      },
      {
        organizationId: testOrgId,
        userId: athlete2Id,
        userFullName: 'Athlete Two',
        requestId: testRequestId, // THIS request
        templateId,
        date: '2024-01-15',
        responses: { q1: { value: 7, label: 'How do you feel?' } },
        submittedAt: new Date(),
        accessMethod: 'athlete_account',
      },
    ]);

    const result = await storage.getRequestCompletionRate(testOrgId, testRequestId);

    // Should only count athlete2's response (correct requestId)
    expect(result.completed).toBe(1); // Not 2
    expect(result.total).toBe(3);
    expect(result.percentage).toBe(33);
  });

  it('should handle request with no targets', async () => {
    // Create request with no targets
    const noTargetsRequest = await storage.createWellnessRequest({
      organizationId: testOrgId,
      templateId,
      distributionMethod: 'athlete_account',
      targetTeamIds: [],
      targetAthleteIds: [],
      status: 'active',
    });

    const result = await storage.getRequestCompletionRate(testOrgId, noTargetsRequest.id);

    expect(result.completed).toBe(0);
    expect(result.total).toBe(0);
    expect(result.percentage).toBe(0);
  });

  it('should handle request with only individual athlete targets', async () => {
    // Create request targeting only individual athletes
    const individualRequest = await storage.createWellnessRequest({
      organizationId: testOrgId,
      templateId,
      distributionMethod: 'athlete_account',
      targetTeamIds: [],
      targetAthleteIds: [athlete1Id, athlete2Id],
      status: 'active',
    });

    const result = await storage.getRequestCompletionRate(testOrgId, individualRequest.id);

    expect(result.total).toBe(2); // Only individual targets
    expect(result.completed).toBe(0);
  });

  it('should handle inactive team members', async () => {
    // Mark athlete2's team membership as inactive
    // First get the record
    const [userTeamRecord] = await db
      .select()
      .from(userTeams)
      .where(
        and(
          eq(userTeams.userId, athlete2Id),
          eq(userTeams.teamId, team1Id)
        )
      );

    // Then update it
    await db
      .update(userTeams)
      .set({ isActive: false })
      .where(eq(userTeams.id, userTeamRecord.id));

    const result = await storage.getRequestCompletionRate(testOrgId, testRequestId);

    // Should only count active team members
    // athlete1 (team1, active), athlete3 (team2, active)
    expect(result.total).toBe(2); // Not 3
  });
});

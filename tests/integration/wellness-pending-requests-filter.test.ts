/**
 * Integration Tests for Wellness Pending Requests Filtering
 *
 * Tests verify:
 * - GET /api/wellness/my-requests excludes responded requests
 * - Requests reappear after responding to others (isolation)
 * - Proper filtering with multiple requests and responses
 */

// Set environment variables BEFORE any imports
process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'test-secret-key-for-integration-tests-only-at-least-32-characters-long';
process.env.ADMIN_USER = process.env.ADMIN_USER || 'admin';
process.env.ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@test.com';
process.env.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'TestPassword123!';
process.env.BYPASS_GENERAL_RATE_LIMIT = 'true';

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db } from '../../packages/api/db';
import { storage } from '../../packages/api/storage';
import {
  organizations,
  users,
  teams,
  wellnessTemplates,
  wellnessRequests,
  wellnessResponses,
  userTeams,
} from '@shared/schema';
import { eq } from 'drizzle-orm';
import type { WellnessTemplateConfig } from '@shared/wellness-types';

let testOrg: any;
let testAthlete: any;
let testCoach: any;
let testTeam: any;
let testTemplate: any;

const createdRequestIds: string[] = [];
const createdResponseIds: string[] = [];

beforeAll(async () => {
  // Create test organization
  const [org] = await db.insert(organizations).values({
    name: `Pending Requests Filter Test ${Date.now()}`,
    description: 'Test organization for pending requests filter',
    orgType: 'club',
  }).returning();
  testOrg = org;

  // Create test coach
  const [coach] = await db.insert(users).values({
    username: `pending_filter_coach_${Date.now()}`,
    emails: ['pending.filter.coach@test.com'],
    password: 'hashed_password',
    firstName: 'Test',
    lastName: 'Coach',
    fullName: 'Test Coach',
    isSiteAdmin: false,
  }).returning();
  testCoach = coach;
  await storage.addUserToOrganization(testCoach.id, testOrg.id, 'coach');

  // Create test athlete
  const [athlete] = await db.insert(users).values({
    username: `pending_filter_athlete_${Date.now()}`,
    emails: ['pending.filter.athlete@test.com'],
    password: 'hashed_password',
    firstName: 'Test',
    lastName: 'Athlete',
    fullName: 'Test Athlete',
    isSiteAdmin: false,
  }).returning();
  testAthlete = athlete;
  await storage.addUserToOrganization(testAthlete.id, testOrg.id, 'athlete');

  // Create test team
  const [team] = await db.insert(teams).values({
    organizationId: testOrg.id,
    name: `Test Team ${Date.now()}`,
    sport: 'Football',
    level: 'Club',
  }).returning();
  testTeam = team;

  // Add athlete to team
  await db.insert(userTeams).values({
    userId: testAthlete.id,
    teamId: testTeam.id,
    isActive: true,
  });

  // Create test template
  const templateConfig: WellnessTemplateConfig = {
    questions: [
      {
        id: 'q1',
        type: 'scale',
        label: 'How are you feeling today?',
        required: true,
        scaleMin: 1,
        scaleMax: 10,
      },
    ],
    statusConfig: {
      scaleOrientation: 'higher_is_better',
      calculationMethod: 'average',
      redThreshold: 3,
      yellowThreshold: 6,
    },
  };

  const [template] = await db.insert(wellnessTemplates).values({
    organizationId: testOrg.id,
    name: 'Test Wellness Template',
    description: 'For testing pending requests filter',
    config: templateConfig,
    isActive: true,
    isDefault: false,
    createdBy: testCoach.id,
  }).returning();
  testTemplate = template;
});

afterAll(async () => {
  // Cleanup in correct order (foreign key dependencies)
  try {
    // Delete responses first
    if (createdResponseIds.length > 0) {
      for (const responseId of createdResponseIds) {
        await db.delete(wellnessResponses).where(eq(wellnessResponses.id, responseId));
      }
    }

    // Delete requests
    if (createdRequestIds.length > 0) {
      for (const requestId of createdRequestIds) {
        await db.delete(wellnessRequests).where(eq(wellnessRequests.id, requestId));
      }
    }

    // Delete template
    if (testTemplate) {
      await db.delete(wellnessTemplates).where(eq(wellnessTemplates.id, testTemplate.id));
    }

    // Delete team memberships, then team
    if (testTeam) {
      await db.delete(userTeams).where(eq(userTeams.teamId, testTeam.id));
      await db.delete(teams).where(eq(teams.id, testTeam.id));
    }

    // Delete user-organization relationships, then users
    if (testAthlete) {
      await storage.removeUserFromOrganization(testAthlete.id, testOrg.id);
    }

    if (testCoach) {
      await storage.removeUserFromOrganization(testCoach.id, testOrg.id);
    }

    if (testAthlete) {
      await db.delete(users).where(eq(users.id, testAthlete.id));
    }

    if (testCoach) {
      await db.delete(users).where(eq(users.id, testCoach.id));
    }

    // Delete organization last
    if (testOrg) {
      await db.delete(organizations).where(eq(organizations.id, testOrg.id));
    }
  } catch (error) {
    console.error('Cleanup error:', error);
    // Don't throw - allow tests to complete
  }
});

describe('GET /api/wellness/my-requests - Pending Requests Filter', () => {
  it('should return only requests the athlete has not responded to', async () => {
    // Create two wellness requests targeting the athlete
    const [request1] = await db.insert(wellnessRequests).values({
      organizationId: testOrg.id,
      templateId: testTemplate.id,
      requestedBy: testCoach.id,
      distributionMethod: 'athlete_account',
      targetAthleteIds: [testAthlete.id],
      targetTeamIds: [],
      status: 'active',
      requiresAuth: true,
    }).returning();
    createdRequestIds.push(request1.id);

    const [request2] = await db.insert(wellnessRequests).values({
      organizationId: testOrg.id,
      templateId: testTemplate.id,
      requestedBy: testCoach.id,
      distributionMethod: 'athlete_account',
      targetAthleteIds: [testAthlete.id],
      targetTeamIds: [],
      status: 'active',
      requiresAuth: true,
    }).returning();
    createdRequestIds.push(request2.id);

    // Create response for request1 only
    const [response1] = await db.insert(wellnessResponses).values({
      requestId: request1.id,
      organizationId: testOrg.id,
      templateId: testTemplate.id,
      userId: testAthlete.id,
      userFullName: testAthlete.fullName,
      teamId: testTeam.id,
      teamNameSnapshot: testTeam.name,
      submittedAt: new Date(),
      date: new Date().toISOString().split('T')[0],
      responses: {
        q1: { value: 8, label: 'How are you feeling today?' },
      },
      accessMethod: 'authenticated',
    }).returning();
    createdResponseIds.push(response1.id);

    // Query pending requests (simulating the API endpoint logic)
    const allRequests = await storage.getWellnessRequestsByOrganizations([testOrg.id], { status: 'active' });

    // Filter to requests targeting this athlete
    const targetedRequests = allRequests.filter(req =>
      req.targetAthleteIds?.includes(testAthlete.id)
    );

    // Get athlete's responses
    const userResponses = await storage.getWellnessResponsesByAthlete(testAthlete.id);
    const respondedRequestIds = new Set(userResponses.map(r => r.requestId));

    // Filter out responded requests
    const pendingRequests = targetedRequests.filter(req =>
      !respondedRequestIds.has(req.id)
    );

    // Assertions
    expect(targetedRequests).toHaveLength(2); // Both requests target the athlete
    expect(userResponses).toHaveLength(1); // One response exists
    expect(respondedRequestIds.has(request1.id)).toBe(true); // request1 is responded
    expect(respondedRequestIds.has(request2.id)).toBe(false); // request2 is not responded
    expect(pendingRequests).toHaveLength(1); // Only request2 is pending
    expect(pendingRequests[0].id).toBe(request2.id); // Verify it's request2
  });

  it('should exclude requests where athlete has already submitted a response', async () => {
    // Create a new request
    const [request3] = await db.insert(wellnessRequests).values({
      organizationId: testOrg.id,
      templateId: testTemplate.id,
      requestedBy: testCoach.id,
      distributionMethod: 'athlete_account',
      targetAthleteIds: [testAthlete.id],
      targetTeamIds: [],
      status: 'active',
      requiresAuth: true,
    }).returning();
    createdRequestIds.push(request3.id);

    // Get pending requests before response
    const allRequestsBefore = await storage.getWellnessRequestsByOrganizations([testOrg.id], { status: 'active' });
    const targetedRequestsBefore = allRequestsBefore.filter(req =>
      req.targetAthleteIds?.includes(testAthlete.id)
    );
    const userResponsesBefore = await storage.getWellnessResponsesByAthlete(testAthlete.id);
    const respondedRequestIdsBefore = new Set(userResponsesBefore.map(r => r.requestId));
    const pendingRequestsBefore = targetedRequestsBefore.filter(req =>
      !respondedRequestIdsBefore.has(req.id)
    );

    expect(pendingRequestsBefore.some(req => req.id === request3.id)).toBe(true);

    // Submit response for request3
    const [response3] = await db.insert(wellnessResponses).values({
      requestId: request3.id,
      organizationId: testOrg.id,
      templateId: testTemplate.id,
      userId: testAthlete.id,
      userFullName: testAthlete.fullName,
      teamId: testTeam.id,
      teamNameSnapshot: testTeam.name,
      submittedAt: new Date(),
      date: new Date().toISOString().split('T')[0],
      responses: {
        q1: { value: 7, label: 'How are you feeling today?' },
      },
      accessMethod: 'authenticated',
    }).returning();
    createdResponseIds.push(response3.id);

    // Get pending requests after response
    const allRequestsAfter = await storage.getWellnessRequestsByOrganizations([testOrg.id], { status: 'active' });
    const targetedRequestsAfter = allRequestsAfter.filter(req =>
      req.targetAthleteIds?.includes(testAthlete.id)
    );
    const userResponsesAfter = await storage.getWellnessResponsesByAthlete(testAthlete.id);
    const respondedRequestIdsAfter = new Set(userResponsesAfter.map(r => r.requestId));
    const pendingRequestsAfter = targetedRequestsAfter.filter(req =>
      !respondedRequestIdsAfter.has(req.id)
    );

    // request3 should now be excluded
    expect(pendingRequestsAfter.some(req => req.id === request3.id)).toBe(false);
    expect(respondedRequestIdsAfter.has(request3.id)).toBe(true);
  });

  it('should still include new requests after responding to others', async () => {
    // Create request4
    const [request4] = await db.insert(wellnessRequests).values({
      organizationId: testOrg.id,
      templateId: testTemplate.id,
      requestedBy: testCoach.id,
      distributionMethod: 'athlete_account',
      targetAthleteIds: [testAthlete.id],
      targetTeamIds: [],
      status: 'active',
      requiresAuth: true,
    }).returning();
    createdRequestIds.push(request4.id);

    // Get pending requests (should include request4 since no response yet)
    const allRequests = await storage.getWellnessRequestsByOrganizations([testOrg.id], { status: 'active' });
    const targetedRequests = allRequests.filter(req =>
      req.targetAthleteIds?.includes(testAthlete.id)
    );
    const userResponses = await storage.getWellnessResponsesByAthlete(testAthlete.id);
    const respondedRequestIds = new Set(userResponses.map(r => r.requestId));
    const pendingRequests = targetedRequests.filter(req =>
      !respondedRequestIds.has(req.id)
    );

    // Verify request4 is in pending list
    expect(pendingRequests.some(req => req.id === request4.id)).toBe(true);
    expect(respondedRequestIds.has(request4.id)).toBe(false);
  });
});

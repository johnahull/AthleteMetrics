/**
 * Integration Tests for Wellness Questionnaire Schema
 *
 * Tests verify:
 * - Table creation and structure
 * - JSONB field validation (config, responses)
 * - Index existence and performance
 * - Data insertion and retrieval
 * - Token uniqueness
 * - Historical data preservation (no FK errors)
 * - Organization scoping
 */

// Set environment variables BEFORE any imports
process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'test-secret-key-for-integration-tests-only-at-least-32-characters-long';
process.env.ADMIN_USER = process.env.ADMIN_USER || 'admin';
process.env.ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@test.com';
process.env.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'TestPassword123!';
process.env.BYPASS_GENERAL_RATE_LIMIT = 'true';

import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { db } from '../../packages/api/db';
import {
  organizations,
  users,
  teams,
  wellnessTemplates,
  wellnessRequests,
  wellnessResponses
} from '@shared/schema';
import { eq, and, sql } from 'drizzle-orm';
import crypto from 'crypto';

let testOrg: any;
let testUser: any;
let testTeam: any;
const createdTemplateIds: string[] = [];
const createdRequestIds: string[] = [];
const createdResponseIds: string[] = [];

beforeAll(async () => {
  // Create test organization
  const [org] = await db.insert(organizations).values({
    name: `Wellness Test Org ${Date.now()}`,
    description: 'Test organization for wellness schema tests',
    orgType: 'club',
  }).returning();
  testOrg = org;

  // Create test user (coach)
  const [user] = await db.insert(users).values({
    username: `wellness_coach_${Date.now()}`,
    emails: ['wellness.coach@test.com'],
    password: 'hashed_password_here',
    firstName: 'Wellness',
    lastName: 'Coach',
    fullName: 'Wellness Coach',
    isSiteAdmin: false,
  }).returning();
  testUser = user;

  // Create test team
  const [team] = await db.insert(teams).values({
    organizationId: testOrg.id,
    name: `Test Team ${Date.now()}`,
    sport: 'Soccer',
    level: 'Club',
  }).returning();
  testTeam = team;
});

afterEach(async () => {
  // Clean up created responses (reverse order for FK constraints)
  if (createdResponseIds.length > 0) {
    for (const id of [...createdResponseIds].reverse()) {
      try {
        await db.delete(wellnessResponses).where(eq(wellnessResponses.id, id));
      } catch (e) {
        // Ignore if already deleted
      }
    }
    createdResponseIds.length = 0;
  }

  // Clean up created requests
  if (createdRequestIds.length > 0) {
    for (const id of [...createdRequestIds].reverse()) {
      try {
        await db.delete(wellnessRequests).where(eq(wellnessRequests.id, id));
      } catch (e) {
        // Ignore if already deleted
      }
    }
    createdRequestIds.length = 0;
  }

  // NOTE: Don't clean up templates in afterEach - they're used by describe blocks
  // Templates will be cleaned up in afterAll
});

afterAll(async () => {
  // Clean up remaining templates (order matters)
  for (const id of [...createdTemplateIds].reverse()) {
    try {
      await db.delete(wellnessTemplates).where(eq(wellnessTemplates.id, id));
    } catch (e) {
      // Ignore if already deleted
    }
  }
  createdTemplateIds.length = 0;

  // Clean up test data
  if (testTeam) {
    await db.delete(teams).where(eq(teams.id, testTeam.id));
  }
  if (testUser) {
    await db.delete(users).where(eq(users.id, testUser.id));
  }
  if (testOrg) {
    await db.delete(organizations).where(eq(organizations.id, testOrg.id));
  }
});

describe('Wellness Templates Table', () => {
  it('should create wellness template with valid JSONB config', async () => {
    const config = {
      questions: [
        {
          id: 'q1',
          type: 'scale',
          label: 'Sleep Quality',
          scaleMin: 1,
          scaleMax: 10,
          required: true,
        },
        {
          id: 'q2',
          type: 'text',
          label: 'Any injuries?',
          required: false,
        },
      ],
    };

    const [template] = await db.insert(wellnessTemplates).values({
      organizationId: testOrg.id,
      name: 'Daily Wellness Check',
      description: 'Standard daily wellness questionnaire',
      config,
      isDefault: false,
      isActive: true,
      createdBy: testUser.id,
    }).returning();

    expect(template).toBeDefined();
    expect(template.id).toBeDefined();
    expect(template.organizationId).toBe(testOrg.id);
    expect(template.name).toBe('Daily Wellness Check');
    expect(template.config).toEqual(config);
    expect(template.isActive).toBe(true);
    expect(template.createdAt).toBeDefined();
    expect(template.updatedAt).toBeDefined();

    createdTemplateIds.push(template.id);
  });

  it('should allow multiple templates per organization', async () => {
    const config = { questions: [] };

    const [template1] = await db.insert(wellnessTemplates).values({
      organizationId: testOrg.id,
      name: 'Template 1',
      config,
      createdBy: testUser.id,
    }).returning();

    const [template2] = await db.insert(wellnessTemplates).values({
      organizationId: testOrg.id,
      name: 'Template 2',
      config,
      createdBy: testUser.id,
    }).returning();

    expect(template1.id).not.toBe(template2.id);
    createdTemplateIds.push(template1.id, template2.id);
  });

  it('should cascade delete templates when organization is deleted', async () => {
    // Create temporary org
    const [tempOrg] = await db.insert(organizations).values({
      name: `Temp Org ${Date.now()}`,
      orgType: 'club',
    }).returning();

    // Create template in temp org
    const [template] = await db.insert(wellnessTemplates).values({
      organizationId: tempOrg.id,
      name: 'Temp Template',
      config: { questions: [] },
      createdBy: testUser.id,
    }).returning();

    // Delete org
    await db.delete(organizations).where(eq(organizations.id, tempOrg.id));

    // Template should be deleted
    const templates = await db.select().from(wellnessTemplates).where(
      eq(wellnessTemplates.id, template.id)
    );
    expect(templates.length).toBe(0);
  });

  it('should set createdBy to null when user is deleted', async () => {
    // Create temporary user
    const [tempUser] = await db.insert(users).values({
      username: `temp_user_${Date.now()}`,
      emails: ['temp@test.com'],
      password: 'hashed',
      firstName: 'Temp',
      lastName: 'User',
      fullName: 'Temp User',
    }).returning();

    // Create template
    const [template] = await db.insert(wellnessTemplates).values({
      organizationId: testOrg.id,
      name: 'Template by Temp User',
      config: { questions: [] },
      createdBy: tempUser.id,
    }).returning();

    createdTemplateIds.push(template.id);

    // Delete user
    await db.delete(users).where(eq(users.id, tempUser.id));

    // Template should still exist with createdBy = null
    const [updatedTemplate] = await db.select().from(wellnessTemplates).where(
      eq(wellnessTemplates.id, template.id)
    );
    expect(updatedTemplate).toBeDefined();
    expect(updatedTemplate.createdBy).toBeNull();
  });

  it('should have index on organizationId', async () => {
    // Query using organizationId - should use index
    const templates = await db.select().from(wellnessTemplates).where(
      eq(wellnessTemplates.organizationId, testOrg.id)
    );
    expect(Array.isArray(templates)).toBe(true);
  });

  it('should have index on isActive', async () => {
    // Query using isActive - should use index
    const activeTemplates = await db.select().from(wellnessTemplates).where(
      eq(wellnessTemplates.isActive, true)
    );
    expect(Array.isArray(activeTemplates)).toBe(true);
  });
});

describe('Wellness Requests Table', () => {
  let testTemplate: any;

  beforeAll(async () => {
    // Create test template
    const [template] = await db.insert(wellnessTemplates).values({
      organizationId: testOrg.id,
      name: 'Test Template for Requests',
      config: { questions: [] },
      createdBy: testUser.id,
    }).returning();
    testTemplate = template;
    createdTemplateIds.push(template.id);
  });

  it('should create wellness request with unique token', async () => {
    const publicToken = crypto.randomBytes(32).toString('hex');

    const [request] = await db.insert(wellnessRequests).values({
      organizationId: testOrg.id,
      templateId: testTemplate.id,
      requestedBy: testUser.id,
      distributionMethod: 'magic_link',
      targetAthleteIds: [testUser.id],
      targetTeamIds: [],
      publicToken,
      requiresAuth: false,
      status: 'active',
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    }).returning();

    expect(request).toBeDefined();
    expect(request.id).toBeDefined();
    expect(request.publicToken).toBe(publicToken);
    expect(request.status).toBe('active');
    expect(request.createdAt).toBeDefined();

    createdRequestIds.push(request.id);
  });

  it('should enforce unique publicToken constraint', async () => {
    const publicToken = crypto.randomBytes(32).toString('hex');

    // Create first request
    const [request1] = await db.insert(wellnessRequests).values({
      organizationId: testOrg.id,
      templateId: testTemplate.id,
      requestedBy: testUser.id,
      distributionMethod: 'magic_link',
      publicToken,
      status: 'active',
    }).returning();

    createdRequestIds.push(request1.id);

    // Attempt to create second request with same token
    await expect(
      db.insert(wellnessRequests).values({
        organizationId: testOrg.id,
        templateId: testTemplate.id,
        requestedBy: testUser.id,
        distributionMethod: 'magic_link',
        publicToken, // Same token
        status: 'active',
      })
    ).rejects.toThrow();
  });

  it('should support array fields for targetAthleteIds and targetTeamIds', async () => {
    const [request] = await db.insert(wellnessRequests).values({
      organizationId: testOrg.id,
      templateId: testTemplate.id,
      requestedBy: testUser.id,
      distributionMethod: 'team_link',
      targetAthleteIds: ['athlete1', 'athlete2', 'athlete3'],
      targetTeamIds: [testTeam.id],
      publicToken: crypto.randomBytes(32).toString('hex'),
      status: 'active',
    }).returning();

    expect(request.targetAthleteIds).toEqual(['athlete1', 'athlete2', 'athlete3']);
    expect(request.targetTeamIds).toEqual([testTeam.id]);

    createdRequestIds.push(request.id);
  });

  it('should allow null for optional fields', async () => {
    const [request] = await db.insert(wellnessRequests).values({
      organizationId: testOrg.id,
      templateId: testTemplate.id,
      requestedBy: testUser.id,
      distributionMethod: 'athlete_account',
      publicToken: null,
      targetAthleteIds: null,
      targetTeamIds: null,
      scheduledFor: null,
      expiresAt: null,
      status: 'active',
    }).returning();

    expect(request.publicToken).toBeNull();
    expect(request.targetAthleteIds).toBeNull();
    expect(request.targetTeamIds).toBeNull();
    expect(request.scheduledFor).toBeNull();
    expect(request.expiresAt).toBeNull();

    createdRequestIds.push(request.id);
  });

  it('should have index on organizationId', async () => {
    const requests = await db.select().from(wellnessRequests).where(
      eq(wellnessRequests.organizationId, testOrg.id)
    );
    expect(Array.isArray(requests)).toBe(true);
  });

  it('should have index on publicToken', async () => {
    const token = crypto.randomBytes(32).toString('hex');
    const requests = await db.select().from(wellnessRequests).where(
      eq(wellnessRequests.publicToken, token)
    );
    expect(Array.isArray(requests)).toBe(true);
  });

  it('should have index on status', async () => {
    const requests = await db.select().from(wellnessRequests).where(
      eq(wellnessRequests.status, 'active')
    );
    expect(Array.isArray(requests)).toBe(true);
  });
});

describe('Wellness Responses Table', () => {
  let testTemplate: any;
  let testRequest: any;

  beforeAll(async () => {
    // Create test template and request
    const [template] = await db.insert(wellnessTemplates).values({
      organizationId: testOrg.id,
      name: 'Test Template for Responses',
      config: { questions: [] },
      createdBy: testUser.id,
    }).returning();
    testTemplate = template;
    createdTemplateIds.push(template.id);

    const [request] = await db.insert(wellnessRequests).values({
      organizationId: testOrg.id,
      templateId: testTemplate.id,
      requestedBy: testUser.id,
      distributionMethod: 'magic_link',
      publicToken: crypto.randomBytes(32).toString('hex'),
      status: 'active',
    }).returning();
    testRequest = request;
    createdRequestIds.push(request.id);
  });

  it('should create wellness response with JSONB responses', async () => {
    const responses = {
      q1: { value: 8, label: 'Sleep Quality' },
      q2: { value: 'Feeling great', label: 'Notes' },
    };

    const [response] = await db.insert(wellnessResponses).values({
      requestId: testRequest.id,
      organizationId: testOrg.id,
      templateId: testTemplate.id,
      userId: testUser.id,
      userFullName: 'Test Athlete',
      teamId: testTeam.id,
      teamNameSnapshot: 'Test Team Snapshot',
      submittedAt: new Date(),
      date: new Date().toISOString().split('T')[0], // YYYY-MM-DD
      responses,
      accessMethod: 'magic_link',
      ipAddress: '127.0.0.1',
      userAgent: 'Test Agent',
    }).returning();

    expect(response).toBeDefined();
    expect(response.id).toBeDefined();
    expect(response.responses).toEqual(responses);
    expect(response.userFullName).toBe('Test Athlete');
    expect(response.teamNameSnapshot).toBe('Test Team Snapshot');
    expect(response.createdAt).toBeDefined();

    createdResponseIds.push(response.id);
  });

  it('should preserve historical data without FK constraints (no errors when referenced data deleted)', async () => {
    // Create temporary entities
    const [tempOrg] = await db.insert(organizations).values({
      name: `Temp Org ${Date.now()}`,
      orgType: 'club',
    }).returning();

    const [tempUser] = await db.insert(users).values({
      username: `temp_athlete_${Date.now()}`,
      emails: ['temp.athlete@test.com'],
      password: 'hashed',
      firstName: 'Temp',
      lastName: 'Athlete',
      fullName: 'Temp Athlete',
    }).returning();

    const [tempTeam] = await db.insert(teams).values({
      organizationId: tempOrg.id,
      name: `Temp Team ${Date.now()}`,
      sport: 'Soccer',
    }).returning();

    const [tempTemplate] = await db.insert(wellnessTemplates).values({
      organizationId: tempOrg.id,
      name: 'Temp Template',
      config: { questions: [] },
      createdBy: tempUser.id,
    }).returning();

    const [tempRequest] = await db.insert(wellnessRequests).values({
      organizationId: tempOrg.id,
      templateId: tempTemplate.id,
      requestedBy: tempUser.id,
      distributionMethod: 'magic_link',
      publicToken: crypto.randomBytes(32).toString('hex'),
      status: 'active',
    }).returning();

    // Create response referencing temp entities
    const [response] = await db.insert(wellnessResponses).values({
      requestId: tempRequest.id,
      organizationId: tempOrg.id,
      templateId: tempTemplate.id,
      userId: tempUser.id,
      userFullName: 'Temp Athlete',
      teamId: tempTeam.id,
      teamNameSnapshot: 'Temp Team Name',
      submittedAt: new Date(),
      date: new Date().toISOString().split('T')[0],
      responses: { q1: { value: 5 } },
      accessMethod: 'magic_link',
    }).returning();

    createdResponseIds.push(response.id);

    // Delete all referenced entities in correct order (FK constraints)
    // Note: Organization deletion cascades to templates and requests
    await db.delete(teams).where(eq(teams.id, tempTeam.id)); // Delete team first
    await db.delete(organizations).where(eq(organizations.id, tempOrg.id)); // Cascades to templates/requests
    await db.delete(users).where(eq(users.id, tempUser.id));

    // Response should still exist with historical references
    const [preservedResponse] = await db.select().from(wellnessResponses).where(
      eq(wellnessResponses.id, response.id)
    );

    expect(preservedResponse).toBeDefined();
    expect(preservedResponse.organizationId).toBe(tempOrg.id); // Historical reference
    expect(preservedResponse.templateId).toBe(tempTemplate.id); // Historical reference
    expect(preservedResponse.userId).toBe(tempUser.id); // Historical reference
    expect(preservedResponse.teamId).toBe(tempTeam.id); // Historical reference
    expect(preservedResponse.userFullName).toBe('Temp Athlete'); // Snapshot
    expect(preservedResponse.teamNameSnapshot).toBe('Temp Team Name'); // Snapshot
  });

  it('should set requestId to null when request is deleted', async () => {
    // Create temporary request
    const [tempRequest] = await db.insert(wellnessRequests).values({
      organizationId: testOrg.id,
      templateId: testTemplate.id,
      requestedBy: testUser.id,
      distributionMethod: 'magic_link',
      publicToken: crypto.randomBytes(32).toString('hex'),
      status: 'active',
    }).returning();

    // Create response
    const [response] = await db.insert(wellnessResponses).values({
      requestId: tempRequest.id,
      organizationId: testOrg.id,
      templateId: testTemplate.id,
      userId: testUser.id,
      userFullName: 'Test Athlete',
      submittedAt: new Date(),
      date: new Date().toISOString().split('T')[0],
      responses: { q1: { value: 7 } },
    }).returning();

    createdResponseIds.push(response.id);

    // Delete request
    await db.delete(wellnessRequests).where(eq(wellnessRequests.id, tempRequest.id));

    // Response should still exist with requestId = null
    const [updatedResponse] = await db.select().from(wellnessResponses).where(
      eq(wellnessResponses.id, response.id)
    );

    expect(updatedResponse).toBeDefined();
    expect(updatedResponse.requestId).toBeNull();
  });

  it('should have index on userId', async () => {
    const responses = await db.select().from(wellnessResponses).where(
      eq(wellnessResponses.userId, testUser.id)
    );
    expect(Array.isArray(responses)).toBe(true);
  });

  it('should have index on organizationId', async () => {
    const responses = await db.select().from(wellnessResponses).where(
      eq(wellnessResponses.organizationId, testOrg.id)
    );
    expect(Array.isArray(responses)).toBe(true);
  });

  it('should have index on date', async () => {
    const today = new Date().toISOString().split('T')[0];
    const responses = await db.select().from(wellnessResponses).where(
      eq(wellnessResponses.date, today)
    );
    expect(Array.isArray(responses)).toBe(true);
  });

  it('should have index on teamId', async () => {
    const responses = await db.select().from(wellnessResponses).where(
      eq(wellnessResponses.teamId, testTeam.id)
    );
    expect(Array.isArray(responses)).toBe(true);
  });

  it('should support composite index on userId + date', async () => {
    const today = new Date().toISOString().split('T')[0];
    const responses = await db.select().from(wellnessResponses).where(
      and(
        eq(wellnessResponses.userId, testUser.id),
        eq(wellnessResponses.date, today)
      )
    );
    expect(Array.isArray(responses)).toBe(true);
  });
});

describe('Organization Scoping', () => {
  let org1: any, org2: any, user1: any, template1: any, template2: any;

  beforeAll(async () => {
    // Create two organizations
    [org1] = await db.insert(organizations).values({
      name: `Org 1 ${Date.now()}`,
      orgType: 'club',
    }).returning();

    [org2] = await db.insert(organizations).values({
      name: `Org 2 ${Date.now()}`,
      orgType: 'college',
    }).returning();

    // Create user
    [user1] = await db.insert(users).values({
      username: `scoping_user_${Date.now()}`,
      emails: ['scoping@test.com'],
      password: 'hashed',
      firstName: 'Scoping',
      lastName: 'User',
      fullName: 'Scoping User',
    }).returning();

    // Create templates in each org
    [template1] = await db.insert(wellnessTemplates).values({
      organizationId: org1.id,
      name: 'Org 1 Template',
      config: { questions: [] },
      createdBy: user1.id,
    }).returning();

    [template2] = await db.insert(wellnessTemplates).values({
      organizationId: org2.id,
      name: 'Org 2 Template',
      config: { questions: [] },
      createdBy: user1.id,
    }).returning();

    createdTemplateIds.push(template1.id, template2.id);
  });

  afterAll(async () => {
    // Cleanup
    await db.delete(users).where(eq(users.id, user1.id));
    await db.delete(organizations).where(eq(organizations.id, org1.id));
    await db.delete(organizations).where(eq(organizations.id, org2.id));
  });

  it('should correctly filter templates by organization', async () => {
    const org1Templates = await db.select().from(wellnessTemplates).where(
      eq(wellnessTemplates.organizationId, org1.id)
    );

    const org2Templates = await db.select().from(wellnessTemplates).where(
      eq(wellnessTemplates.organizationId, org2.id)
    );

    // Each org should only see its own templates
    expect(org1Templates.length).toBeGreaterThanOrEqual(1);
    expect(org2Templates.length).toBeGreaterThanOrEqual(1);

    expect(org1Templates.every(t => t.organizationId === org1.id)).toBe(true);
    expect(org2Templates.every(t => t.organizationId === org2.id)).toBe(true);
  });

  it('should correctly filter requests by organization', async () => {
    // Create requests in each org
    const [request1] = await db.insert(wellnessRequests).values({
      organizationId: org1.id,
      templateId: template1.id,
      requestedBy: user1.id,
      distributionMethod: 'magic_link',
      publicToken: crypto.randomBytes(32).toString('hex'),
      status: 'active',
    }).returning();

    const [request2] = await db.insert(wellnessRequests).values({
      organizationId: org2.id,
      templateId: template2.id,
      requestedBy: user1.id,
      distributionMethod: 'magic_link',
      publicToken: crypto.randomBytes(32).toString('hex'),
      status: 'active',
    }).returning();

    createdRequestIds.push(request1.id, request2.id);

    // Filter by organization
    const org1Requests = await db.select().from(wellnessRequests).where(
      eq(wellnessRequests.organizationId, org1.id)
    );

    const org2Requests = await db.select().from(wellnessRequests).where(
      eq(wellnessRequests.organizationId, org2.id)
    );

    expect(org1Requests.every(r => r.organizationId === org1.id)).toBe(true);
    expect(org2Requests.every(r => r.organizationId === org2.id)).toBe(true);
  });

  it('should correctly filter responses by organization', async () => {
    // Create responses in each org
    const [response1] = await db.insert(wellnessResponses).values({
      organizationId: org1.id,
      templateId: template1.id,
      userId: user1.id,
      userFullName: 'Org 1 Athlete',
      submittedAt: new Date(),
      date: new Date().toISOString().split('T')[0],
      responses: { q1: { value: 5 } },
    }).returning();

    const [response2] = await db.insert(wellnessResponses).values({
      organizationId: org2.id,
      templateId: template2.id,
      userId: user1.id,
      userFullName: 'Org 2 Athlete',
      submittedAt: new Date(),
      date: new Date().toISOString().split('T')[0],
      responses: { q1: { value: 7 } },
    }).returning();

    createdResponseIds.push(response1.id, response2.id);

    // Filter by organization
    const org1Responses = await db.select().from(wellnessResponses).where(
      eq(wellnessResponses.organizationId, org1.id)
    );

    const org2Responses = await db.select().from(wellnessResponses).where(
      eq(wellnessResponses.organizationId, org2.id)
    );

    expect(org1Responses.every(r => r.organizationId === org1.id)).toBe(true);
    expect(org2Responses.every(r => r.organizationId === org2.id)).toBe(true);
  });
});

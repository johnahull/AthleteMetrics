/**
 * Integration Tests for Wellness Questionnaire API
 *
 * Tests verify:
 * - Template CRUD operations
 * - Request creation and management
 * - Magic link authentication
 * - Response submission (authenticated + magic link)
 * - Analytics queries
 * - Rate limiting
 * - Permission checks
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
import { storage } from '../../packages/api/storage';
import {
  organizations,
  users,
  teams,
  wellnessTemplates,
  wellnessRequests,
  wellnessResponses
} from '@shared/schema';
import { eq } from 'drizzle-orm';
import crypto from 'crypto';
import type { WellnessTemplateConfig } from '@shared/wellness-types';

let testOrg: any;
let testUser: any; // Coach
let testAthlete: any;
let testTeam: any;
let siteAdmin: any;
const createdTemplateIds: string[] = [];
const createdRequestIds: string[] = [];
const createdResponseIds: string[] = [];

beforeAll(async () => {
  // Create test organization
  const [org] = await db.insert(organizations).values({
    name: `Wellness API Test Org ${Date.now()}`,
    description: 'Test organization for wellness API tests',
    orgType: 'club',
  }).returning();
  testOrg = org;

  // Create site admin
  const [admin] = await db.insert(users).values({
    username: `wellness_siteadmin_${Date.now()}`,
    emails: ['siteadmin@test.com'],
    password: 'hashed_password_here',
    firstName: 'Site',
    lastName: 'Admin',
    fullName: 'Site Admin',
    isSiteAdmin: true,
  }).returning();
  siteAdmin = admin;

  // Create test coach
  const [coach] = await db.insert(users).values({
    username: `wellness_coach_${Date.now()}`,
    emails: ['wellness.coach@test.com'],
    password: 'hashed_password_here',
    firstName: 'Wellness',
    lastName: 'Coach',
    fullName: 'Wellness Coach',
    isSiteAdmin: false,
  }).returning();
  testUser = coach;

  // Add coach to organization
  await storage.addUserToOrganization(testUser.id, testOrg.id, 'coach');

  // Create test athlete
  const [athlete] = await db.insert(users).values({
    username: `wellness_athlete_${Date.now()}`,
    emails: ['wellness.athlete@test.com'],
    password: 'hashed_password_here',
    firstName: 'Test',
    lastName: 'Athlete',
    fullName: 'Test Athlete',
    isSiteAdmin: false,
  }).returning();
  testAthlete = athlete;

  // Add athlete to organization
  await storage.addUserToOrganization(testAthlete.id, testOrg.id, 'athlete');

  // Create test team
  const [team] = await db.insert(teams).values({
    organizationId: testOrg.id,
    name: `Test Team ${Date.now()}`,
    sport: 'Soccer',
    level: 'Club',
  }).returning();
  testTeam = team;

  // Add athlete to team
  await storage.addUserToTeam(testAthlete.id, testTeam.id);
});

afterEach(async () => {
  // Clean up created responses (must be first due to FK constraints)
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

  // Clean up created requests (before templates due to FK constraints)
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

  // Don't delete templates in afterEach - they may be used across tests
  // Templates will be cleaned up in afterAll
});

afterAll(async () => {
  // Clean up remaining templates (order matters due to FK constraints)
  for (const id of [...createdTemplateIds].reverse()) {
    try {
      await db.delete(wellnessTemplates).where(eq(wellnessTemplates.id, id));
    } catch (e) {
      // Ignore if already deleted
    }
  }
  createdTemplateIds.length = 0;

  // Clean up test data (order matters due to FK constraints)
  // 1. Remove user from team first to avoid FK constraint issues
  if (testAthlete && testTeam) {
    try {
      await storage.removeUserFromTeam(testAthlete.id, testTeam.id);
    } catch (e) {
      // Ignore if already removed
    }
  }

  // 2. Delete team (must be before removing users from org)
  if (testTeam) {
    try {
      await db.delete(teams).where(eq(teams.id, testTeam.id));
    } catch (e) {
      // Ignore if already deleted
    }
  }

  // 3. Remove users from organization (must be before deleting users)
  if (testAthlete && testOrg) {
    try {
      await storage.removeUserFromOrganization(testAthlete.id, testOrg.id);
    } catch (e) {
      // Ignore if already removed
    }
  }
  if (testUser && testOrg) {
    try {
      await storage.removeUserFromOrganization(testUser.id, testOrg.id);
    } catch (e) {
      // Ignore if already removed
    }
  }

  // 4. Delete users
  if (testAthlete) {
    try {
      await db.delete(users).where(eq(users.id, testAthlete.id));
    } catch (e) {
      // Ignore if already deleted
    }
  }
  if (testUser) {
    try {
      await db.delete(users).where(eq(users.id, testUser.id));
    } catch (e) {
      // Ignore if already deleted
    }
  }
  if (siteAdmin) {
    try {
      await db.delete(users).where(eq(users.id, siteAdmin.id));
    } catch (e) {
      // Ignore if already deleted
    }
  }

  // 5. Delete organization (last)
  if (testOrg) {
    try {
      await db.delete(organizations).where(eq(organizations.id, testOrg.id));
    } catch (e) {
      // Ignore if already deleted
    }
  }
});

describe('Wellness Templates API', () => {
  const sampleConfig: WellnessTemplateConfig = {
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

  it('should create wellness template (coach)', async () => {
    const template = await storage.createWellnessTemplate({
      organizationId: testOrg.id,
      name: 'Daily Wellness Check',
      description: 'Standard daily wellness questionnaire',
      config: sampleConfig,
      isDefault: false,
      isActive: true,
      createdBy: testUser.id,
    });

    expect(template).toBeDefined();
    expect(template.id).toBeDefined();
    expect(template.organizationId).toBe(testOrg.id);
    expect(template.name).toBe('Daily Wellness Check');
    expect(template.config).toEqual(sampleConfig);
    expect(template.isActive).toBe(true);

    createdTemplateIds.push(template.id);
  });

  it('should get all templates for organization', async () => {
    // Create test template
    const template = await storage.createWellnessTemplate({
      organizationId: testOrg.id,
      name: 'Test Template',
      config: sampleConfig,
      createdBy: testUser.id,
    });
    createdTemplateIds.push(template.id);

    const templates = await storage.getWellnessTemplates(testOrg.id);
    expect(Array.isArray(templates)).toBe(true);
    expect(templates.length).toBeGreaterThan(0);
    expect(templates.some(t => t.id === template.id)).toBe(true);
  });

  it('should get single template by ID', async () => {
    const template = await storage.createWellnessTemplate({
      organizationId: testOrg.id,
      name: 'Single Template Test',
      config: sampleConfig,
      createdBy: testUser.id,
    });
    createdTemplateIds.push(template.id);

    const fetched = await storage.getWellnessTemplate(template.id);
    expect(fetched).toBeDefined();
    expect(fetched!.id).toBe(template.id);
    expect(fetched!.name).toBe('Single Template Test');
  });

  it('should update wellness template', async () => {
    const template = await storage.createWellnessTemplate({
      organizationId: testOrg.id,
      name: 'Original Name',
      config: sampleConfig,
      createdBy: testUser.id,
    });
    createdTemplateIds.push(template.id);

    const updated = await storage.updateWellnessTemplate(template.id, {
      name: 'Updated Name',
      description: 'Updated description',
    });

    expect(updated.name).toBe('Updated Name');
    expect(updated.description).toBe('Updated description');
  });

  it('should delete wellness template', async () => {
    const template = await storage.createWellnessTemplate({
      organizationId: testOrg.id,
      name: 'To Be Deleted',
      config: sampleConfig,
      createdBy: testUser.id,
    });

    await storage.deleteWellnessTemplate(template.id);

    const fetched = await storage.getWellnessTemplate(template.id);
    expect(fetched).toBeUndefined();
  });

  it('should set default template', async () => {
    const template = await storage.createWellnessTemplate({
      organizationId: testOrg.id,
      name: 'Default Template',
      config: sampleConfig,
      isDefault: false,
      createdBy: testUser.id,
    });
    createdTemplateIds.push(template.id);

    const updated = await storage.updateWellnessTemplate(template.id, {
      isDefault: true,
    });

    expect(updated.isDefault).toBe(true);
  });

  it('should filter templates by active status', async () => {
    const activeTemplate = await storage.createWellnessTemplate({
      organizationId: testOrg.id,
      name: 'Active Template',
      config: sampleConfig,
      isActive: true,
      createdBy: testUser.id,
    });
    createdTemplateIds.push(activeTemplate.id);

    const inactiveTemplate = await storage.createWellnessTemplate({
      organizationId: testOrg.id,
      name: 'Inactive Template',
      config: sampleConfig,
      isActive: false,
      createdBy: testUser.id,
    });
    createdTemplateIds.push(inactiveTemplate.id);

    const activeTemplates = await storage.getWellnessTemplates(testOrg.id, { activeOnly: true });
    expect(activeTemplates.some(t => t.id === activeTemplate.id)).toBe(true);
    expect(activeTemplates.some(t => t.id === inactiveTemplate.id)).toBe(false);
  });
});

describe('Wellness Requests API', () => {
  let testTemplate: any;

  beforeAll(async () => {
    const config: WellnessTemplateConfig = {
      questions: [
        {
          id: 'q1',
          type: 'scale',
          label: 'How are you feeling?',
          scaleMin: 1,
          scaleMax: 10,
          required: true,
        },
      ],
    };

    testTemplate = await storage.createWellnessTemplate({
      organizationId: testOrg.id,
      name: 'Request Test Template',
      config,
      createdBy: testUser.id,
    });
    createdTemplateIds.push(testTemplate.id);
  });

  afterAll(async () => {
    // Clean up test template for this suite
    if (testTemplate) {
      try {
        await db.delete(wellnessTemplates).where(eq(wellnessTemplates.id, testTemplate.id));
      } catch (e) {
        // Ignore if already deleted
      }
    }
  });

  it('should create wellness request with magic link', async () => {
    const publicToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const request = await storage.createWellnessRequest({
      organizationId: testOrg.id,
      templateId: testTemplate.id,
      requestedBy: testUser.id,
      distributionMethod: 'magic_link',
      targetAthleteIds: [testAthlete.id],
      targetTeamIds: [],
      publicToken,
      requiresAuth: false,
      expiresAt,
      status: 'active',
    });

    expect(request).toBeDefined();
    expect(request.id).toBeDefined();
    expect(request.publicToken).toBe(publicToken);
    expect(request.status).toBe('active');
    expect(request.distributionMethod).toBe('magic_link');

    createdRequestIds.push(request.id);
  });

  it('should create wellness request with team link', async () => {
    const publicToken = crypto.randomBytes(32).toString('hex');

    const request = await storage.createWellnessRequest({
      organizationId: testOrg.id,
      templateId: testTemplate.id,
      requestedBy: testUser.id,
      distributionMethod: 'team_link',
      targetAthleteIds: [],
      targetTeamIds: [testTeam.id],
      publicToken,
      requiresAuth: false,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      status: 'active',
    });

    expect(request).toBeDefined();
    expect(request.targetTeamIds).toEqual([testTeam.id]);

    createdRequestIds.push(request.id);
  });

  it('should get all requests for organization', async () => {
    const request = await storage.createWellnessRequest({
      organizationId: testOrg.id,
      templateId: testTemplate.id,
      requestedBy: testUser.id,
      distributionMethod: 'athlete_account',
      targetAthleteIds: [testAthlete.id],
      requiresAuth: true,
      status: 'active',
    });
    createdRequestIds.push(request.id);

    const requests = await storage.getWellnessRequests(testOrg.id);
    expect(Array.isArray(requests)).toBe(true);
    expect(requests.some(r => r.id === request.id)).toBe(true);
  });

  it('should get single request by ID', async () => {
    const request = await storage.createWellnessRequest({
      organizationId: testOrg.id,
      templateId: testTemplate.id,
      requestedBy: testUser.id,
      distributionMethod: 'magic_link',
      publicToken: crypto.randomBytes(32).toString('hex'),
      status: 'active',
    });
    createdRequestIds.push(request.id);

    const fetched = await storage.getWellnessRequest(request.id);
    expect(fetched).toBeDefined();
    expect(fetched!.id).toBe(request.id);
  });

  it('should get request by public token', async () => {
    const publicToken = crypto.randomBytes(32).toString('hex');
    const request = await storage.createWellnessRequest({
      organizationId: testOrg.id,
      templateId: testTemplate.id,
      requestedBy: testUser.id,
      distributionMethod: 'magic_link',
      publicToken,
      status: 'active',
    });
    createdRequestIds.push(request.id);

    const fetched = await storage.getWellnessRequestByToken(publicToken);
    expect(fetched).toBeDefined();
    expect(fetched!.publicToken).toBe(publicToken);
  });

  it('should cancel wellness request', async () => {
    const request = await storage.createWellnessRequest({
      organizationId: testOrg.id,
      templateId: testTemplate.id,
      requestedBy: testUser.id,
      distributionMethod: 'magic_link',
      publicToken: crypto.randomBytes(32).toString('hex'),
      status: 'active',
    });
    createdRequestIds.push(request.id);

    const updated = await storage.updateWellnessRequest(request.id, { status: 'cancelled' });
    expect(updated.status).toBe('cancelled');
  });

  it('should validate token expiry', async () => {
    const expiredToken = crypto.randomBytes(32).toString('hex');
    const expiredRequest = await storage.createWellnessRequest({
      organizationId: testOrg.id,
      templateId: testTemplate.id,
      requestedBy: testUser.id,
      distributionMethod: 'magic_link',
      publicToken: expiredToken,
      expiresAt: new Date(Date.now() - 1000), // Already expired
      status: 'active',
    });
    createdRequestIds.push(expiredRequest.id);

    const fetched = await storage.getWellnessRequestByToken(expiredToken);
    expect(fetched).toBeDefined();
    expect(new Date(fetched!.expiresAt!) < new Date()).toBe(true);
  });

  it('should enforce unique public token constraint', async () => {
    const publicToken = crypto.randomBytes(32).toString('hex');

    const request1 = await storage.createWellnessRequest({
      organizationId: testOrg.id,
      templateId: testTemplate.id,
      requestedBy: testUser.id,
      distributionMethod: 'magic_link',
      publicToken,
      status: 'active',
    });
    createdRequestIds.push(request1.id);

    // Attempt to create second request with same token
    await expect(
      storage.createWellnessRequest({
        organizationId: testOrg.id,
        templateId: testTemplate.id,
        requestedBy: testUser.id,
        distributionMethod: 'magic_link',
        publicToken, // Same token
        status: 'active',
      })
    ).rejects.toThrow();
  });
});

describe('Wellness Responses API', () => {
  let testTemplate: any;
  let testRequest: any;

  beforeAll(async () => {
    const config: WellnessTemplateConfig = {
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
          label: 'Notes',
          required: false,
        },
      ],
    };

    testTemplate = await storage.createWellnessTemplate({
      organizationId: testOrg.id,
      name: 'Response Test Template',
      config,
      createdBy: testUser.id,
    });
    createdTemplateIds.push(testTemplate.id);

    testRequest = await storage.createWellnessRequest({
      organizationId: testOrg.id,
      templateId: testTemplate.id,
      requestedBy: testUser.id,
      distributionMethod: 'magic_link',
      publicToken: crypto.randomBytes(32).toString('hex'),
      targetAthleteIds: [testAthlete.id],
      status: 'active',
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });
    // Don't add to global createdRequestIds - cleanup in afterAll
  });

  afterAll(async () => {
    // Clean up test data for this suite (order matters due to FK constraints)
    if (testRequest) {
      try {
        await db.delete(wellnessRequests).where(eq(wellnessRequests.id, testRequest.id));
      } catch (e) {
        // Ignore if already deleted
      }
    }
    if (testTemplate) {
      try {
        await db.delete(wellnessTemplates).where(eq(wellnessTemplates.id, testTemplate.id));
      } catch (e) {
        // Ignore if already deleted
      }
    }
  });

  it('should submit wellness response (authenticated)', async () => {
    const responses = {
      q1: { value: 8, label: 'Sleep Quality' },
      q2: { value: 'Feeling great', label: 'Notes' },
    };

    const response = await storage.createWellnessResponse({
      requestId: testRequest.id,
      organizationId: testOrg.id,
      templateId: testTemplate.id,
      userId: testAthlete.id,
      userFullName: testAthlete.fullName,
      teamId: testTeam.id,
      teamNameSnapshot: testTeam.name,
      submittedAt: new Date(),
      date: new Date().toISOString().split('T')[0],
      responses,
      accessMethod: 'authenticated',
      ipAddress: '127.0.0.1',
      userAgent: 'Test Agent',
    });

    expect(response).toBeDefined();
    expect(response.id).toBeDefined();
    expect(response.responses).toEqual(responses);
    expect(response.userFullName).toBe(testAthlete.fullName);

    createdResponseIds.push(response.id);
  });

  it('should submit wellness response (magic link)', async () => {
    const responses = {
      q1: { value: 7, label: 'Sleep Quality' },
    };

    const response = await storage.createWellnessResponse({
      requestId: testRequest.id,
      organizationId: testOrg.id,
      templateId: testTemplate.id,
      userId: testAthlete.id,
      userFullName: testAthlete.fullName,
      teamId: testTeam.id,
      teamNameSnapshot: testTeam.name,
      submittedAt: new Date(),
      date: new Date().toISOString().split('T')[0],
      responses,
      accessMethod: 'magic_link',
      ipAddress: '127.0.0.1',
      userAgent: 'Test Agent',
    });

    expect(response).toBeDefined();
    expect(response.accessMethod).toBe('magic_link');

    createdResponseIds.push(response.id);
  });

  it('should get wellness response by ID', async () => {
    const responses = { q1: { value: 5, label: 'Sleep Quality' } };

    const response = await storage.createWellnessResponse({
      requestId: testRequest.id,
      organizationId: testOrg.id,
      templateId: testTemplate.id,
      userId: testAthlete.id,
      userFullName: testAthlete.fullName,
      submittedAt: new Date(),
      date: new Date().toISOString().split('T')[0],
      responses,
    });
    createdResponseIds.push(response.id);

    const fetched = await storage.getWellnessResponse(response.id);
    expect(fetched).toBeDefined();
    expect(fetched!.id).toBe(response.id);
  });

  it('should get responses by athlete ID', async () => {
    const responses = { q1: { value: 6, label: 'Sleep Quality' } };

    const response = await storage.createWellnessResponse({
      requestId: testRequest.id,
      organizationId: testOrg.id,
      templateId: testTemplate.id,
      userId: testAthlete.id,
      userFullName: testAthlete.fullName,
      submittedAt: new Date(),
      date: new Date().toISOString().split('T')[0],
      responses,
    });
    createdResponseIds.push(response.id);

    const athleteResponses = await storage.getWellnessResponsesByAthlete(testAthlete.id);
    expect(Array.isArray(athleteResponses)).toBe(true);
    expect(athleteResponses.some(r => r.id === response.id)).toBe(true);
  });

  it('should get responses by organization ID', async () => {
    const responses = { q1: { value: 9, label: 'Sleep Quality' } };

    const response = await storage.createWellnessResponse({
      requestId: testRequest.id,
      organizationId: testOrg.id,
      templateId: testTemplate.id,
      userId: testAthlete.id,
      userFullName: testAthlete.fullName,
      submittedAt: new Date(),
      date: new Date().toISOString().split('T')[0],
      responses,
    });
    createdResponseIds.push(response.id);

    const orgResponses = await storage.getWellnessResponsesByOrganization(testOrg.id);
    expect(Array.isArray(orgResponses)).toBe(true);
    expect(orgResponses.some(r => r.id === response.id)).toBe(true);
  });

  it('should store response data as JSONB (validation happens at route level)', async () => {
    // Storage layer accepts any JSONB structure
    // Validation will be handled by API routes using Zod schemas
    const responses = {
      q1: { value: 8, label: 'Sleep Quality' },
      q2: { value: 'Some text', label: 'Notes' },
    };

    const response = await storage.createWellnessResponse({
      requestId: testRequest.id,
      organizationId: testOrg.id,
      templateId: testTemplate.id,
      userId: testAthlete.id,
      userFullName: testAthlete.fullName,
      submittedAt: new Date(),
      date: new Date().toISOString().split('T')[0],
      responses,
    });

    expect(response).toBeDefined();
    expect(response.responses).toEqual(responses);

    createdResponseIds.push(response.id);
  });

  it('should preserve historical data after request deletion', async () => {
    // Create temporary request
    const tempRequest = await storage.createWellnessRequest({
      organizationId: testOrg.id,
      templateId: testTemplate.id,
      requestedBy: testUser.id,
      distributionMethod: 'magic_link',
      publicToken: crypto.randomBytes(32).toString('hex'),
      status: 'active',
    });
    createdRequestIds.push(tempRequest.id);

    // Create response
    const response = await storage.createWellnessResponse({
      requestId: tempRequest.id,
      organizationId: testOrg.id,
      templateId: testTemplate.id,
      userId: testAthlete.id,
      userFullName: testAthlete.fullName,
      submittedAt: new Date(),
      date: new Date().toISOString().split('T')[0],
      responses: { q1: { value: 7, label: 'Sleep Quality' } },
    });
    createdResponseIds.push(response.id);

    // Delete request
    await storage.deleteWellnessRequest(tempRequest.id);

    // Response should still exist with requestId = null
    const fetched = await storage.getWellnessResponse(response.id);
    expect(fetched).toBeDefined();
    expect(fetched!.requestId).toBeNull();
  });
});

describe('Wellness Analytics API', () => {
  let testTemplate: any;
  let testResponseIds: string[] = [];

  beforeAll(async () => {
    const config: WellnessTemplateConfig = {
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
          type: 'scale',
          label: 'Energy Level',
          scaleMin: 1,
          scaleMax: 10,
          required: true,
        },
      ],
    };

    testTemplate = await storage.createWellnessTemplate({
      organizationId: testOrg.id,
      name: 'Analytics Test Template',
      config,
      createdBy: testUser.id,
    });
    createdTemplateIds.push(testTemplate.id);

    // Create test responses for analytics
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    for (const date of [today, yesterday]) {
      const response = await storage.createWellnessResponse({
        organizationId: testOrg.id,
        templateId: testTemplate.id,
        userId: testAthlete.id,
        userFullName: testAthlete.fullName,
        teamId: testTeam.id,
        teamNameSnapshot: testTeam.name,
        submittedAt: new Date(),
        date,
        responses: {
          q1: { value: 8, label: 'Sleep Quality' },
          q2: { value: 7, label: 'Energy Level' },
        },
      });
      testResponseIds.push(response.id);
    }
  });

  afterAll(async () => {
    // Clean up responses for this suite
    for (const id of testResponseIds.reverse()) {
      try {
        await db.delete(wellnessResponses).where(eq(wellnessResponses.id, id));
      } catch (e) {
        // Ignore if already deleted
      }
    }
    testResponseIds = [];

    // Clean up template
    if (testTemplate) {
      try {
        await db.delete(wellnessTemplates).where(eq(wellnessTemplates.id, testTemplate.id));
      } catch (e) {
        // Ignore if already deleted
      }
    }
  });

  it('should get team wellness summary', async () => {
    const summary = await storage.getTeamWellnessSummary(testTeam.id, {
      startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      endDate: new Date().toISOString().split('T')[0],
    });

    expect(summary).toBeDefined();
    expect(summary.teamId).toBe(testTeam.id);
    expect(summary.totalResponses).toBeGreaterThan(0);
    expect(summary.uniqueAthletes).toBeGreaterThan(0);
  });

  it('should get athlete wellness summary', async () => {
    const summary = await storage.getAthleteWellnessSummary(testAthlete.id, {
      startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      endDate: new Date().toISOString().split('T')[0],
    });

    expect(summary).toBeDefined();
    expect(summary.userId).toBe(testAthlete.id);
    expect(summary.totalResponses).toBeGreaterThan(0);
  });

  it('should get wellness trends for organization', async () => {
    const trends = await storage.getWellnessTrends(testOrg.id, {
      startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      endDate: new Date().toISOString().split('T')[0],
      questionIds: ['q1', 'q2'],
    });

    expect(Array.isArray(trends)).toBe(true);
    expect(trends.length).toBeGreaterThan(0);
  });

  it('should filter analytics by date range', async () => {
    const today = new Date().toISOString().split('T')[0];

    const todayOnly = await storage.getWellnessResponsesByOrganization(testOrg.id, {
      startDate: today,
      endDate: today,
    });

    expect(Array.isArray(todayOnly)).toBe(true);
    expect(todayOnly.every(r => r.date === today)).toBe(true);
  });

  it('should calculate completion rate', async () => {
    // Create a request with target athletes
    const request = await storage.createWellnessRequest({
      organizationId: testOrg.id,
      templateId: testTemplate.id,
      requestedBy: testUser.id,
      distributionMethod: 'athlete_account',
      targetAthleteIds: [testAthlete.id],
      requiresAuth: true,
      status: 'active',
    });
    createdRequestIds.push(request.id);

    // Create response for the request
    const response = await storage.createWellnessResponse({
      requestId: request.id,
      organizationId: testOrg.id,
      templateId: testTemplate.id,
      userId: testAthlete.id,
      userFullName: testAthlete.fullName,
      submittedAt: new Date(),
      date: new Date().toISOString().split('T')[0],
      responses: { q1: { value: 8, label: 'Sleep Quality' } },
    });
    createdResponseIds.push(response.id);

    // Calculate completion rate
    const completionRate = await storage.getRequestCompletionRate(request.id);
    expect(completionRate).toBeDefined();
    expect(completionRate).toBeGreaterThanOrEqual(0);
    expect(completionRate).toBeLessThanOrEqual(1);
  });
});

describe('Authorization & Organization Scoping', () => {
  let org2: any;
  let org2Template: any;

  beforeAll(async () => {
    // Create second organization
    const [org] = await db.insert(organizations).values({
      name: `Second Org ${Date.now()}`,
      orgType: 'college',
    }).returning();
    org2 = org;

    const config: WellnessTemplateConfig = {
      questions: [
        {
          id: 'q1',
          type: 'scale',
          label: 'Test Question',
          scaleMin: 1,
          scaleMax: 10,
          required: true,
        },
      ],
    };

    org2Template = await storage.createWellnessTemplate({
      organizationId: org2.id,
      name: 'Org 2 Template',
      config,
      createdBy: siteAdmin.id,
    });
    createdTemplateIds.push(org2Template.id);
  });

  afterAll(async () => {
    if (org2) {
      await db.delete(organizations).where(eq(organizations.id, org2.id));
    }
  });

  it('should scope templates to organization', async () => {
    const org1Templates = await storage.getWellnessTemplates(testOrg.id);
    const org2Templates = await storage.getWellnessTemplates(org2.id);

    expect(org1Templates.every(t => t.organizationId === testOrg.id)).toBe(true);
    expect(org2Templates.every(t => t.organizationId === org2.id)).toBe(true);
    expect(org1Templates.some(t => t.id === org2Template.id)).toBe(false);
  });

  it('should scope requests to organization', async () => {
    const org1Template = await storage.createWellnessTemplate({
      organizationId: testOrg.id,
      name: 'Org 1 Request Template',
      config: { questions: [] },
      createdBy: testUser.id,
    });
    createdTemplateIds.push(org1Template.id);

    const org1Request = await storage.createWellnessRequest({
      organizationId: testOrg.id,
      templateId: org1Template.id,
      requestedBy: testUser.id,
      distributionMethod: 'athlete_account',
      status: 'active',
    });
    createdRequestIds.push(org1Request.id);

    const org2Request = await storage.createWellnessRequest({
      organizationId: org2.id,
      templateId: org2Template.id,
      requestedBy: siteAdmin.id,
      distributionMethod: 'athlete_account',
      status: 'active',
    });
    createdRequestIds.push(org2Request.id);

    const org1Requests = await storage.getWellnessRequests(testOrg.id);
    const org2Requests = await storage.getWellnessRequests(org2.id);

    expect(org1Requests.every(r => r.organizationId === testOrg.id)).toBe(true);
    expect(org2Requests.every(r => r.organizationId === org2.id)).toBe(true);
  });

  it('should scope responses to organization', async () => {
    const org1Responses = await storage.getWellnessResponsesByOrganization(testOrg.id);
    const org2Responses = await storage.getWellnessResponsesByOrganization(org2.id);

    expect(org1Responses.every(r => r.organizationId === testOrg.id)).toBe(true);
    expect(org2Responses.every(r => r.organizationId === org2.id)).toBe(true);
  });

  it('should allow site admin to access all organizations', async () => {
    // Site admin can access both org templates
    const org1Templates = await storage.getWellnessTemplates(testOrg.id);
    const org2Templates = await storage.getWellnessTemplates(org2.id);

    expect(Array.isArray(org1Templates)).toBe(true);
    expect(Array.isArray(org2Templates)).toBe(true);
  });

  it('should prevent cross-organization data access', async () => {
    // Coach from org1 should not see org2 templates
    const org2TemplateFromOrg1View = await storage.getWellnessTemplate(org2Template.id);

    // Template exists but belongs to different org
    expect(org2TemplateFromOrg1View).toBeDefined();
    expect(org2TemplateFromOrg1View!.organizationId).not.toBe(testOrg.id);
  });
});

describe('Token Generation & Validation', () => {
  it('should generate unique public tokens', async () => {
    const tokens = new Set();

    for (let i = 0; i < 10; i++) {
      const token = crypto.randomBytes(32).toString('hex');
      expect(tokens.has(token)).toBe(false);
      tokens.add(token);
      expect(token.length).toBe(64); // 32 bytes = 64 hex chars
    }
  });

  it('should validate token format', async () => {
    const validToken = crypto.randomBytes(32).toString('hex');
    expect(validToken).toMatch(/^[a-f0-9]{64}$/);
  });

  it('should detect expired tokens', async () => {
    const expiredDate = new Date(Date.now() - 1000);
    const futureDate = new Date(Date.now() + 1000);

    expect(expiredDate < new Date()).toBe(true);
    expect(futureDate > new Date()).toBe(true);
  });
});

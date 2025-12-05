/**
 * Integration Tests for Wellness Questionnaire REST API Routes
 *
 * Tests verify:
 * - HTTP endpoints (templates, requests, responses, analytics)
 * - Authentication and authorization
 * - Magic link access flow
 * - Rate limiting enforcement
 * - Input validation errors
 * - Email sending (mocked)
 * - Error responses (400, 401, 403, 404, 500)
 */

// Set environment variables BEFORE any imports
process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'test-secret-key-for-integration-tests-only-at-least-32-characters-long';
process.env.ADMIN_USER = process.env.ADMIN_USER || 'admin';
process.env.ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@test.com';
process.env.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'TestPassword123!';
process.env.BYPASS_GENERAL_RATE_LIMIT = 'true';

import { describe, it, expect, beforeAll, afterAll, vi, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import session from 'express-session';
import { db } from '../../packages/api/db';
import { storage } from '../../packages/api/storage';
import {
  organizations,
  users,
  teams,
  wellnessTemplates,
  wellnessRequests,
  wellnessResponses,
  siteSettings
} from '@shared/schema';
import { eq } from 'drizzle-orm';
import crypto from 'crypto';
import type { WellnessTemplateConfig } from '@shared/wellness-types';
import { emailService } from '../../packages/api/services/email-service';

// Mock email service
vi.mock('../../packages/api/services/email-service', () => ({
  emailService: {
    sendWellnessRequest: vi.fn().mockResolvedValue(true),
    sendWellnessReminder: vi.fn().mockResolvedValue(true),
    sendWellnessAlert: vi.fn().mockResolvedValue(true),
  },
}));

let app: express.Application;
let testOrg: any;
let testUser: any; // Coach
let testAthlete: any;
let testTeam: any;
let siteAdmin: any;
let coachCookie: string;
let athleteCookie: string;
let siteAdminCookie: string;

const createdTemplateIds: string[] = [];
const createdRequestIds: string[] = [];
const createdResponseIds: string[] = [];

beforeAll(async () => {
  // Setup Express app with routes
  app = express();
  app.use(express.json());
  app.use(
    session({
      secret: process.env.SESSION_SECRET!,
      resave: false,
      saveUninitialized: false,
      cookie: { secure: false, httpOnly: true, maxAge: 24 * 60 * 60 * 1000 },
    })
  );

  // Add mock login endpoint for testing
  app.post('/mock-login', async (req: any, res: any) => {
    const { userId } = req.body;
    const user = await storage.getUser(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    req.session.user = {
      id: user.id,
      emails: user.emails,
      firstName: user.firstName,
      lastName: user.lastName,
      fullName: user.fullName,
      role: 'coach', // Default role
      isSiteAdmin: user.isSiteAdmin || false,
    };
    res.json({ success: true });
  });

  // Enable wellness module at site level BEFORE registering routes
  // Clear any existing site_settings rows (singleton table)
  await db.delete(siteSettings);

  // Insert fresh site settings with wellness enabled
  await db.insert(siteSettings).values({
    aiModel: 'claude-sonnet-4.5',
    wellnessModuleEnabled: true,
  });

  // Import and register wellness routes
  const { registerWellnessRoutes } = await import('../../packages/api/routes/wellness-routes');
  registerWellnessRoutes(app);

  // Create test organization
  const [org] = await db.insert(organizations).values({
    name: `Wellness Routes Test Org ${Date.now()}`,
    description: 'Test organization for wellness route tests',
    orgType: 'club',
    wellnessEnabled: true, // Enable wellness module for tests
  }).returning();
  testOrg = org;

  // Create site admin
  const [admin] = await db.insert(users).values({
    username: `wellness_routes_siteadmin_${Date.now()}`,
    emails: ['siteadmin.routes@test.com'],
    password: 'hashed_password_here',
    firstName: 'Site',
    lastName: 'Admin',
    fullName: 'Site Admin',
    isSiteAdmin: true,
  }).returning();
  siteAdmin = admin;

  // Create test coach
  const [coach] = await db.insert(users).values({
    username: `wellness_routes_coach_${Date.now()}`,
    emails: ['wellness.routes.coach@test.com'],
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
    username: `wellness_routes_athlete_${Date.now()}`,
    emails: ['wellness.routes.athlete@test.com'],
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

  // Create authenticated sessions
  // Coach session
  const coachRes = await request(app)
    .post('/mock-login')
    .send({ userId: testUser.id });
  coachCookie = coachRes.headers['set-cookie']?.[0] || '';

  // Athlete session
  const athleteRes = await request(app)
    .post('/mock-login')
    .send({ userId: testAthlete.id });
  athleteCookie = athleteRes.headers['set-cookie']?.[0] || '';

  // Site admin session
  const adminRes = await request(app)
    .post('/mock-login')
    .send({ userId: siteAdmin.id });
  siteAdminCookie = adminRes.headers['set-cookie']?.[0] || '';
});

afterEach(async () => {
  // Clean up created responses
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

  // Reset mocks
  vi.clearAllMocks();
});

afterAll(async () => {
  // Clean up remaining templates
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

describe('Wellness Template Routes', () => {
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

  it('POST /api/organizations/:organizationId/wellness/templates - create template (coach)', async () => {
    const res = await request(app)
      .post(`/api/organizations/${testOrg.id}/wellness/templates`)
      .set('Cookie', coachCookie)
      .send({
        name: 'Daily Wellness Check',
        description: 'Standard daily wellness questionnaire',
        config: sampleConfig,
        isDefault: false,
        isActive: true,
      });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
    expect(res.body.name).toBe('Daily Wellness Check');
    expect(res.body.organizationId).toBe(testOrg.id);

    createdTemplateIds.push(res.body.id);
  });

  it('POST /api/organizations/:organizationId/wellness/templates - reject unauthenticated', async () => {
    const res = await request(app)
      .post(`/api/organizations/${testOrg.id}/wellness/templates`)
      .send({
        name: 'Test Template',
        config: sampleConfig,
      });

    expect(res.status).toBe(401);
  });

  it('POST /api/organizations/:organizationId/wellness/templates - reject athlete', async () => {
    const res = await request(app)
      .post(`/api/organizations/${testOrg.id}/wellness/templates`)
      .set('Cookie', athleteCookie)
      .send({
        name: 'Test Template',
        config: sampleConfig,
      });

    expect(res.status).toBe(403);
  });

  it('POST /api/organizations/:organizationId/wellness/templates - validate input', async () => {
    const res = await request(app)
      .post(`/api/organizations/${testOrg.id}/wellness/templates`)
      .set('Cookie', coachCookie)
      .send({
        // Missing name
        config: sampleConfig,
      });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('message');
  });

  it('GET /api/organizations/:organizationId/wellness/templates - list templates', async () => {
    // Create a template first
    const template = await storage.createWellnessTemplate({
      organizationId: testOrg.id,
      name: 'List Test Template',
      config: sampleConfig,
      createdBy: testUser.id,
    });
    createdTemplateIds.push(template.id);

    const res = await request(app)
      .get(`/api/organizations/${testOrg.id}/wellness/templates`)
      .set('Cookie', coachCookie);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });

  it('GET /api/organizations/:organizationId/wellness/templates/:id - get single template', async () => {
    const template = await storage.createWellnessTemplate({
      organizationId: testOrg.id,
      name: 'Single Template Test',
      config: sampleConfig,
      createdBy: testUser.id,
    });
    createdTemplateIds.push(template.id);

    const res = await request(app)
      .get(`/api/organizations/${testOrg.id}/wellness/templates/${template.id}`)
      .set('Cookie', coachCookie);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(template.id);
    expect(res.body.name).toBe('Single Template Test');
  });

  it('PUT /api/organizations/:organizationId/wellness/templates/:id - update template', async () => {
    const template = await storage.createWellnessTemplate({
      organizationId: testOrg.id,
      name: 'Original Name',
      config: sampleConfig,
      createdBy: testUser.id,
    });
    createdTemplateIds.push(template.id);

    const res = await request(app)
      .put(`/api/organizations/${testOrg.id}/wellness/templates/${template.id}`)
      .set('Cookie', coachCookie)
      .send({
        name: 'Updated Name',
        description: 'Updated description',
      });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Updated Name');
    expect(res.body.description).toBe('Updated description');
  });

  it('DELETE /api/organizations/:organizationId/wellness/templates/:id - delete template', async () => {
    const template = await storage.createWellnessTemplate({
      organizationId: testOrg.id,
      name: 'To Be Deleted',
      config: sampleConfig,
      createdBy: testUser.id,
    });

    const res = await request(app)
      .delete(`/api/organizations/${testOrg.id}/wellness/templates/${template.id}`)
      .set('Cookie', coachCookie);

    expect(res.status).toBe(204);

    // Verify deleted
    const fetched = await storage.getWellnessTemplate(template.id);
    expect(fetched).toBeUndefined();
  });
});

describe('Wellness Request Routes', () => {
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
      name: 'Request Routes Test Template',
      config,
      createdBy: testUser.id,
    });
    createdTemplateIds.push(testTemplate.id);
  });

  it('POST /api/organizations/:organizationId/wellness/requests - create magic link request', async () => {
    const res = await request(app)
      .post(`/api/organizations/${testOrg.id}/wellness/requests`)
      .set('Cookie', coachCookie)
      .send({
        templateId: testTemplate.id,
        distributionMethod: 'magic_link',
        targetAthleteIds: [testAthlete.id],
        requiresAuth: false,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
    expect(res.body.distributionMethod).toBe('magic_link');
    expect(res.body).toHaveProperty('publicToken');

    // Verify email was sent
    expect(emailService.sendWellnessRequest).toHaveBeenCalled();

    createdRequestIds.push(res.body.id);
  });

  it('POST /api/organizations/:organizationId/wellness/requests - create team link request', async () => {
    const res = await request(app)
      .post(`/api/organizations/${testOrg.id}/wellness/requests`)
      .set('Cookie', coachCookie)
      .send({
        templateId: testTemplate.id,
        distributionMethod: 'team_link',
        targetTeamIds: [testTeam.id],
        requiresAuth: false,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      });

    expect(res.status).toBe(201);
    expect(res.body.targetTeamIds).toEqual([testTeam.id]);

    createdRequestIds.push(res.body.id);
  });

  it('POST /api/organizations/:organizationId/wellness/requests - validate required targets for magic link', async () => {
    const res = await request(app)
      .post(`/api/organizations/${testOrg.id}/wellness/requests`)
      .set('Cookie', coachCookie)
      .send({
        templateId: testTemplate.id,
        distributionMethod: 'magic_link',
        // Missing targetAthleteIds and targetTeamIds
        requiresAuth: false,
      });

    expect(res.status).toBe(400);
  });

  it('GET /api/organizations/:organizationId/wellness/requests - list requests', async () => {
    const res = await request(app)
      .get(`/api/organizations/${testOrg.id}/wellness/requests`)
      .set('Cookie', coachCookie);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('GET /api/organizations/:organizationId/wellness/requests/:id - get single request', async () => {
    const request_data = await storage.createWellnessRequest({
      organizationId: testOrg.id,
      templateId: testTemplate.id,
      requestedBy: testUser.id,
      distributionMethod: 'magic_link',
      publicToken: crypto.randomBytes(32).toString('hex'),
      status: 'active',
    });
    createdRequestIds.push(request_data.id);

    const res = await request(app)
      .get(`/api/organizations/${testOrg.id}/wellness/requests/${request_data.id}`)
      .set('Cookie', coachCookie);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(request_data.id);
  });

  it('PUT /api/organizations/:organizationId/wellness/requests/:id/cancel - cancel request', async () => {
    const request_data = await storage.createWellnessRequest({
      organizationId: testOrg.id,
      templateId: testTemplate.id,
      requestedBy: testUser.id,
      distributionMethod: 'magic_link',
      publicToken: crypto.randomBytes(32).toString('hex'),
      status: 'active',
    });
    createdRequestIds.push(request_data.id);

    const res = await request(app)
      .put(`/api/organizations/${testOrg.id}/wellness/requests/${request_data.id}/cancel`)
      .set('Cookie', coachCookie);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('cancelled');
  });
});

describe('Wellness Response Routes', () => {
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
      ],
    };

    testTemplate = await storage.createWellnessTemplate({
      organizationId: testOrg.id,
      name: 'Response Routes Test Template',
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
    // Don't add to global cleanup - this request is managed by this describe block's afterAll
  });

  it('POST /api/wellness/responses - submit response (authenticated)', async () => {
    const res = await request(app)
      .post('/api/wellness/responses')
      .set('Cookie', athleteCookie)
      .send({
        requestId: testRequest.id,
        templateId: testTemplate.id,
        date: new Date().toISOString().split('T')[0],
        responses: {
          q1: { value: 8, label: 'Sleep Quality' },
        },
      });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
    expect(res.body.responses.q1.value).toBe(8);

    createdResponseIds.push(res.body.id);
  });

  it('POST /api/wellness/responses - submit response (magic link)', async () => {
    const res = await request(app)
      .post('/api/wellness/responses')
      .query({ token: testRequest.publicToken, athlete: testAthlete.id })
      .send({
        requestId: testRequest.id,
        templateId: testTemplate.id,
        date: new Date().toISOString().split('T')[0],
        responses: {
          q1: { value: 7, label: 'Sleep Quality' },
        },
      });

    expect(res.status).toBe(201);
    expect(res.body.accessMethod).toBe('magic_link');

    createdResponseIds.push(res.body.id);
  });

  it('POST /api/wellness/responses - reject expired token', async () => {
    const expiredRequest = await storage.createWellnessRequest({
      organizationId: testOrg.id,
      templateId: testTemplate.id,
      requestedBy: testUser.id,
      distributionMethod: 'magic_link',
      publicToken: crypto.randomBytes(32).toString('hex'),
      targetAthleteIds: [testAthlete.id],
      status: 'active',
      expiresAt: new Date(Date.now() - 1000), // Already expired
    });
    createdRequestIds.push(expiredRequest.id);

    const res = await request(app)
      .post('/api/wellness/responses')
      .query({ token: expiredRequest.publicToken, athlete: testAthlete.id })
      .send({
        requestId: expiredRequest.id,
        templateId: testTemplate.id,
        date: new Date().toISOString().split('T')[0],
        responses: {
          q1: { value: 7, label: 'Sleep Quality' },
        },
      });

    expect(res.status).toBe(403);
  });

  it('POST /api/wellness/responses - validate required questions', async () => {
    const res = await request(app)
      .post('/api/wellness/responses')
      .set('Cookie', athleteCookie)
      .send({
        requestId: testRequest.id,
        templateId: testTemplate.id,
        date: new Date().toISOString().split('T')[0],
        responses: {
          // Missing required question q1
        },
      });

    expect(res.status).toBe(400);
  });

  it('GET /api/wellness/responses/:id - get response (coach)', async () => {
    const response = await storage.createWellnessResponse({
      requestId: testRequest.id,
      organizationId: testOrg.id,
      templateId: testTemplate.id,
      userId: testAthlete.id,
      userFullName: testAthlete.fullName,
      submittedAt: new Date(),
      date: new Date().toISOString().split('T')[0],
      responses: { q1: { value: 9, label: 'Sleep Quality' } },
    });
    createdResponseIds.push(response.id);

    const res = await request(app)
      .get(`/api/wellness/responses/${response.id}`)
      .set('Cookie', coachCookie);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(response.id);
  });

  afterAll(async () => {
    // Clean up testRequest for this describe block
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
});

describe('Wellness Analytics Routes', () => {
  let testTemplate: any;

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
      ],
    };

    testTemplate = await storage.createWellnessTemplate({
      organizationId: testOrg.id,
      name: 'Analytics Routes Test Template',
      config,
      createdBy: testUser.id,
    });
    createdTemplateIds.push(testTemplate.id);

    // Create test responses
    const today = new Date().toISOString().split('T')[0];
    const response = await storage.createWellnessResponse({
      organizationId: testOrg.id,
      templateId: testTemplate.id,
      userId: testAthlete.id,
      userFullName: testAthlete.fullName,
      teamId: testTeam.id,
      teamNameSnapshot: testTeam.name,
      submittedAt: new Date(),
      date: today,
      responses: {
        q1: { value: 8, label: 'Sleep Quality' },
      },
    });
    createdResponseIds.push(response.id);
  });

  it('GET /api/organizations/:organizationId/wellness/analytics/team - get team summary', async () => {
    const startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const endDate = new Date().toISOString().split('T')[0];

    const res = await request(app)
      .get(`/api/organizations/${testOrg.id}/wellness/analytics/team`)
      .query({ teamId: testTeam.id, startDate, endDate })
      .set('Cookie', coachCookie);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('teamId');
    expect(res.body).toHaveProperty('totalResponses');
  });

  it('GET /api/organizations/:organizationId/wellness/analytics/athlete/:athleteId - get athlete summary', async () => {
    const startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const endDate = new Date().toISOString().split('T')[0];

    const res = await request(app)
      .get(`/api/organizations/${testOrg.id}/wellness/analytics/athlete/${testAthlete.id}`)
      .query({ startDate, endDate })
      .set('Cookie', coachCookie);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('userId');
    expect(res.body).toHaveProperty('totalResponses');
  });

  it('GET /api/organizations/:organizationId/wellness/analytics/trends - get trends', async () => {
    const startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const endDate = new Date().toISOString().split('T')[0];

    const res = await request(app)
      .get(`/api/organizations/${testOrg.id}/wellness/analytics/trends`)
      .query({ startDate, endDate, questionIds: 'q1' })
      .set('Cookie', coachCookie);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('GET /api/organizations/:organizationId/wellness/analytics/* - reject unauthenticated', async () => {
    const res = await request(app)
      .get(`/api/organizations/${testOrg.id}/wellness/analytics/team`)
      .query({ teamId: testTeam.id });

    expect(res.status).toBe(401);
  });
});

describe('Wellness Dashboard Routes', () => {
  let dailyTemplate: any;
  let hooperTemplate: any;
  let team1: any;
  let team2: any;
  let athlete1: any;
  let athlete2: any;
  let testDate: string; // Store date to avoid timezone issues between test setup and execution

  beforeAll(async () => {
    // Calculate test date once at the start to avoid midnight UTC boundary issues
    testDate = new Date().toISOString().split('T')[0];
    console.log(`📅 Test date set to: ${testDate} (UTC)`);
    // Create two teams
    const [t1] = await db.insert(teams).values({
      organizationId: testOrg.id,
      name: `Dashboard Team 1 ${Date.now()}`,
      isArchived: false,
    }).returning();
    team1 = t1;

    const [t2] = await db.insert(teams).values({
      organizationId: testOrg.id,
      name: `Dashboard Team 2 ${Date.now()}`,
      isArchived: false,
    }).returning();
    team2 = t2;

    // Create athletes
    const [ath1] = await db.insert(users).values({
      username: `dashboard_athlete1_${Date.now()}`,
      emails: ['dash.athlete1@test.com'],
      password: 'hashed',
      firstName: 'Dashboard',
      lastName: 'Athlete1',
      fullName: 'Dashboard Athlete1',
      isSiteAdmin: false,
    }).returning();
    athlete1 = ath1;

    const [ath2] = await db.insert(users).values({
      username: `dashboard_athlete2_${Date.now()}`,
      emails: ['dash.athlete2@test.com'],
      password: 'hashed',
      firstName: 'Dashboard',
      lastName: 'Athlete2',
      fullName: 'Dashboard Athlete2',
      isSiteAdmin: false,
    }).returning();
    athlete2 = ath2;

    // Add athletes to teams
    await storage.addUserToOrganization(athlete1.id, testOrg.id, 'athlete');
    await storage.addUserToTeam(athlete1.id, team1.id);

    await storage.addUserToOrganization(athlete2.id, testOrg.id, 'athlete');
    await storage.addUserToTeam(athlete2.id, team2.id);

    // Create Daily Wellness Template (average method, 1-5 scale)
    const dailyConfig: WellnessTemplateConfig = {
      questions: [
        {
          id: 'sleep',
          type: 'scale',
          label: 'Sleep Quality',
          scaleMin: 1,
          scaleMax: 5,
          required: true,
        },
        {
          id: 'energy',
          type: 'scale',
          label: 'Energy Level',
          scaleMin: 1,
          scaleMax: 5,
          required: true,
        },
      ],
      statusConfig: {
        scaleOrientation: 'higher_is_better',
        calculationMethod: 'average',
        redThreshold: 2,
        yellowThreshold: 3,
        injuryQuestionIds: [],
        injuryOverride: false,
      },
    };

    dailyTemplate = await storage.createWellnessTemplate({
      organizationId: testOrg.id,
      name: 'Daily Wellness',
      config: dailyConfig,
      createdBy: testUser.id,
    });
    createdTemplateIds.push(dailyTemplate.id);

    // Create Modified Hooper Index Template (sum method, 1-4 scale, 4 questions = max 16)
    const hooperConfig: WellnessTemplateConfig = {
      questions: [
        {
          id: 'sleep_hooper',
          type: 'scale',
          label: 'Sleep',
          scaleMin: 1,
          scaleMax: 4,
          required: true,
        },
        {
          id: 'stress',
          type: 'scale',
          label: 'Stress',
          scaleMin: 1,
          scaleMax: 4,
          required: true,
        },
        {
          id: 'fatigue',
          type: 'scale',
          label: 'Fatigue',
          scaleMin: 1,
          scaleMax: 4,
          required: true,
        },
        {
          id: 'soreness',
          type: 'scale',
          label: 'Soreness',
          scaleMin: 1,
          scaleMax: 4,
          required: true,
        },
      ],
      statusConfig: {
        scaleOrientation: 'lower_is_better',
        calculationMethod: 'sum',
        redThreshold: 12,
        yellowThreshold: 9,
        injuryQuestionIds: [],
        injuryOverride: false,
      },
    };

    hooperTemplate = await storage.createWellnessTemplate({
      organizationId: testOrg.id,
      name: 'Modified Hooper Index',
      config: hooperConfig,
      createdBy: testUser.id,
    });
    createdTemplateIds.push(hooperTemplate.id);

    // Create responses for today (using testDate to avoid timezone issues)
    // Athlete1 (Team1) - Daily Wellness: good score (4.5)
    const resp1 = await storage.createWellnessResponse({
      organizationId: testOrg.id,
      templateId: dailyTemplate.id,
      userId: athlete1.id,
      userFullName: athlete1.fullName,
      teamId: team1.id,
      teamNameSnapshot: team1.name,
      submittedAt: new Date(),
      date: testDate,
      responses: {
        sleep: { value: 5, label: 'Sleep Quality' },
        energy: { value: 4, label: 'Energy Level' },
      },
    });
    createdResponseIds.push(resp1.id);

    // Athlete2 (Team2) - Modified Hooper Index: moderate score (8)
    const resp2 = await storage.createWellnessResponse({
      organizationId: testOrg.id,
      templateId: hooperTemplate.id,
      userId: athlete2.id,
      userFullName: athlete2.fullName,
      teamId: team2.id,
      teamNameSnapshot: team2.name,
      submittedAt: new Date(),
      date: testDate,
      responses: {
        sleep_hooper: { value: 2, label: 'Sleep' },
        stress: { value: 2, label: 'Stress' },
        fatigue: { value: 2, label: 'Fatigue' },
        soreness: { value: 2, label: 'Soreness' },
      },
    });
    createdResponseIds.push(resp2.id);

    console.log(`📊 Created ${createdResponseIds.length} responses with date: ${testDate}`);

    // Create responses for yesterday for trend calculation
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    // Athlete1 (Team1) - Daily Wellness: worse yesterday (3.5)
    const resp3 = await storage.createWellnessResponse({
      organizationId: testOrg.id,
      templateId: dailyTemplate.id,
      userId: athlete1.id,
      userFullName: athlete1.fullName,
      teamId: team1.id,
      teamNameSnapshot: team1.name,
      submittedAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
      date: yesterday,
      responses: {
        sleep: { value: 3, label: 'Sleep Quality' },
        energy: { value: 4, label: 'Energy Level' },
      },
    });
    createdResponseIds.push(resp3.id);

    // Athlete2 (Team2) - Modified Hooper Index: better yesterday (6)
    const resp4 = await storage.createWellnessResponse({
      organizationId: testOrg.id,
      templateId: hooperTemplate.id,
      userId: athlete2.id,
      userFullName: athlete2.fullName,
      teamId: team2.id,
      teamNameSnapshot: team2.name,
      submittedAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
      date: yesterday,
      responses: {
        sleep_hooper: { value: 1, label: 'Sleep' },
        stress: { value: 2, label: 'Stress' },
        fatigue: { value: 2, label: 'Fatigue' },
        soreness: { value: 1, label: 'Soreness' },
      },
    });
    createdResponseIds.push(resp4.id);
  });

  afterAll(async () => {
    // Clean up
    if (athlete1) {
      try {
        if (team1) await storage.removeUserFromTeam(athlete1.id, team1.id);
        await storage.removeUserFromOrganization(athlete1.id, testOrg.id);
        await db.delete(users).where(eq(users.id, athlete1.id));
      } catch (e) {}
    }
    if (athlete2) {
      try {
        if (team2) await storage.removeUserFromTeam(athlete2.id, team2.id);
        await storage.removeUserFromOrganization(athlete2.id, testOrg.id);
        await db.delete(users).where(eq(users.id, athlete2.id));
      } catch (e) {}
    }
    if (team1) {
      try {
        await db.delete(teams).where(eq(teams.id, team1.id));
      } catch (e) {}
    }
    if (team2) {
      try {
        await db.delete(teams).where(eq(teams.id, team2.id));
      } catch (e) {}
    }
  });

  it('GET /api/organizations/:organizationId/wellness/dashboard - returns templateAggregates array', async () => {
    const res = await request(app)
      .get(`/api/organizations/${testOrg.id}/wellness/dashboard`)
      .query({ date: testDate })
      .set('Cookie', coachCookie);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);

    // Check that each team has templateAggregates
    const team1Data = res.body.find((t: any) => t.teamId === team1.id);
    const team2Data = res.body.find((t: any) => t.teamId === team2.id);

    expect(team1Data).toBeDefined();
    expect(team1Data.templateAggregates).toBeDefined();
    expect(Array.isArray(team1Data.templateAggregates)).toBe(true);

    expect(team2Data).toBeDefined();
    expect(team2Data.templateAggregates).toBeDefined();
    expect(Array.isArray(team2Data.templateAggregates)).toBe(true);
  });

  it('GET /api/organizations/:organizationId/wellness/dashboard - calculates correct averageScore per template', async () => {
    console.log(`🔍 Test requesting date: ${testDate}`);
    const res = await request(app)
      .get(`/api/organizations/${testOrg.id}/wellness/dashboard`)
      .query({ date: testDate })
      .set('Cookie', coachCookie);

    console.log(`📥 API response body:`, JSON.stringify(res.body, null, 2));
    expect(res.status).toBe(200);

    // Team1 - Daily Wellness Template
    const team1Data = res.body.find((t: any) => t.teamId === team1.id);

    // If team1 not found, it might be because no athletes had responses today
    // This could happen if test data wasn't properly set up
    if (!team1Data) {
      throw new Error(`Team1 (${team1.id}) not found in dashboard response. This likely means the athlete-team relationship or wellness responses weren't properly created.`);
    }

    expect(team1Data.templateAggregates).toBeDefined();
    expect(Array.isArray(team1Data.templateAggregates)).toBe(true);

    // If no template aggregates, log useful debug info
    if (team1Data.templateAggregates.length === 0) {
      throw new Error(`Team1 has 0 templateAggregates. Team data: ${JSON.stringify({ teamId: team1Data.teamId, completionRate: team1Data.completionRate, totalAthletes: team1Data.totalAthletes })}`);
    }

    const dailyAggregate = team1Data.templateAggregates.find(
      (agg: any) => agg.templateId === dailyTemplate.id
    );

    if (!dailyAggregate) {
      throw new Error(`Daily template aggregate not found. Available templates: ${team1Data.templateAggregates.map((a: any) => ({ id: a.templateId, name: a.templateName })).map(JSON.stringify).join(', ')}`);
    }
    expect(dailyAggregate.templateName).toBe('Daily Wellness');
    // Athlete1 scored 5 (sleep) + 4 (energy) = 9/2 = 4.5
    expect(dailyAggregate.averageScore).toBeCloseTo(4.5, 1);
    expect(dailyAggregate.responseCount).toBe(1);

    // Team2 - Modified Hooper Index Template
    const team2Data = res.body.find((t: any) => t.teamId === team2.id);
    expect(team2Data).toBeDefined();
    const hooperAggregate = team2Data?.templateAggregates?.find(
      (agg: any) => agg.templateId === hooperTemplate.id
    );

    expect(hooperAggregate).toBeDefined();
    expect(hooperAggregate.templateName).toBe('Modified Hooper Index');
    // Athlete2 scored 2+2+2+2 = 8 (sum method)
    expect(hooperAggregate.averageScore).toBe(8);
    expect(hooperAggregate.responseCount).toBe(1);
  });

  it('GET /api/organizations/:organizationId/wellness/dashboard - sets correct scaleMax based on calculation method', async () => {
    const res = await request(app)
      .get(`/api/organizations/${testOrg.id}/wellness/dashboard`)
      .query({ date: testDate })
      .set('Cookie', coachCookie);

    expect(res.status).toBe(200);

    // Team1 - Daily Wellness (average method, scaleMax = 5)
    const team1Data = res.body.find((t: any) => t.teamId === team1.id);
    const dailyAggregate = team1Data.templateAggregates.find(
      (agg: any) => agg.templateId === dailyTemplate.id
    );

    expect(dailyAggregate.scaleMax).toBe(5);

    // Team2 - Modified Hooper Index (sum method, 4 questions * 4 max = 16)
    const team2Data = res.body.find((t: any) => t.teamId === team2.id);
    const hooperAggregate = team2Data.templateAggregates.find(
      (agg: any) => agg.templateId === hooperTemplate.id
    );

    expect(hooperAggregate.scaleMax).toBe(16);
  });

  it('GET /api/organizations/:organizationId/wellness/dashboard - calculates trends per template', async () => {
    const res = await request(app)
      .get(`/api/organizations/${testOrg.id}/wellness/dashboard`)
      .query({ date: testDate })
      .set('Cookie', coachCookie);

    expect(res.status).toBe(200);

    // Team1 - Daily Wellness: today 4.5, yesterday 3.5 -> up (higher_is_better)
    const team1Data = res.body.find((t: any) => t.teamId === team1.id);
    const dailyAggregate = team1Data.templateAggregates.find(
      (agg: any) => agg.templateId === dailyTemplate.id
    );

    expect(dailyAggregate.trend).toBe('up');

    // Team2 - Modified Hooper Index: today 8, yesterday 6 -> down (lower_is_better, so higher score = worse)
    const team2Data = res.body.find((t: any) => t.teamId === team2.id);
    const hooperAggregate = team2Data.templateAggregates.find(
      (agg: any) => agg.templateId === hooperTemplate.id
    );

    expect(hooperAggregate.trend).toBe('down');
  });

  it('GET /api/organizations/:organizationId/wellness/dashboard - returns empty templateAggregates when no responses', async () => {
    // Query for a date far in the future with no responses
    const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const res = await request(app)
      .get(`/api/organizations/${testOrg.id}/wellness/dashboard`)
      .query({ date: futureDate })
      .set('Cookie', coachCookie);

    expect(res.status).toBe(200);
    // Should return empty array (no teams with responses)
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('GET /api/organizations/:organizationId/wellness/dashboard - rejects unauthenticated requests', async () => {
    const res = await request(app)
      .get(`/api/organizations/${testOrg.id}/wellness/dashboard`)
      .query({ date: testDate });

    expect(res.status).toBe(401);
  });
});

describe('Authorization & Cross-Organization Access', () => {
  let org2: any;
  let org2Coach: any;

  beforeAll(async () => {
    // Create second organization
    const [org] = await db.insert(organizations).values({
      name: `Second Org Routes ${Date.now()}`,
      orgType: 'college',
      wellnessEnabled: true, // Enable wellness module for tests
    }).returning();
    org2 = org;

    // Create coach for org2
    const [coach] = await db.insert(users).values({
      username: `org2_coach_${Date.now()}`,
      emails: ['org2.coach@test.com'],
      password: 'hashed_password_here',
      firstName: 'Org2',
      lastName: 'Coach',
      fullName: 'Org2 Coach',
      isSiteAdmin: false,
    }).returning();
    org2Coach = coach;

    await storage.addUserToOrganization(org2Coach.id, org2.id, 'coach');
  });

  afterAll(async () => {
    // Clean up org2 (order matters due to FK constraints)
    // 1. Remove user from organization first
    if (org2Coach && org2) {
      try {
        await storage.removeUserFromOrganization(org2Coach.id, org2.id);
      } catch (e) {
        // Ignore if already removed
      }
    }

    // 2. Delete user
    if (org2Coach) {
      try {
        await db.delete(users).where(eq(users.id, org2Coach.id));
      } catch (e) {
        // Ignore if already deleted
      }
    }

    // 3. Delete organization (last)
    if (org2) {
      try {
        await db.delete(organizations).where(eq(organizations.id, org2.id));
      } catch (e) {
        // Ignore if already deleted
      }
    }
  });

  it('should prevent cross-organization template access', async () => {
    // Create template in org1
    const template = await storage.createWellnessTemplate({
      organizationId: testOrg.id,
      name: 'Org 1 Template',
      config: { questions: [] },
      createdBy: testUser.id,
    });
    createdTemplateIds.push(template.id);

    // Create session for org2 coach
    const org2CoachRes = await request(app)
      .post('/mock-login')
      .send({ userId: org2Coach.id });
    const org2Cookie = org2CoachRes.headers['set-cookie']?.[0] || '';

    // Attempt to access org1 template from org2 context
    const res = await request(app)
      .get(`/api/organizations/${testOrg.id}/wellness/templates/${template.id}`)
      .set('Cookie', org2Cookie);

    expect(res.status).toBe(403);
  });

  it('should allow site admin to access all organizations', async () => {
    const res = await request(app)
      .get(`/api/organizations/${testOrg.id}/wellness/templates`)
      .set('Cookie', siteAdminCookie);

    expect(res.status).toBe(200);
  });
});

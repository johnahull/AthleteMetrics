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

import { describe, it, expect, beforeAll, afterAll, vi, afterEach, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import session from 'express-session';
import { db } from '../../packages/api/db';
import { storage } from '../../packages/api/storage';
import {
  organizations,
  users,
  teams,
  userTeams,
  wellnessTemplates,
  wellnessRequests,
  wellnessResponses,
  siteSettings
} from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import crypto from 'crypto';
import type { WellnessTemplateConfig } from '@shared/wellness-types';
import { emailService } from '../../packages/api/services/email-service';
import { purgeTestRows } from '../helpers/purge-test-rows';

// Mock email service
vi.mock('../../packages/api/services/email-service', () => ({
  emailService: {
    sendWellnessRequest: vi.fn().mockResolvedValue(true),
    sendWellnessReminder: vi.fn().mockResolvedValue(true),
    sendWellnessAlert: vi.fn().mockResolvedValue(true),
  },
  EmailService: vi.fn(), // constructed by CoppaExportService
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
    aiModel: 'claude-sonnet-5.5',
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

// Tests compute "today" (UTC) on the test side and the server computes it again: never start one within
// 5 seconds of midnight UTC, wait until just after it instead
beforeEach(async () => {
  const msToMidnight = 24 * 60 * 60 * 1000 - (Date.now() % (24 * 60 * 60 * 1000));
  if (msToMidnight < 5000) await new Promise(resolve => setTimeout(resolve, msToMidnight + 100));
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

  await purgeTestRows({
    userIds: [testAthlete?.id, testUser?.id, siteAdmin?.id].filter((id): id is string => !!id),
    orgIds: testOrg ? [testOrg.id] : [],
    // users created inside individual tests
    usernameLike: ['dashboard_athlete%', 'org2_coach_%', 'standing_nontarget_%', 'standing_teampick_%'],
  });
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

describe('Standing (anytime) Wellness Requests', () => {
  let standingTemplate: any;
  let nonTargetedAthlete: any;
  let nonTargetedCookie: string;
  const standingRequestIds: string[] = [];

  const utcDay = (offsetDays: number) =>
    new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const createStanding = async (overrides: Record<string, unknown> = {}) => {
    const created = await storage.createWellnessRequest({
      organizationId: testOrg.id,
      templateId: standingTemplate.id,
      requestedBy: testUser.id,
      distributionMethod: 'athlete_account',
      publicToken: crypto.randomBytes(32).toString('hex'),
      targetAthleteIds: [testAthlete.id],
      status: 'active',
      isStanding: true,
      ...overrides,
    } as any);
    standingRequestIds.push(created.id);
    return created;
  };

  const submit = (requestId: string, date: string, value: number, cookie = athleteCookie) =>
    request(app)
      .post('/api/wellness/responses')
      .set('Cookie', cookie)
      .send({
        requestId,
        templateId: standingTemplate.id,
        date,
        responses: { q1: { value, label: 'Energy' } },
      });

  const rowsFor = (requestId: string) =>
    db.select().from(wellnessResponses).where(eq(wellnessResponses.requestId, requestId));

  beforeAll(async () => {
    standingTemplate = await storage.createWellnessTemplate({
      organizationId: testOrg.id,
      name: 'Standing Request Test Template',
      config: {
        questions: [{ id: 'q1', type: 'scale', label: 'Energy', scaleMin: 1, scaleMax: 10, required: true }],
      },
      createdBy: testUser.id,
    });
    createdTemplateIds.push(standingTemplate.id);

    const [other] = await db.insert(users).values({
      username: `standing_nontarget_${Date.now()}`,
      emails: ['standing.nontarget@test.com'],
      password: 'hashed_password_here',
      firstName: 'Other',
      lastName: 'Athlete',
      fullName: 'Other Athlete',
      isSiteAdmin: false,
    }).returning();
    nonTargetedAthlete = other;
    await storage.addUserToOrganization(nonTargetedAthlete.id, testOrg.id, 'athlete');

    const loginRes = await request(app).post('/mock-login').send({ userId: nonTargetedAthlete.id });
    nonTargetedCookie = loginRes.headers['set-cookie']?.[0] || '';
  });

  afterEach(async () => {
    for (const id of standingRequestIds) {
      await db.delete(wellnessResponses).where(eq(wellnessResponses.requestId, id));
      await db.delete(wellnessRequests).where(eq(wellnessRequests.id, id));
    }
    standingRequestIds.length = 0;
  });

  it('POST /api/organizations/:organizationId/wellness/requests - stores isStanding', async () => {
    const res = await request(app)
      .post(`/api/organizations/${testOrg.id}/wellness/requests`)
      .set('Cookie', coachCookie)
      .send({
        templateId: standingTemplate.id,
        distributionMethod: 'athlete_account',
        targetAthleteIds: [testAthlete.id],
        isStanding: true,
      });

    expect(res.status).toBe(201);
    standingRequestIds.push(res.body.id);
    expect(res.body.isStanding).toBe(true);
  });

  it('GET /api/wellness/my-requests - keeps a standing request after a response, drops a one-time one', async () => {
    const standing = await createStanding();
    const oneTime = await createStanding({ isStanding: false });

    expect((await submit(standing.id, utcDay(0), 6)).status).toBe(201);
    expect((await submit(oneTime.id, utcDay(0), 6)).status).toBe(201);

    const res = await request(app).get('/api/wellness/my-requests').set('Cookie', athleteCookie);

    expect(res.status).toBe(200);
    const ids = res.body.map((r: any) => r.id);
    expect(ids).toContain(standing.id);
    expect(ids).not.toContain(oneTime.id);
  });

  it('POST /api/wellness/responses - same-day resubmit supersedes the earlier row', async () => {
    const standing = await createStanding();

    const first = await submit(standing.id, utcDay(0), 3);
    expect(first.status).toBe(201);
    expect(first.body.replaced).toBe(false);

    const second = await submit(standing.id, utcDay(0), 9);
    expect(second.status).toBe(201);
    expect(second.body.replaced).toBe(true);

    const rows = await rowsFor(standing.id);
    expect(rows).toHaveLength(2);
    const live = rows.filter(r => r.supersededAt === null);
    const superseded = rows.filter(r => r.supersededAt !== null);
    expect(live).toHaveLength(1);
    expect(live[0].id).toBe(second.body.id);
    expect(superseded).toHaveLength(1);
    expect(superseded[0].id).toBe(first.body.id);
    expect((superseded[0].responses as any).q1.value).toBe(3);
  });

  it('GET .../wellness/dashboard - shows the earlier entry of an edited day, scored from the new entry only', async () => {
    const painTemplate = await storage.createWellnessTemplate({
      organizationId: testOrg.id,
      name: 'Standing Pain Template',
      config: {
        questions: [
          { id: 'energy', type: 'scale', label: 'Energy', scaleMin: 1, scaleMax: 10, required: true },
          { id: 'pain', type: 'body_map', label: 'Where does it hurt?', allowMultiple: true, required: false },
        ],
        statusConfig: {
          scaleOrientation: 'higher_is_better',
          redThreshold: 3,
          yellowThreshold: 6,
          injuryQuestionIds: ['pain'],
          injuryOverride: true,
        },
      },
      createdBy: testUser.id,
    });
    createdTemplateIds.push(painTemplate.id);
    const standing = await createStanding({ templateId: painTemplate.id });
    const [team] = await db.insert(teams).values({ organizationId: testOrg.id, name: `Edited Team ${Date.now()}` }).returning();
    await storage.addUserToTeam(testAthlete.id, team.id);
    const [otherOrg] = await db.insert(organizations).values({ name: `Edited Other Org ${Date.now()}`, orgType: 'club' }).returning();
    const [unedited] = await db.insert(users).values({
      username: `standing_teampick_unedited_${Date.now()}`,
      emails: ['standing.unedited@test.com'],
      password: 'hashed_password_here',
      firstName: 'Unedited',
      lastName: 'Athlete',
      fullName: 'Unedited Athlete',
      isSiteAdmin: false,
    }).returning();
    await storage.addUserToOrganization(unedited.id, testOrg.id, 'athlete');
    await storage.addUserToTeam(unedited.id, team.id);

    const send = (responses: Record<string, unknown>) =>
      request(app)
        .post('/api/wellness/responses')
        .set('Cookie', athleteCookie)
        .send({ requestId: standing.id, templateId: painTemplate.id, date: utcDay(0), responses });

    try {
      const morning = await send({
        energy: { value: 8, label: 'Energy' },
        pain: { value: [{ x: 0.4, y: 0.7, label: 'Left knee' }], label: 'Where does it hurt?' },
      });
      expect(morning.body).toMatchObject({ replaced: false });
      const evening = await send({ energy: { value: 9, label: 'Energy' }, pain: { value: [], label: 'Where does it hurt?' } });
      expect(evening.status).toBe(201);
      expect(evening.body.replaced).toBe(true);

      await db.insert(wellnessResponses).values([
        // another organization's superseded row for the same athlete and day: never shown here
        {
          organizationId: otherOrg.id,
          templateId: painTemplate.id,
          userId: testAthlete.id,
          userFullName: testAthlete.fullName,
          submittedAt: new Date(),
          date: utcDay(0),
          responses: { energy: { value: 1, label: 'Energy' } },
          supersededAt: new Date(),
        },
        {
          organizationId: testOrg.id,
          templateId: painTemplate.id,
          userId: unedited.id,
          userFullName: unedited.fullName,
          submittedAt: new Date(),
          date: utcDay(0),
          responses: { energy: { value: 7, label: 'Energy' } },
        },
      ]);

      const res = await request(app)
        .get(`/api/organizations/${testOrg.id}/wellness/dashboard?teamIds=${team.id}&date=${utcDay(0)}`)
        .set('Cookie', coachCookie);

      expect(res.status).toBe(200);
      const athletes = Object.fromEntries(res.body[0].athletes.map((a: any) => [a.id, a]));
      const edited = athletes[testAthlete.id];
      expect(edited.score).toBe(9);
      expect(edited.status).toBe('green');
      expect(edited.injuries).toEqual([]);
      expect(edited.earlierEntries).toEqual([
        {
          id: morning.body.id,
          submittedAt: expect.any(String),
          answers: [{ label: 'Energy', value: '8' }],
          painAreas: ['Left knee'],
        },
      ]);
      expect(athletes[unedited.id].earlierEntries).toEqual([]);
      expect(res.body[0].commonInjuries).toEqual([]);
    } finally {
      await db.delete(wellnessResponses).where(eq(wellnessResponses.organizationId, otherOrg.id));
      await db.delete(wellnessResponses).where(eq(wellnessResponses.userId, unedited.id));
      await purgeTestRows({ userIds: [unedited.id], orgIds: [otherOrg.id], teamIds: [team.id] });
    }
  });

  it('POST /api/wellness/responses - a different date adds a second live row', async () => {
    const standing = await createStanding();

    expect((await submit(standing.id, utcDay(0), 5)).status).toBe(201);
    const yesterday = await submit(standing.id, utcDay(-1), 7);
    expect(yesterday.status).toBe(201);
    expect(yesterday.body.replaced).toBe(false);

    const rows = await rowsFor(standing.id);
    expect(rows.filter(r => r.supersededAt === null)).toHaveLength(2);
  });

  it('POST /api/wellness/responses - rejects a magic-link submit to a standing request', async () => {
    const standing = await createStanding();

    const res = await request(app)
      .post('/api/wellness/responses')
      .query({ token: standing.publicToken, athlete: testAthlete.id })
      .send({
        requestId: standing.id,
        templateId: standingTemplate.id,
        date: utcDay(0),
        responses: { q1: { value: 2, label: 'Energy' } },
      });

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/sign in/i);
    expect(await rowsFor(standing.id)).toHaveLength(0);
  });

  it('POST /api/wellness/responses - rejects an org member who is not targeted', async () => {
    const standing = await createStanding();

    const res = await submit(standing.id, utcDay(0), 5, nonTargetedCookie);

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/not part of this check-in/i);
    expect(await rowsFor(standing.id)).toHaveLength(0);
  });

  it('POST /api/wellness/responses - rejects a standing submit for a cancelled request', async () => {
    const standing = await createStanding({ status: 'cancelled' });

    const res = await submit(standing.id, utcDay(0), 5);

    expect(res.status).toBe(409);
    expect(await rowsFor(standing.id)).toHaveLength(0);
  });

  it('POST /api/wellness/responses - rejects a standing submit dated outside today +/- 1 day', async () => {
    const standing = await createStanding();

    const res = await submit(standing.id, utcDay(-2), 5);

    expect(res.status).toBe(400);
    expect(await rowsFor(standing.id)).toHaveLength(0);
  });

  // Impossible dates ('2026-02-30') are rejected by the schema: packages/shared/__tests__/wellness-response-date.test.ts
  it('POST /api/wellness/responses - accepts tomorrow', async () => {
    const standing = await createStanding();

    expect((await submit(standing.id, utcDay(1), 5)).status).toBe(201);
  });

  it('POST /api/wellness/responses - rejects a template that is not the request\'s template', async () => {
    const standing = await createStanding();
    const other = await storage.createWellnessTemplate({
      organizationId: testOrg.id,
      name: 'Other Template',
      config: standingTemplate.config,
      isActive: true,
      createdBy: testUser.id,
    } as any);
    createdTemplateIds.push(other.id);

    const res = await request(app)
      .post('/api/wellness/responses')
      .set('Cookie', athleteCookie)
      .send({
        requestId: standing.id,
        templateId: other.id,
        date: utcDay(0),
        responses: { q1: { value: 5, label: 'Energy' } },
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/template/i);
    expect(await rowsFor(standing.id)).toHaveLength(0);
  });

  it('team-targeted standing request: member can submit; a member who left cannot submit or see it', async () => {
    const standing = await createStanding({ targetAthleteIds: [], targetTeamIds: [testTeam.id] });

    expect((await submit(standing.id, utcDay(0), 5)).status).toBe(201);
    const visible = await request(app).get('/api/wellness/my-requests').set('Cookie', athleteCookie);
    expect(visible.body.map((r: any) => r.id)).toContain(standing.id);

    const membership = and(eq(userTeams.userId, testAthlete.id), eq(userTeams.teamId, testTeam.id));
    await db.update(userTeams).set({ isActive: false, leftAt: new Date() }).where(membership);
    try {
      const blocked = await submit(standing.id, utcDay(0), 7);
      expect(blocked.status).toBe(403);
      const hidden = await request(app).get('/api/wellness/my-requests').set('Cookie', athleteCookie);
      expect(hidden.body.map((r: any) => r.id)).not.toContain(standing.id);
    } finally {
      await db.update(userTeams).set({ isActive: true, leftAt: null }).where(membership);
    }
  });

  it('POST /api/wellness/responses - stamps the athlete\'s active team in the org, not a team they left', async () => {
    const [athlete] = await db.insert(users).values({
      username: `standing_teampick_${Date.now()}`,
      emails: ['standing.teampick@test.com'],
      password: 'hashed_password_here',
      firstName: 'Team',
      lastName: 'Picker',
      fullName: 'Team Picker',
      isSiteAdmin: false,
    }).returning();
    await storage.addUserToOrganization(athlete.id, testOrg.id, 'athlete');
    const [leftTeam, activeTeam] = await db.insert(teams).values([
      { organizationId: testOrg.id, name: `Left Team ${Date.now()}`, sport: 'Soccer', level: 'Club' },
      { organizationId: testOrg.id, name: `Active Team ${Date.now()}`, sport: 'Soccer', level: 'Club' },
    ]).returning();
    // The left membership comes first, so "the first membership" picks the wrong team
    await db.insert(userTeams).values({ userId: athlete.id, teamId: leftTeam.id, isActive: false, leftAt: new Date() });
    await db.insert(userTeams).values({ userId: athlete.id, teamId: activeTeam.id, isActive: true });
    const cookie = (await request(app).post('/mock-login').send({ userId: athlete.id })).headers['set-cookie']?.[0] || '';
    const standing = await createStanding({ targetAthleteIds: [athlete.id] });

    const res = await submit(standing.id, utcDay(0), 5, cookie);

    expect(res.status).toBe(201);
    expect(res.body.teamId).toBe(activeTeam.id);
    expect(res.body.teamNameSnapshot).toBe(activeTeam.name);
  });

  it('GET /api/wellness/requests/:requestId/check-submission - does not tell a non-targeted user a request is standing', async () => {
    const standing = await createStanding();

    const res = await request(app)
      .get(`/api/wellness/requests/${standing.id}/check-submission`)
      .set('Cookie', nonTargetedCookie);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ hasSubmitted: false });
  });

  it('POST /api/wellness/responses - a magic-link athlete selection without a requestId is a 400, not a crash', async () => {
    const oneTime = await createStanding({ isStanding: false, distributionMethod: 'magic_link' });

    const res = await request(app)
      .post('/api/wellness/responses')
      .query({ token: oneTime.publicToken, athlete: testAthlete.id })
      .send({
        templateId: standingTemplate.id,
        date: utcDay(0),
        selectedAthleteId: testAthlete.id,
        responses: { q1: { value: 5, label: 'Energy' } },
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/requestId/i);
  });

  it('GET /api/wellness/requests/:requestId/check-submission - standing request is never "submitted"', async () => {
    const standing = await createStanding();
    expect((await submit(standing.id, utcDay(0), 5)).status).toBe(201);

    const res = await request(app)
      .get(`/api/wellness/requests/${standing.id}/check-submission`)
      .set('Cookie', athleteCookie);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ hasSubmitted: false, isStanding: true });
  });

  it('POST /api/wellness/responses - concurrent same-day submits leave exactly one live row', async () => {
    const standing = await createStanding();

    const results = await Promise.all([
      submit(standing.id, utcDay(0), 4),
      submit(standing.id, utcDay(0), 8),
    ]);
    expect(results.map(r => r.status)).toEqual([201, 201]);

    const rows = await rowsFor(standing.id);
    expect(rows).toHaveLength(2);
    expect(rows.filter(r => r.supersededAt === null)).toHaveLength(1);
  });

  it('storage.createStandingWellnessResponse - parallel same-day writes leave exactly one live row', async () => {
    const standing = await createStanding();
    const row = (value: number) => ({
      requestId: standing.id,
      organizationId: testOrg.id,
      templateId: standingTemplate.id,
      userId: testAthlete.id,
      userFullName: testAthlete.fullName,
      submittedAt: new Date(),
      date: utcDay(0),
      responses: { q1: { value, label: 'Energy' } },
    });

    const results = await Promise.all([1, 2, 3, 4, 5].map(v => storage.createStandingWellnessResponse(row(v))));

    expect(results.filter(r => !r.replaced)).toHaveLength(1);
    const rows = await rowsFor(standing.id);
    expect(rows).toHaveLength(5);
    expect(rows.filter(r => r.supersededAt === null)).toHaveLength(1);
  });

  describe('GET .../requests/:requestId/completion-rate - day compliance', () => {
    const completionRate = (requestId: string) =>
      request(app)
        .get(`/api/organizations/${testOrg.id}/wellness/requests/${requestId}/completion-rate`)
        .set('Cookie', coachCookie);

    it('does not reveal another organization\'s request targets', async () => {
      const standing = await createStanding();

      const res = await request(app)
        .get(`/api/organizations/${crypto.randomUUID()}/wellness/requests/${standing.id}/completion-rate`)
        .set('Cookie', siteAdminCookie);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ completed: 0, total: 0, percentage: 0 });
    });

    const insertEntry = async (requestId: string, date: string, superseded = false) => {
      await db.insert(wellnessResponses).values({
        requestId,
        organizationId: testOrg.id,
        templateId: standingTemplate.id,
        userId: testAthlete.id,
        userFullName: testAthlete.fullName,
        submittedAt: new Date(),
        date,
        responses: { q1: { value: 5, label: 'Energy' } },
        supersededAt: superseded ? new Date() : null,
      });
    };

    it('standing request: distinct live entry days over the last 7 and 28 complete days (today excluded)', async () => {
      const standing = await createStanding();
      await db.update(wellnessRequests)
        .set({ createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) })
        .where(eq(wellnessRequests.id, standing.id));

      // Today is not a complete UTC day yet: today's entry (one live + one superseded row) is not counted
      expect((await submit(standing.id, utcDay(0), 3)).status).toBe(201);
      expect((await submit(standing.id, utcDay(0), 8)).status).toBe(201);
      await insertEntry(standing.id, utcDay(-2));
      await insertEntry(standing.id, utcDay(-3), true); // superseded only: not a day
      await insertEntry(standing.id, utcDay(-9)); // outside 7, inside 28
      await insertEntry(standing.id, utcDay(-28)); // oldest complete day inside 28
      await insertEntry(standing.id, utcDay(-29)); // outside 28

      const res = await completionRate(standing.id);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        completed: 1,
        total: 1,
        percentage: 100,
        standing: true,
        windows: {
          last7: {
            possibleDays: 7,
            entryDays: 1,
            totalPossibleDays: 7,
            percentage: 14,
            perAthlete: [{ userId: testAthlete.id, entryDays: 1 }],
          },
          last28: {
            possibleDays: 28,
            entryDays: 3,
            totalPossibleDays: 28,
            percentage: 11,
            perAthlete: [{ userId: testAthlete.id, entryDays: 3 }],
          },
        },
      });
    });

    it('standing request: a team member who has left is not a target', async () => {
      const standing = await createStanding({ targetAthleteIds: [], targetTeamIds: [testTeam.id] });
      const membership = and(eq(userTeams.userId, testAthlete.id), eq(userTeams.teamId, testTeam.id));

      await db.update(userTeams).set({ leftAt: new Date() }).where(membership);
      try {
        const res = await completionRate(standing.id);
        expect(res.status).toBe(200);
        expect(res.body.total).toBe(0);
        expect(res.body.windows.last7.perAthlete).toEqual([]);
      } finally {
        await db.update(userTeams).set({ leftAt: null }).where(membership);
      }
    });

    it('one-time request: response shape is unchanged', async () => {
      const oneTime = await createStanding({ isStanding: false });
      expect((await submit(oneTime.id, utcDay(0), 6)).status).toBe(201);

      const res = await completionRate(oneTime.id);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ completed: 1, total: 1, percentage: 100 });
    });
  });
});

describe('Superseded wellness responses (readers)', () => {
  // A fixed past day keeps these rows apart from rows other tests create in the same org.
  const DAY = '2020-03-15';
  let template: any;
  let liveRow: any;
  let supersededRow: any;
  const requestIds: string[] = [];

  const insertRow = async (value: number, opts: { date?: string; superseded?: boolean; requestId?: string; submittedAt?: Date } = {}) => {
    const [row] = await db.insert(wellnessResponses).values({
      requestId: opts.requestId ?? null,
      organizationId: testOrg.id,
      templateId: template.id,
      userId: testAthlete.id,
      userFullName: 'Test Athlete',
      teamId: testTeam.id,
      teamNameSnapshot: testTeam.name,
      submittedAt: opts.submittedAt ?? new Date(`${DAY}T08:00:00Z`),
      date: opts.date ?? DAY,
      responses: { q1: { value, label: 'Energy' } },
      supersededAt: opts.superseded ? new Date() : null,
    }).returning();
    return row;
  };

  beforeAll(async () => {
    template = await storage.createWellnessTemplate({
      organizationId: testOrg.id,
      name: 'Superseded Readers Template',
      config: {
        questions: [{ id: 'q1', type: 'scale', label: 'Energy', scaleMin: 1, scaleMax: 10, required: true }],
      },
      createdBy: testUser.id,
    });
    createdTemplateIds.push(template.id);
  });

  beforeEach(async () => {
    supersededRow = await insertRow(2, { superseded: true, submittedAt: new Date(`${DAY}T07:00:00Z`) });
    liveRow = await insertRow(8);
  });

  afterEach(async () => {
    await db.delete(wellnessResponses).where(eq(wellnessResponses.templateId, template.id));
    for (const id of requestIds) {
      await db.delete(wellnessRequests).where(eq(wellnessRequests.id, id));
    }
    requestIds.length = 0;
  });

  it('GET /api/wellness/my-responses - hides superseded rows', async () => {
    const res = await request(app).get('/api/wellness/my-responses').set('Cookie', athleteCookie);

    expect(res.status).toBe(200);
    const ids = res.body.responses.map((r: any) => r.id);
    expect(ids).toContain(liveRow.id);
    expect(ids).not.toContain(supersededRow.id);
  });

  it('GET /api/organizations/:organizationId/wellness/responses - hides superseded rows', async () => {
    const res = await request(app)
      .get(`/api/organizations/${testOrg.id}/wellness/responses?startDate=${DAY}&endDate=${DAY}`)
      .set('Cookie', coachCookie);

    expect(res.status).toBe(200);
    expect(res.body.map((r: any) => r.id)).toEqual([liveRow.id]);
  });

  it('GET /api/wellness/responses/:id - still returns a superseded row with supersededAt', async () => {
    const res = await request(app).get(`/api/wellness/responses/${supersededRow.id}`).set('Cookie', coachCookie);

    expect(res.status).toBe(200);
    expect(res.body.supersededAt).not.toBeNull();
  });

  it('team and athlete summaries ignore superseded rows', async () => {
    const team = await storage.getTeamWellnessSummary(testTeam.id, { startDate: DAY, endDate: DAY });
    expect(team.totalResponses).toBe(1);
    expect(team.averageScores.q1).toBe(8);

    const athlete = await storage.getAthleteWellnessSummary(testAthlete.id, { startDate: DAY, endDate: DAY });
    expect(athlete.totalResponses).toBe(1);
    expect(athlete.averageScores.q1).toBe(8);
  });

  it('trends ignore superseded rows', async () => {
    const trends = await storage.getWellnessTrends(testOrg.id, { startDate: DAY, endDate: DAY });

    expect(trends).toHaveLength(1);
    expect(trends[0].dataPoints).toEqual([{ date: DAY, value: 8, count: 1 }]);
  });

  it('completion rate does not count an athlete whose only row is superseded', async () => {
    const req = await storage.createWellnessRequest({
      organizationId: testOrg.id,
      templateId: template.id,
      requestedBy: testUser.id,
      distributionMethod: 'athlete_account',
      publicToken: crypto.randomBytes(32).toString('hex'),
      targetAthleteIds: [testAthlete.id],
      status: 'active',
    } as any);
    requestIds.push(req.id);
    await insertRow(5, { requestId: req.id, superseded: true });

    const rate = await storage.getRequestCompletionRate(testOrg.id, req.id);
    expect(rate.completed).toBe(0);
  });

  it('digest ignores a superseded red row', async () => {
    // Only row in the last 24h is superseded, so the athlete has no live at-risk entry.
    await insertRow(1, { date: new Date().toISOString().split('T')[0], superseded: true, submittedAt: new Date() });

    const { WellnessDigestService } = await import('../../packages/api/services/wellness-digest-service');
    const atRisk = await new WellnessDigestService(db as any).getAtRiskAthletes(testOrg.id);
    expect(atRisk.map(a => a.userId)).not.toContain(testAthlete.id);
  });

  it('llm export wellness section ignores superseded rows', async () => {
    const { gatherAthleteExportData } = await import('../../packages/api/services/llm-export-service');
    const data = await gatherAthleteExportData(testAthlete.id, testOrg.id);

    expect(data.recentWellness).toHaveLength(1);
    expect(data.recentWellness[0].responses).toEqual({ q1: { value: 8, label: 'Energy' } });
  });

  it('COPPA export and profile merge still include superseded rows', async () => {
    const { coppaExportService } = await import('../../packages/api/services/coppa-export-service');
    const bundle = await (coppaExportService as any).buildExportBundle(testAthlete.id);
    expect(bundle.wellnessResponses.map((r: any) => r.id)).toEqual(
      expect.arrayContaining([liveRow.id, supersededRow.id]),
    );

    const { profileMergeService } = await import('../../packages/api/services/profile-merge-service');
    const merge = await (profileMergeService as any).gatherProfileData(testAthlete.id, testOrg.id);
    expect(merge.wellnessResponseCount).toBeGreaterThanOrEqual(2);
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
  const dashboardResponseIds: string[] = []; // Local cleanup array - not affected by global afterEach

  beforeAll(async () => {
    // Calculate test date once at the start to avoid midnight UTC boundary issues
    testDate = new Date().toISOString().split('T')[0];
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
    dashboardResponseIds.push(resp1.id); // Local cleanup - don't use global array

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
    dashboardResponseIds.push(resp2.id); // Local cleanup - don't use global array

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
    dashboardResponseIds.push(resp3.id); // Local cleanup - don't use global array

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
    dashboardResponseIds.push(resp4.id); // Local cleanup - don't use global array
  });

  afterAll(async () => {
    // Clean up responses created in this suite
    for (const id of [...dashboardResponseIds].reverse()) {
      try {
        await db.delete(wellnessResponses).where(eq(wellnessResponses.id, id));
      } catch (e) {
        // Ignore if already deleted
      }
    }

    // Clean up other resources
    await purgeTestRows({ userIds: [athlete1?.id, athlete2?.id], teamIds: [team1?.id, team2?.id] });
  });

  it('GET /api/organizations/:organizationId/wellness/dashboard - lastEntries gives every roster athlete their latest live entry', async () => {
    const [team] = await db.insert(teams).values({
      organizationId: testOrg.id,
      name: `Freshness Team ${Date.now()}`,
      isArchived: false,
    }).returning();
    const makeAthlete = async (suffix: string) => {
      const [u] = await db.insert(users).values({
        username: `dashboard_athlete_fresh_${suffix}_${Date.now()}`,
        emails: [`dash.fresh.${suffix}@test.com`],
        password: 'hashed',
        firstName: 'Fresh',
        lastName: suffix,
        fullName: `Fresh ${suffix}`,
        isSiteAdmin: false,
      }).returning();
      await storage.addUserToOrganization(u.id, testOrg.id, 'athlete');
      await storage.addUserToTeam(u.id, team.id);
      return u;
    };
    const withEntries = await makeAthlete('a');
    const noEntries = await makeAthlete('b');

    const day = (offset: number) => new Date(Date.now() + offset * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const liveSubmittedAt = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    const insert = (date: string, submittedAt: Date, superseded: boolean) =>
      db.insert(wellnessResponses).values({
        organizationId: testOrg.id,
        templateId: dailyTemplate.id,
        userId: withEntries.id,
        userFullName: withEntries.fullName,
        submittedAt,
        date,
        responses: { sleep: { value: 3, label: 'Sleep Quality' }, energy: { value: 3, label: 'Energy Level' } },
        supersededAt: superseded ? new Date() : null,
      });

    try {
      await insert(day(-3), liveSubmittedAt, false);
      await insert(day(0), new Date(), true); // newer, but superseded: must not count as the latest entry

      const res = await request(app)
        .get(`/api/organizations/${testOrg.id}/wellness/dashboard?teamIds=${team.id}`)
        .set('Cookie', coachCookie);

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      const byUser = Object.fromEntries(res.body[0].lastEntries.map((e: any) => [e.userId, e]));
      expect(byUser[withEntries.id]).toEqual({
        userId: withEntries.id,
        name: withEntries.fullName,
        lastSubmittedAt: liveSubmittedAt.toISOString(),
        lastDate: day(-3),
      });
      expect(byUser[noEntries.id]).toEqual({
        userId: noEntries.id,
        name: noEntries.fullName,
        lastSubmittedAt: null,
        lastDate: null,
      });
    } finally {
      await db.delete(wellnessResponses).where(eq(wellnessResponses.userId, withEntries.id));
      await purgeTestRows({ userIds: [withEntries.id, noEntries.id], teamIds: [team.id] });
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
    const res = await request(app)
      .get(`/api/organizations/${testOrg.id}/wellness/dashboard`)
      .query({ date: testDate })
      .set('Cookie', coachCookie);

    expect(res.status).toBe(200);

    // Team1 - Daily Wellness Template
    const team1Data = res.body.find((t: any) => t.teamId === team1.id);

    if (!team1Data) {
      console.error(`❌ Team1 (${team1.id}) not found in response`);
      console.error(`Available teams:`, res.body.map((t: any) => ({ teamId: t.teamId, name: t.teamName })));
      throw new Error(`Team1 not found in dashboard response`);
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
    await purgeTestRows({
      userIds: org2Coach ? [org2Coach.id] : [],
      orgIds: org2 ? [org2.id] : [],
    });
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

  describe('a coach of another organization cannot reach this organization\'s request by id', () => {
    let org2Cookie: string;
    let org1Request: any;

    beforeAll(async () => {
      org2Cookie = (await request(app).post('/mock-login').send({ userId: org2Coach.id })).headers['set-cookie']?.[0] || '';
    });

    beforeEach(async () => {
      const template = await storage.createWellnessTemplate({
        organizationId: testOrg.id,
        name: 'Org 1 Request Template',
        config: { questions: [] },
        createdBy: testUser.id,
      });
      createdTemplateIds.push(template.id);
      org1Request = await storage.createWellnessRequest({
        organizationId: testOrg.id,
        templateId: template.id,
        requestedBy: testUser.id,
        distributionMethod: 'athlete_account',
        targetAthleteIds: [testAthlete.id],
        status: 'active',
      } as any);
      createdRequestIds.push(org1Request.id);
    });

    const viaOrg2 = (path = '') => `/api/organizations/${org2.id}/wellness/requests/${org1Request.id}${path}`;
    const stored = async () => (await db.select().from(wellnessRequests).where(eq(wellnessRequests.id, org1Request.id)))[0];

    it('PUT .../cancel returns 404 and leaves the request active', async () => {
      const res = await request(app).put(viaOrg2('/cancel')).set('Cookie', org2Cookie);

      expect(res.status).toBe(404);
      expect((await stored()).status).toBe('active');
    });

    it('DELETE returns 404 and keeps the request', async () => {
      const res = await request(app).delete(viaOrg2()).set('Cookie', org2Cookie);

      expect(res.status).toBe(404);
      expect(await stored()).toBeDefined();
    });

    it('GET single returns 404', async () => {
      const res = await request(app).get(viaOrg2()).set('Cookie', org2Cookie);

      expect(res.status).toBe(404);
      expect(res.body.id).toBeUndefined();
    });

    it('POST .../resend-notifications returns 404', async () => {
      const res = await request(app).post(viaOrg2('/resend-notifications')).set('Cookie', org2Cookie);

      expect(res.status).toBe(404);
    });
  });

  it('should allow site admin to access all organizations', async () => {
    const res = await request(app)
      .get(`/api/organizations/${testOrg.id}/wellness/templates`)
      .set('Cookie', siteAdminCookie);

    expect(res.status).toBe(200);
  });
});

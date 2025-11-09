/**
 * Integration Tests for Report Routes
 *
 * These tests verify the complete request/response cycle for report CRUD operations.
 * Unlike unit tests, these use real HTTP requests and a test database.
 */

// Set environment variables BEFORE any imports
process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'test-secret-key-for-integration-tests-only-at-least-32-characters-long';
process.env.ADMIN_USER = process.env.ADMIN_USER || 'admin';
process.env.ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@test.com';
process.env.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'TestPassword123!';
process.env.BYPASS_GENERAL_RATE_LIMIT = 'true'; // Bypass rate limits for these tests

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import express, { type Express } from 'express';
import { db } from '../../packages/api/db';
import { organizations, users, userOrganizations, reports, organizationMetrics } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import bcrypt from 'bcrypt';
import { BCRYPT_SALT_ROUNDS } from '@shared/constants';

// Mock vite module before importing registerRoutes
vi.mock('../../packages/api/vite.js', () => ({
  setupVite: vi.fn().mockResolvedValue(undefined),
  serveStatic: vi.fn()
}));

import { registerRoutes } from '../../packages/api/routes';

// Helper function for password hashing
async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
}

// Test data
let app: Express;
let testSiteAdmin: any;
let testOrg: any;
let testCoach: any;
let coachAuthCookie: string;
let adminAuthCookie: string;
let testReport: any;

beforeAll(async () => {
  // Create Express app and register routes
  app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  await registerRoutes(app);

  // Get admin user created by initializeDefaultUser()
  const adminUser = await db.select().from(users).where(eq(users.username, process.env.ADMIN_USER || 'admin')).limit(1);
  if (adminUser.length > 0) {
    testSiteAdmin = adminUser[0];
  } else {
    throw new Error('Admin user not found after initialization');
  }

  // Authenticate admin and get session cookie
  const loginResponse = await request(app)
    .post('/api/auth/login')
    .send({
      username: process.env.ADMIN_USER || 'admin',
      password: process.env.ADMIN_PASSWORD || 'TestPassword123!',
    });

  if (loginResponse.status !== 200 || !loginResponse.headers['set-cookie']) {
    throw new Error(`Admin login failed (status: ${loginResponse.status})`);
  }

  adminAuthCookie = loginResponse.headers['set-cookie'][0];
});

afterAll(async () => {
  // Cleanup test users (but not admin)
  if (testCoach) {
    await db.delete(users).where(eq(users.id, testCoach.id));
  }
});

beforeEach(async () => {
  // Create fresh test organization
  [testOrg] = await db.insert(organizations).values({
    name: `Test Org ${Date.now()}`,
    description: 'Test organization for report integration tests',
    isActive: true,
  }).returning();

  // Create test coach user
  const hashedPassword = await hashPassword('TestCoach123!');
  [testCoach] = await db.insert(users).values({
    username: `testcoach_${Date.now()}`,
    email: `testcoach_${Date.now()}@test.com`,
    passwordHash: hashedPassword,
    role: 'coach',
    firstName: 'Test',
    lastName: 'Coach',
  }).returning();

  // Associate coach with organization
  await db.insert(userOrganizations).values({
    userId: testCoach.id,
    organizationId: testOrg.id,
    role: 'coach',
  });

  // Login as coach and get session cookie
  const coachLogin = await request(app)
    .post('/api/auth/login')
    .send({
      username: testCoach.username,
      password: 'TestCoach123!',
    });

  coachAuthCookie = coachLogin.headers['set-cookie'][0];
});

afterEach(async () => {
  // Cleanup test data in reverse dependency order
  if (testReport) {
    await db.delete(reports).where(eq(reports.id, testReport.id));
    testReport = null;
  }
  if (testCoach && testOrg) {
    await db.delete(userOrganizations).where(
      and(
        eq(userOrganizations.userId, testCoach.id),
        eq(userOrganizations.organizationId, testOrg.id)
      )
    );
  }
  if (testOrg) {
    await db.delete(organizations).where(eq(organizations.id, testOrg.id));
  }
});

describe('POST /api/reports', () => {
  it('should create a coach report for authenticated user', async () => {
    const response = await request(app)
      .post('/api/reports')
      .set('Cookie', coachAuthCookie)
      .send({
        name: 'Spring 2025 Performance Report',
        description: 'Quarterly performance analysis',
        reportType: 'coach',
        organizationId: testOrg.id,
        config: {
          timeframe: { type: 'preset', preset: 'all_time' },
          metrics: ['FLY10_TIME'],
        },
      });

    expect(response.status).toBe(201);
    expect(response.body).toHaveProperty('id');
    expect(response.body.name).toBe('Spring 2025 Performance Report');
    expect(response.body.reportType).toBe('coach');
    expect(response.body.organizationId).toBe(testOrg.id);
    expect(response.body.createdBy).toBe(testCoach.id);

    // Verify database state
    testReport = response.body;
    const dbReports = await db.select().from(reports).where(eq(reports.id, response.body.id));
    expect(dbReports.length).toBe(1);
    expect(dbReports[0].name).toBe('Spring 2025 Performance Report');
  });

  it('should require authentication', async () => {
    const response = await request(app)
      .post('/api/reports')
      .send({
        name: 'Unauthorized Report',
        reportType: 'coach',
        organizationId: testOrg.id,
        config: { timeframe: { type: 'preset', preset: 'all_time' }, metrics: ['FLY10_TIME'] },
      });

    expect(response.status).toBe(401);
  });

  it('should validate required fields', async () => {
    const response = await request(app)
      .post('/api/reports')
      .set('Cookie', coachAuthCookie)
      .send({
        // Missing name
        reportType: 'coach',
        organizationId: testOrg.id,
      });

    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty('message', 'Validation error');
  });

  it('should validate organization access', async () => {
    // Create another organization that coach doesn't belong to
    const [otherOrg] = await db.insert(organizations).values({
      name: 'Other Organization',
      isActive: true,
    }).returning();

    const response = await request(app)
      .post('/api/reports')
      .set('Cookie', coachAuthCookie)
      .send({
        name: 'Unauthorized Org Report',
        reportType: 'coach',
        organizationId: otherOrg.id,
        config: { timeframe: { type: 'preset', preset: 'all_time' }, metrics: ['FLY10_TIME'] },
      });

    expect(response.status).toBe(403);
    expect(response.body).toHaveProperty('message', 'Access denied to this organization');

    // Cleanup
    await db.delete(organizations).where(eq(organizations.id, otherOrg.id));
  });
});

describe('GET /api/reports', () => {
  beforeEach(async () => {
    // Create test report
    [testReport] = await db.insert(reports).values({
      name: 'Existing Report',
      organizationId: testOrg.id,
      reportType: 'coach',
      config: { timeframe: { type: 'preset', preset: 'all_time' }, metrics: ['FLY10_TIME'] },
      createdBy: testCoach.id,
    }).returning();
  });

  it('should return reports for user\'s organization', async () => {
    const response = await request(app)
      .get('/api/reports')
      .set('Cookie', coachAuthCookie);

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
    expect(response.body.length).toBeGreaterThanOrEqual(1);

    const foundReport = response.body.find((r: any) => r.id === testReport.id);
    expect(foundReport).toBeDefined();
    expect(foundReport.name).toBe('Existing Report');
  });

  it('should require authentication', async () => {
    const response = await request(app)
      .get('/api/reports');

    expect(response.status).toBe(401);
  });

  it('should not return reports from organizations user doesn\'t belong to', async () => {
    // Create another org and report
    const [otherOrg] = await db.insert(organizations).values({
      name: 'Other Organization',
      isActive: true,
    }).returning();

    const [otherReport] = await db.insert(reports).values({
      name: 'Other Org Report',
      organizationId: otherOrg.id,
      reportType: 'coach',
      config: { timeframe: { type: 'preset', preset: 'all_time' }, metrics: [] },
      createdBy: testSiteAdmin.id,
    }).returning();

    const response = await request(app)
      .get('/api/reports')
      .set('Cookie', coachAuthCookie);

    expect(response.status).toBe(200);

    // Should NOT include report from other organization
    const foundReport = response.body.find((r: any) => r.id === otherReport.id);
    expect(foundReport).toBeUndefined();

    // Cleanup
    await db.delete(reports).where(eq(reports.id, otherReport.id));
    await db.delete(organizations).where(eq(organizations.id, otherOrg.id));
  });
});

describe('GET /api/reports/:id', () => {
  beforeEach(async () => {
    [testReport] = await db.insert(reports).values({
      name: 'Test Report for Details',
      organizationId: testOrg.id,
      reportType: 'coach',
      config: {
        timeframe: { type: 'preset', preset: 'all_time' },
        metrics: ['FLY10_TIME'],
      },
      createdBy: testCoach.id,
    }).returning();
  });

  it('should return report details by ID', async () => {
    const response = await request(app)
      .get(`/api/reports/${testReport.id}`)
      .set('Cookie', coachAuthCookie);

    expect(response.status).toBe(200);
    expect(response.body.id).toBe(testReport.id);
    expect(response.body.name).toBe('Test Report for Details');
    expect(response.body).toHaveProperty('config');
    expect(response.body.config).toHaveProperty('metrics');
  });

  it('should return 404 for non-existent report', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000000';
    const response = await request(app)
      .get(`/api/reports/${fakeId}`)
      .set('Cookie', coachAuthCookie);

    expect(response.status).toBe(404);
  });

  it('should require authentication', async () => {
    const response = await request(app)
      .get(`/api/reports/${testReport.id}`);

    expect(response.status).toBe(401);
  });
});

describe('PUT /api/reports/:id', () => {
  beforeEach(async () => {
    [testReport] = await db.insert(reports).values({
      name: 'Original Report Name',
      description: 'Original description',
      organizationId: testOrg.id,
      reportType: 'coach',
      config: { timeframe: { type: 'preset', preset: 'all_time' }, metrics: ['FLY10_TIME'] },
      createdBy: testCoach.id,
    }).returning();
  });

  it('should update report name and description', async () => {
    const response = await request(app)
      .put(`/api/reports/${testReport.id}`)
      .set('Cookie', coachAuthCookie)
      .send({
        name: 'Updated Report Name',
        description: 'Updated description',
      });

    expect(response.status).toBe(200);
    expect(response.body.name).toBe('Updated Report Name');
    expect(response.body.description).toBe('Updated description');

    // Verify database was updated
    const [updated] = await db.select().from(reports).where(eq(reports.id, testReport.id));
    expect(updated.name).toBe('Updated Report Name');
    expect(updated.description).toBe('Updated description');
  });

  it('should require authentication', async () => {
    const response = await request(app)
      .put(`/api/reports/${testReport.id}`)
      .send({ name: 'Unauthorized Update' });

    expect(response.status).toBe(401);
  });

  it('should return 404 for non-existent report', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000000';
    const response = await request(app)
      .put(`/api/reports/${fakeId}`)
      .set('Cookie', coachAuthCookie)
      .send({ name: 'Update Non-existent' });

    expect(response.status).toBe(404);
  });
});

describe('DELETE /api/reports/:id', () => {
  beforeEach(async () => {
    [testReport] = await db.insert(reports).values({
      name: 'Report to Delete',
      organizationId: testOrg.id,
      reportType: 'coach',
      config: { timeframe: { type: 'preset', preset: 'all_time' }, metrics: ['FLY10_TIME'] },
      createdBy: testCoach.id,
    }).returning();
  });

  it('should delete report successfully', async () => {
    const response = await request(app)
      .delete(`/api/reports/${testReport.id}`)
      .set('Cookie', coachAuthCookie);

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('message');

    // Verify report is deleted from database
    const deletedReport = await db.select().from(reports).where(eq(reports.id, testReport.id));
    expect(deletedReport.length).toBe(0);

    testReport = null; // Mark as deleted for cleanup
  });

  it('should require authentication', async () => {
    const response = await request(app)
      .delete(`/api/reports/${testReport.id}`);

    expect(response.status).toBe(401);
  });

  it('should return 404 for non-existent report', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000000';
    const response = await request(app)
      .delete(`/api/reports/${fakeId}`)
      .set('Cookie', coachAuthCookie);

    expect(response.status).toBe(404);
  });
});

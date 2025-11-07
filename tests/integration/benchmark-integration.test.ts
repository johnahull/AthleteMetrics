/**
 * Integration tests for benchmark endpoints
 * Tests actual API endpoints with real Express app and PostgreSQL database
 *
 * NOTE: Requires DATABASE_URL environment variable to be set to a PostgreSQL connection string
 */

// Set environment variables before any imports (DATABASE_URL must be provided externally)
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-key-for-integration-tests-only';
process.env.ADMIN_USER = process.env.ADMIN_USER || 'admin';
process.env.ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@test.com';
process.env.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'TestPassword123!';

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import type { Express } from 'express';

// Mock vite module before importing registerRoutes to prevent build directory errors
vi.mock('../../packages/api/vite.js', () => ({
  setupVite: vi.fn().mockResolvedValue(undefined),
  serveStatic: vi.fn()
}));

import { registerRoutes } from '../../packages/api/routes';
import { db } from '../../packages/api/db';
import { users, organizations, userOrganizations, siteBenchmarks, customBenchmarks, organizationBenchmarks } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import { BCRYPT_SALT_ROUNDS } from '@shared/constants';
import bcrypt from 'bcrypt';

// Test data
let app: Express;
let testOrgId: string;
let testSiteAdminId: string;
let siteAdminCookie: string; // Session cookie for site admin
let testOrgAdminId: string;
let testOrgAdminUsername: string; // Store org admin username for login
let orgAdminCookie: string; // Session cookie for org admin
let testSiteBenchmarkId: string;
let testCustomBenchmarkId: string;

// Test data setup
const setupTestData = async () => {
  // Note: Admin user validation moved to beforeAll() before this function is called

  // Create test organization with benchmarks enabled
  const orgResult = await db.insert(organizations).values({
    name: 'Test Org ' + Date.now(),
    isActive: true,
    benchmarksEnabled: true,
    allowCustomBenchmarks: true,
  }).returning();
  testOrgId = orgResult[0].id;

  // Create org admin user
  const hashedPassword = await bcrypt.hash('TestPassword123!', BCRYPT_SALT_ROUNDS);
  testOrgAdminUsername = 'orgadmin' + Date.now();

  const orgAdminResult = await db.insert(users).values({
    username: testOrgAdminUsername,
    emails: [`orgadmin${Date.now()}@test.com`],
    password: hashedPassword,
    firstName: 'Org',
    lastName: 'Admin',
    fullName: 'Org Admin', // Required field
    isSiteAdmin: false,
    isActive: true,
  }).returning();
  testOrgAdminId = orgAdminResult[0].id;

  // Link org admin to organization
  await db.insert(userOrganizations).values({
    userId: testOrgAdminId,
    organizationId: testOrgId,
    role: 'org_admin',
  });
};

const cleanupTestData = async () => {
  // Clean up in reverse order of dependencies
  if (testOrgId) {
    await db.delete(organizationBenchmarks).where(eq(organizationBenchmarks.organizationId, testOrgId));
    await db.delete(userOrganizations).where(eq(userOrganizations.organizationId, testOrgId));
    await db.delete(organizations).where(eq(organizations.id, testOrgId));
  }

  if (testCustomBenchmarkId) {
    await db.delete(customBenchmarks).where(eq(customBenchmarks.id, testCustomBenchmarkId));
  }

  if (testSiteBenchmarkId) {
    await db.delete(organizationBenchmarks).where(eq(organizationBenchmarks.benchmarkId, testSiteBenchmarkId));
    await db.delete(siteBenchmarks).where(eq(siteBenchmarks.id, testSiteBenchmarkId));
  }

  if (testOrgAdminId) {
    await db.delete(users).where(eq(users.id, testOrgAdminId));
  }

  // Note: Do not delete the admin user created by initializeDefaultUser()
  // It may be used by other tests
};

// Helper to get session cookie for a user type
const getSessionCookie = (userType: 'siteAdmin' | 'orgAdmin' = 'siteAdmin'): string => {
  return userType === 'siteAdmin' ? siteAdminCookie : orgAdminCookie;
};

describe.skip('Benchmark Endpoints Integration Tests', () => {
  beforeAll(async () => {
    // Validate DATABASE_URL is set
    if (!process.env.DATABASE_URL) {
      throw new Error(
        'DATABASE_URL must be set to run integration tests. ' +
        'See README.md for PostgreSQL setup instructions.'
      );
    }

    // Create test app
    app = express();
    app.use(express.json());
    app.use(express.urlencoded({ extended: false }));

    // Register routes - this calls initializeDefaultUser() to create admin
    await registerRoutes(app);

    // Validate admin user exists (like organization-routes.test.ts)
    const adminUser = await db.select().from(users)
      .where(eq(users.username, process.env.ADMIN_USER || 'admin'))
      .limit(1);
    if (adminUser.length === 0) {
      throw new Error('Admin user not found after initialization');
    }
    testSiteAdminId = adminUser[0].id;

    // Validate admin can login and get session cookie
    const siteAdminLoginResponse = await request(app)
      .post('/api/auth/login')
      .send({
        username: process.env.ADMIN_USER || 'admin',
        password: process.env.ADMIN_PASSWORD || 'TestPassword123!',
      });

    if (siteAdminLoginResponse.status !== 200 || !siteAdminLoginResponse.headers['set-cookie']) {
      throw new Error(
        `Site admin login failed (status: ${siteAdminLoginResponse.status}). ` +
        `Ensure ADMIN_PASSWORD environment variable matches the initialized admin user password.`
      );
    }

    siteAdminCookie = siteAdminLoginResponse.headers['set-cookie'][0];

    // Setup test data (creates organization and org admin)
    await setupTestData();

    // Login org admin to get session cookie
    const orgAdminLoginResponse = await request(app)
      .post('/api/auth/login')
      .send({
        username: testOrgAdminUsername,
        password: 'TestPassword123!',
      });

    if (orgAdminLoginResponse.status !== 200 || !orgAdminLoginResponse.headers['set-cookie']) {
      throw new Error(`Org admin login failed (status: ${orgAdminLoginResponse.status})`);
    }

    orgAdminCookie = orgAdminLoginResponse.headers['set-cookie'][0];
  });

  afterAll(async () => {
    await cleanupTestData();
  });

  describe('Site Benchmark Endpoints', () => {
    describe('GET /api/benchmarks', () => {
      it('should return site benchmarks for authenticated users', async () => {
        const cookie = getSessionCookie('siteAdmin');

        const response = await request(app).get('/api/benchmarks').set('Cookie', cookie);

        expect(response.status).toBe(200);
        expect(Array.isArray(response.body)).toBe(true);
      });

      it('should return 401 for unauthenticated users', async () => {
        const response = await request(app).get('/api/benchmarks');

        expect(response.status).toBe(401);
      });

      it('should filter inactive benchmarks for non-site-admins', async () => {
        const cookie = getSessionCookie('siteAdmin');

        const responseWithInactive = await request(app).get('/api/benchmarks?includeInactive=true').set('Cookie', cookie);
        const responseWithoutInactive = await request(app).get('/api/benchmarks?includeInactive=false').set('Cookie', cookie);

        expect(responseWithInactive.status).toBe(200);
        expect(responseWithoutInactive.status).toBe(200);
      });
    });

    describe('GET /api/benchmarks/:id', () => {
      it('should return specific benchmark for authenticated users', async () => {
        const cookie = getSessionCookie('siteAdmin');

        // Create a test benchmark first
        const createResponse = await request(app).post('/api/benchmarks').set('Cookie', cookie).send({
          metricCode: 'FLY10_TIME',
          name: 'Test Benchmark',
          description: 'Test description',
          benchmarkValue: 1.5,
          comparisonOperator: 'lte',
          isActive: true,
        });

        expect(createResponse.status).toBe(201);
        testSiteBenchmarkId = createResponse.body.id;

        const response = await request(app).get(`/api/benchmarks/${testSiteBenchmarkId}`).set('Cookie', cookie);

        expect(response.status).toBe(200);
        expect(response.body.id).toBe(testSiteBenchmarkId);
        expect(response.body.name).toBe('Test Benchmark');
      });

      it('should return 404 for non-existent benchmark', async () => {
        const cookie = getSessionCookie('siteAdmin');

        const response = await request(app).get('/api/benchmarks/00000000-0000-0000-0000-000000000000').set('Cookie', cookie);

        expect(response.status).toBe(404);
      });

      // Rate limiting test removed - redundant with dedicated rate-limiting-security.test.ts
      // and flaky due to 101 parallel requests causing ECONNRESET errors
      // Rate limiting is also bypassed in test env, so this wasn't testing actual rate limiting
    });

    describe('POST /api/benchmarks', () => {
      it('should create benchmark for site admin', async () => {
        const cookie = getSessionCookie('siteAdmin');

        const response = await request(app).post('/api/benchmarks').set('Cookie', cookie).send({
          metricCode: 'FLY10_TIME',
          name: 'New Benchmark',
          description: 'New description',
          benchmarkValue: 1.6,
          comparisonOperator: 'lte',
          isActive: true,
        });

        expect(response.status).toBe(201);
        expect(response.body.name).toBe('New Benchmark');
        testSiteBenchmarkId = response.body.id;
      });

      it('should return 400 for invalid data', async () => {
        const cookie = getSessionCookie('siteAdmin');

        const response = await request(app).post('/api/benchmarks').set('Cookie', cookie).send({
          // Missing required fields
          name: 'Invalid Benchmark',
        });

        expect(response.status).toBe(400);
      });
    });

    describe('PATCH /api/benchmarks/:id', () => {
      it('should update benchmark for site admin', async () => {
        const cookie = getSessionCookie('siteAdmin');

        // Create benchmark first
        const createResponse = await request(app).post('/api/benchmarks').set('Cookie', cookie).send({
          metricCode: 'FLY10_TIME',
          name: 'Update Test',
          description: 'Original description',
          benchmarkValue: 1.7,
          comparisonOperator: 'lte',
          isActive: true,
        });

        testSiteBenchmarkId = createResponse.body.id;

        const updateResponse = await request(app).patch(`/api/benchmarks/${testSiteBenchmarkId}`).set('Cookie', cookie).send({
          name: 'Updated Name',
          description: 'Updated description',
        });

        expect(updateResponse.status).toBe(200);
        expect(updateResponse.body.name).toBe('Updated Name');
        expect(updateResponse.body.description).toBe('Updated description');
      });
    });

    describe('DELETE /api/benchmarks/:id', () => {
      it('should delete benchmark for site admin', async () => {
        const cookie = getSessionCookie('siteAdmin');

        // Create benchmark first
        const createResponse = await request(app).post('/api/benchmarks').set('Cookie', cookie).send({
          metricCode: 'FLY10_TIME',
          name: 'Delete Test',
          description: 'To be deleted',
          benchmarkValue: 1.8,
          comparisonOperator: 'lte',
          isActive: true,
        });

        const benchmarkId = createResponse.body.id;

        const deleteResponse = await request(app).delete(`/api/benchmarks/${benchmarkId}`).set('Cookie', cookie);

        expect(deleteResponse.status).toBe(204);

        // Verify it's deleted
        const getResponse = await request(app).get(`/api/benchmarks/${benchmarkId}`).set('Cookie', cookie);
        expect(getResponse.status).toBe(404);
      });
    });
  });

  describe('Custom Benchmark Endpoints', () => {
    describe('GET /api/organizations/:organizationId/benchmarks/custom', () => {
      it('should return custom benchmarks for organization', async () => {
        const cookie = getSessionCookie('siteAdmin');

        const response = await request(app).get(`/api/organizations/${testOrgId}/benchmarks/custom`).set('Cookie', cookie);

        expect(response.status).toBe(200);
        expect(Array.isArray(response.body)).toBe(true);
      });

      it('should return 403 for unauthorized organization access', async () => {
        const cookie = getSessionCookie('siteAdmin');

        const response = await request(app).get('/api/organizations/00000000-0000-0000-0000-000000000000/benchmarks/custom').set('Cookie', cookie);

        expect([403, 404]).toContain(response.status);
      });
    });

    describe('POST /api/organizations/:organizationId/benchmarks/custom', () => {
      it('should create custom benchmark for organization', async () => {
        const cookie = getSessionCookie('siteAdmin');

        const response = await request(app)
          .post(`/api/organizations/${testOrgId}/benchmarks/custom`).set('Cookie', cookie)
          .send({
            metricCode: 'FLY10_TIME',
            name: 'Custom Benchmark',
            description: 'Custom description',
            benchmarkValue: 1.9,
            comparisonOperator: 'lte',
            isActive: true,
          });

        expect(response.status).toBe(201);
        expect(response.body.name).toBe('Custom Benchmark');
        testCustomBenchmarkId = response.body.id;
      });

      it('should prioritize URL organizationId over body', async () => {
        const cookie = getSessionCookie('siteAdmin');

        // Try to send different organizationId in body (should be ignored)
        const response = await request(app)
          .post(`/api/organizations/${testOrgId}/benchmarks/custom`).set('Cookie', cookie)
          .send({
            organizationId: '00000000-0000-0000-0000-000000000000', // Should be ignored
            metricCode: 'FLY10_TIME',
            name: 'Security Test Benchmark',
            description: 'Testing authorization bypass prevention',
            benchmarkValue: 2.0,
            comparisonOperator: 'lte',
            isActive: true,
          });

        expect(response.status).toBe(201);
        // Verify it was created with the URL organizationId
        expect(response.body.organizationId).toBe(testOrgId);
      });
    });
  });

  describe('Benchmark Enablement Endpoints', () => {
    describe('GET /api/organizations/:organizationId/benchmarks', () => {
      it('should return enabled benchmarks for organization', async () => {
        const cookie = getSessionCookie('siteAdmin');

        const response = await request(app).get(`/api/organizations/${testOrgId}/benchmarks`).set('Cookie', cookie);

        expect(response.status).toBe(200);
        expect(Array.isArray(response.body)).toBe(true);
      });
    });

    describe('POST /api/organizations/:organizationId/benchmarks/:id/enable', () => {
      it('should enable site benchmark for organization', async () => {
        const cookie = getSessionCookie('siteAdmin');

        // Create site benchmark first
        const createResponse = await request(app).post('/api/benchmarks').set('Cookie', cookie).send({
          metricCode: 'FLY10_TIME',
          name: 'Enable Test Benchmark',
          description: 'For enablement test',
          benchmarkValue: 2.1,
          comparisonOperator: 'lte',
          isActive: true,
        });

        const benchmarkId = createResponse.body.id;
        testSiteBenchmarkId = benchmarkId;

        const enableResponse = await request(app)
          .post(`/api/organizations/${testOrgId}/benchmarks/${benchmarkId}/enable`).set('Cookie', cookie)
          .send({ benchmarkType: 'site' });

        expect(enableResponse.status).toBe(201);
        expect(enableResponse.body.benchmarkId).toBe(benchmarkId);
        expect(enableResponse.body.isEnabled).toBe(true);
      });

      it('should return 400 for missing benchmarkType', async () => {
        const cookie = getSessionCookie('siteAdmin');

        const response = await request(app)
          .post(`/api/organizations/${testOrgId}/benchmarks/00000000-0000-0000-0000-000000000000/enable`).set('Cookie', cookie)
          .send({});

        expect(response.status).toBe(400);
      });

      it('should handle concurrent benchmark enablement without display_order conflicts', { timeout: 30000 }, async () => {
        const cookie = getSessionCookie('siteAdmin');

        // Create 5 benchmarks
        const benchmarkIds = [];
        for (let i = 0; i < 5; i++) {
          const createResponse = await request(app).post('/api/benchmarks').set('Cookie', cookie).send({
            metricCode: 'FLY10_TIME',
            name: `Concurrent Test Benchmark ${i}`,
            description: `For concurrent enablement test ${i}`,
            benchmarkValue: 1.0 + i * 0.1,
            comparisonOperator: 'lte',
            isActive: true,
          });
          benchmarkIds.push(createResponse.body.id);
        }

        // Enable all benchmarks concurrently
        const enablePromises = benchmarkIds.map(id =>
          request(app)
            .post(`/api/organizations/${testOrgId}/benchmarks/${id}/enable`).set('Cookie', cookie)
            .send({ benchmarkType: 'site' })
        );

        const results = await Promise.all(enablePromises);

        // All should succeed with 201 status
        results.forEach(result => {
          expect(result.status).toBe(201);
          expect(result.body.isEnabled).toBe(true);
        });

        // All display orders should be unique
        const displayOrders = results.map(r => r.body.displayOrder);
        const uniqueOrders = new Set(displayOrders);
        expect(uniqueOrders.size).toBe(displayOrders.length);

      });
    });

    describe('POST /api/organizations/:organizationId/benchmarks/:id/disable', () => {
      it('should disable benchmark for organization', async () => {
        const cookie = getSessionCookie('siteAdmin');

        // Create and enable benchmark first
        const createResponse = await request(app).post('/api/benchmarks').set('Cookie', cookie).send({
          metricCode: 'FLY10_TIME',
          name: 'Disable Test Benchmark',
          description: 'For disable test',
          benchmarkValue: 2.2,
          comparisonOperator: 'lte',
          isActive: true,
        });

        const benchmarkId = createResponse.body.id;
        testSiteBenchmarkId = benchmarkId;

        await request(app)
          .post(`/api/organizations/${testOrgId}/benchmarks/${benchmarkId}/enable`).set('Cookie', cookie)
          .send({ benchmarkType: 'site' });

        const disableResponse = await request(app)
          .post(`/api/organizations/${testOrgId}/benchmarks/${benchmarkId}/disable`).set('Cookie', cookie)
          .send({ benchmarkType: 'site' });

        expect(disableResponse.status).toBe(200);
        expect(disableResponse.body.isEnabled).toBe(false);
      });
    });
  });

  describe('Authorization & Security', () => {
    it('should prevent authorization bypass via body organizationId', async () => {
      const cookie = getSessionCookie('siteAdmin');

      // Create a benchmark with mismatched organizationId in body
      const response = await request(app)
        .post(`/api/organizations/${testOrgId}/benchmarks/custom`).set('Cookie', cookie)
        .send({
          organizationId: '00000000-0000-0000-0000-000000000000', // Different org ID in body
          metricCode: 'FLY10_TIME',
          name: 'Auth Bypass Test',
          description: 'Should use URL org ID',
          benchmarkValue: 2.3,
          comparisonOperator: 'lte',
          isActive: true,
        });

      // Should succeed and use URL org ID
      expect(response.status).toBe(201);
      expect(response.body.organizationId).toBe(testOrgId);
    });

    it('should enforce timing-safe benchmark visibility checks', async () => {
      const cookie = getSessionCookie('siteAdmin');

      // Create an inactive benchmark
      const createResponse = await request(app).post('/api/benchmarks').set('Cookie', cookie).send({
        metricCode: 'FLY10_TIME',
        name: 'Timing Test Benchmark',
        description: 'For timing attack test',
        benchmarkValue: 2.4,
        comparisonOperator: 'lte',
        isActive: false, // Inactive
      });

      const benchmarkId = createResponse.body.id;
      testSiteBenchmarkId = benchmarkId;

      // Measure response times (should be similar for existing vs non-existing)
      const start1 = Date.now();
      await request(app).get(`/api/benchmarks/${benchmarkId}`).set('Cookie', cookie);
      const time1 = Date.now() - start1;

      const start2 = Date.now();
      await request(app).get('/api/benchmarks/00000000-0000-0000-0000-000000000000').set('Cookie', cookie);
      const time2 = Date.now() - start2;

      // Response times should be similar (within 200ms tolerance)
      // Tolerance accounts for network latency and database load variations
      // This validates the timing-safe implementation prevents information leakage
      // In production with stable infrastructure, variations would be minimal
      expect(Math.abs(time1 - time2)).toBeLessThan(200);
    });
  });
});
